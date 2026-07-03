/*
 * Dunceious
 *
 * This file is part of Dunceious.
 *
 * Dunceious is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Dunceious is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Dunceious.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Dispatch, SetStateAction, useState } from 'react';
import { SeqRecord, SelectionArea } from '@/src/domain/bio/types';
import { detectMoleculeType, classifyLocusMoleculeType, isProteinSession, sliceRecordsBySelection } from '@/src/domain/bio';
import { exportToGenBank } from '@/src/core/genbank/serialize';
import { exportToFasta } from '@/src/core/formats/fasta';
import { exportToGff } from '@/src/core/formats/annotations';
import { downloadBlob } from '@/src/app/lib/download';
import type { BioWorkerRequest } from '@/src/workers/protocol';

const FASTA_SAMPLE_MAX_RECORDS = 3;
const FASTA_SAMPLE_MAX_LENGTH = 1200;

/** Returns 'protein' if the GenBank LOCUS line declares amino-acid units, else 'nucleotide'. */
function sniffGenBankCategory(content: string): 'nucleotide' | 'protein' {
  const match = content.match(/^LOCUS\s+.+$/m);
  if (match && classifyLocusMoleculeType(match[0]) === 'protein') return 'protein';
  return 'nucleotide';
}

/**
 * Samples the first few records of a FASTA string and classifies the sample
 * via the canonical `detectMoleculeType` (protein-only alphabet =
 * PROTEIN_ONLY_RESIDUES). RNA maps to 'nucleotide'.
 */
function sniffFastaCategory(content: string): 'nucleotide' | 'protein' {
  const lines = content.split('\n');
  let seq = '';
  let seenHeader = false;
  let sampledRecords = 0;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('>')) {
      if (seenHeader && seq) {
        sampledRecords += 1;
        if (sampledRecords >= FASTA_SAMPLE_MAX_RECORDS || seq.length >= FASTA_SAMPLE_MAX_LENGTH) break;
      }
      seenHeader = true;
      continue;
    } else if (seenHeader && t) {
      seq += t;
      if (seq.length >= FASTA_SAMPLE_MAX_LENGTH) break;
    }
  }

  const sample = seq.toUpperCase().replace(/[^A-Z*-]/g, '');
  if (!sample) return 'nucleotide';
  return detectMoleculeType(sample) === 'protein' ? 'protein' : 'nucleotide';
}

/** Returns the effective category of the current session's records. */
function getLoadedCategory(records: SeqRecord[]): 'nucleotide' | 'protein' {
  return isProteinSession(records) ? 'protein' : 'nucleotide';
}

/** Subset of app state that the project-restore handler needs to write back. */
export interface ProjectSetters {
  setRecords: Dispatch<SetStateAction<SeqRecord[]>>;
  setFeatureColors: Dispatch<SetStateAction<Record<string, string>>>;
  setActiveSelection: Dispatch<SetStateAction<SelectionArea | null>>;
  setShowAnnotations: Dispatch<SetStateAction<boolean>>;
  setShowTranslation: Dispatch<SetStateAction<boolean>>;
  setShowConservation: Dispatch<SetStateAction<boolean>>;
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
}

export interface MoleculeTypeMismatchError {
  incoming: 'nucleotide' | 'protein';
  loaded: 'nucleotide' | 'protein';
  fileName: string;
}

export interface UseFileHandlersReturn {
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAlignmentUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAnnotationUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleProjectUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleExportRecord: (recordId: string) => void;
  exportSelection: () => void;
  exportSelectionJson: () => void;
  exportAllFasta: () => void;
  exportGenBankFile: () => void;
  exportGffFile: () => void;
  exportProjectJson: () => void;
  moleculeTypeMismatch: MoleculeTypeMismatchError | null;
  closeMismatchModal: () => void;
}

/**
 * Provides all file-upload and data-export handlers.
 *
 * Upload handlers delegate parsing to the bio worker; export helpers use
 * the pure serializers in `@/src/core` (`formats`/`genbank`).
 *
 * @param bioWorkerRef   - Ref to the active bioWorker instance.
 * @param records        - Current active records (read-only).
 * @param activeSelection - Current viewport selection used for selection exports.
 * @param featureColors  - Custom colour overrides included in project-JSON exports.
 * @param viewportState  - Display-toggle values included in project-JSON exports.
 * @param setters        - State setters required to restore a loaded project.
 * @param addLog         - Callback to append a timestamped message.
 */
export function useFileHandlers(
  bioWorkerRef: React.MutableRefObject<Worker | null>,
  records: SeqRecord[],
  activeSelection: SelectionArea | null,
  featureColors: Record<string, string>,
  viewportState: { showAnnotations: boolean; showTranslation: boolean; showConservation: boolean },
  setters: ProjectSetters,
  addLog: (msg: string) => void,
): UseFileHandlersReturn {
  const {
    setRecords,
    setFeatureColors,
    setActiveSelection,
    setShowAnnotations,
    setShowTranslation,
    setShowConservation,
    setIsProcessing,
  } = setters;

  const [moleculeTypeMismatch, setMoleculeTypeMismatch] = useState<MoleculeTypeMismatchError | null>(null);
  const [projectName, setProjectName] = useState('dunceious_project');

  const promptForProjectName = () => {
    const input = window.prompt('Project name (required):', projectName);
    if (input === null) return null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    setProjectName(trimmed);
    return trimmed;
  };

  // ── Upload handlers ───────────────────────────────────────────────────────

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setIsProcessing(true);
    addLog(`Ingesting batch: ${files.length} file(s).`);
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const content = ev.target?.result as string;
        const isFasta = content.trimStart().startsWith('>');
        if (records.length > 0) {
          const incoming = isFasta ? sniffFastaCategory(content) : sniffGenBankCategory(content);
          const loaded = getLoadedCategory(records);
          if (incoming !== loaded) {
            setMoleculeTypeMismatch({ incoming, loaded, fileName: file.name });
            addLog(
              `Cannot load ${incoming === 'protein' ? 'peptide' : 'nucleotide'} file "${file.name}": session contains ${loaded === 'protein' ? 'peptide' : 'nucleotide'} sequences.`,
            );
            setIsProcessing(false);
            return;
          }
        }
        const request: BioWorkerRequest = isFasta
          ? { type: 'PARSE_FASTA', content }
          : { type: 'PARSE_GENBANK', content };
        bioWorkerRef.current?.postMessage(request);
      };
      reader.readAsText(file);
    });
  };

  const handleAlignmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || records.length === 0) return;
    setIsProcessing(true);
    addLog(`Importing external alignment: ${file.name}`);
    const reader = new FileReader();
    reader.onload = ev => {
      const content = ev.target?.result as string;
      const incoming = sniffFastaCategory(content);
      const loaded = getLoadedCategory(records);
      if (incoming !== loaded) {
        setMoleculeTypeMismatch({ incoming, loaded, fileName: file.name });
        addLog(
          `Cannot import ${incoming === 'protein' ? 'peptide' : 'nucleotide'} alignment "${file.name}": session contains ${loaded === 'protein' ? 'peptide' : 'nucleotide'} sequences.`,
        );
        setIsProcessing(false);
        return;
      }
      const request: BioWorkerRequest = { type: 'PARSE_FASTA', content, asAlignment: true };
      bioWorkerRef.current?.postMessage(request);
    };
    reader.readAsText(file);
  };

  const handleAnnotationUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || records.length === 0) return;
    setIsProcessing(true);
    addLog(`Importing annotations from ${files.length} files...`);
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const request: BioWorkerRequest = {
          type: 'PARSE_ANNOTATIONS',
          filename: file.name,
          content: ev.target?.result as string,
        };
        bioWorkerRef.current?.postMessage(request);
      };
      reader.readAsText(file);
    });
  };

  const handleProjectUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    addLog(`Loading project: ${file.name}`);
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const project = JSON.parse(ev.target?.result as string) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (project.records)
          setRecords(project.records.map((r: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
            ...r,
            visible: r.visible !== undefined ? r.visible : true,
          })));
        if (project.featureColors) setFeatureColors(project.featureColors);
        if (project.activeSelection) setActiveSelection(project.activeSelection);
        if (project.showAnnotations !== undefined) setShowAnnotations(project.showAnnotations);
        if (project.showTranslation !== undefined) setShowTranslation(project.showTranslation);
        if (project.showConservation !== undefined) setShowConservation(project.showConservation);
        if (typeof project.name === 'string' && project.name.trim()) setProjectName(project.name.trim());
        addLog('Project loaded successfully.');
      } catch (err) {
        addLog(`Error loading project: ${err}`);
      }
      setIsProcessing(false);
    };
    reader.readAsText(file);
  };

  // ── Export helpers ────────────────────────────────────────────────────────

  const exportSelection = () => {
    const start = activeSelection ? Math.min(activeSelection.start, activeSelection.end) : undefined;
    const end = activeSelection ? Math.max(activeSelection.start, activeSelection.end) : undefined;
    downloadBlob(
      exportToFasta(records, start, end),
      activeSelection ? 'selection_export.fasta' : 'msa_export.fasta',
      'text/plain',
    );
    addLog(`${activeSelection ? 'Selection' : 'Full'} FASTA exported.`);
  };

  const exportSelectionJson = () => {
    if (!activeSelection) { addLog('No selection active for JSON export.'); return; }
    const start = Math.min(activeSelection.start, activeSelection.end);
    const end = Math.max(activeSelection.start, activeSelection.end);
    const project = {
      records: sliceRecordsBySelection(records, start, end),
      featureColors,
      selectionRange: { start, end },
      version: __APP_VERSION__,
      exportedAt: new Date().toISOString(),
    };
    downloadBlob(
      JSON.stringify(project, null, 2),
      `selection_${start}_${end}.json`,
      'application/json',
    );
    addLog(`Selection JSON exported (${start}-${end}).`);
  };

  const exportAllFasta = () => {
    downloadBlob(exportToFasta(records), 'all_sequences.fasta', 'text/plain');
    addLog('Full FASTA (all records) exported.');
  };

  const handleExportRecord = (recordId: string) => {
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    downloadBlob(
      exportToFasta([record]),
      `${record.id.replace(/[^a-z0-9]/gi, '_')}.fasta`,
      'text/plain',
    );
    addLog(`Exported record ${record.id} to FASTA.`);
  };

  const exportGenBankFile = () => {
    downloadBlob(exportToGenBank(records), 'sequences_with_features.gb', 'text/plain');
    addLog('GenBank file exported (includes new features).');
  };

  const exportGffFile = () => {
    downloadBlob(exportToGff(records), 'annotations.gff', 'text/plain');
    addLog('GFF3 exported.');
  };

  const exportProjectJson = () => {
    const chosenProjectName = promptForProjectName();
    if (!chosenProjectName) {
      addLog('Project save cancelled: a project name is required.');
      return;
    }
    const safeName = chosenProjectName.replace(/[^a-z0-9._-]/gi, '_');
    const project = {
      name: chosenProjectName,
      records,
      featureColors,
      activeSelection,
      showAnnotations: viewportState.showAnnotations,
      showTranslation: viewportState.showTranslation,
      showConservation: viewportState.showConservation,
      version: __APP_VERSION__,
    };
    downloadBlob(JSON.stringify(project, null, 2), `${safeName || 'dunceious_project'}.json`, 'application/json');
    addLog('Project JSON exported.');
  };

  return {
    handleFileUpload,
    handleAlignmentUpload,
    handleAnnotationUpload,
    handleProjectUpload,
    handleExportRecord,
    exportSelection,
    exportSelectionJson,
    exportAllFasta,
    exportGenBankFile,
    exportGffFile,
    exportProjectJson,
    moleculeTypeMismatch,
    closeMismatchModal: () => setMoleculeTypeMismatch(null),
  };
}
