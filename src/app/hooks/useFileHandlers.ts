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

import { Dispatch, SetStateAction, useState, useRef } from 'react';
import { SeqRecord, SelectionArea } from '@/src/domain/bio/types';
import { detectMoleculeType, classifyLocusMoleculeType, getOriginalPos, isProteinSession, sliceRecordsBySelection } from '@/src/domain/bio';
import { serializeExport, EXPORT_EXTENSION, type HubExportFormat, type ExportOptions } from '@/src/app/logic/exportPlan';
import { exportToFasta } from '@/src/core/formats/fasta';
import { downloadBlob } from '@/src/app/lib/download';
import { takeFiles, readFileAsText, postToWorker, dispatchFile, type WorkerUploadDeps } from '@/src/app/logic/upload';

import { parseProject, serializeProject } from '@/src/app/logic/projectFile';
import { routeDroppedFiles, importDroppedBatch } from '@/src/app/logic/dropRouting';
import type { BioWorkerRequest, BioWorkerResponse } from '@/src/workers/protocol';

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
  onWorkspaceReplaced?: () => void;
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
  handleDroppedFiles: (files: File[]) => Promise<void>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAlignmentUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAnnotationUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleProjectUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleExportRecord: (recordId: string) => void;
  exportRecords: (ids: string[], format: HubExportFormat, options?: ExportOptions) => void;
  exportSelection: () => void;
  exportSelectionJson: () => void;
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
  isAlignmentLocked: () => boolean = () => false,
  dropImport?: { getWorkspaceRevision?: () => number; getRecords: () => SeqRecord[]; requestBio: (request: BioWorkerRequest, shouldCommit?: () => boolean) => Promise<BioWorkerResponse | 'stale'>; readText?: (file: File) => Promise<string> },
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
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const dropQueue = useRef(Promise.resolve());
  const workspaceRevision = useRef(0);

  const promptForProjectName = () => {
    const input = window.prompt('Project name (required):', projectName);
    if (input === null) return null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    setProjectName(trimmed);
    return trimmed;
  };

  // ── Upload handlers ───────────────────────────────────────────────────────

  // Shared plumbing: read a file, dispatch to the worker, and always settle the
  // processing flag on failure (unreadable file, absent worker) so the
  // ProcessingOverlay can never hang. See logic/upload.ts.
  const workerDeps: WorkerUploadDeps = {
    readText: readFileAsText,
    postToWorker: request => postToWorker(bioWorkerRef.current, request),
    setProcessing: setIsProcessing,
    addLog,
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isAlignmentLocked()) return;
    const files = takeFiles(e.target);
    if (files.length === 0) return;
    setIsProcessing(true);
    addLog(`Ingesting batch: ${files.length} file(s).`);
    files.forEach(file =>
      dispatchFile(file, content => {
        if (isAlignmentLocked()) { setIsProcessing(false); return null; }
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
            return null;
          }
        }
        return isFasta ? { type: 'PARSE_FASTA', filename: file.name, content } : { type: 'PARSE_GENBANK', filename: file.name, content };
      }, workerDeps),
    );
  };

  const handleAlignmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isAlignmentLocked()) return;
    const [file] = takeFiles(e.target);
    if (!file || records.length === 0) return;
    setIsProcessing(true);
    addLog(`Importing external alignment: ${file.name}`);
    dispatchFile(file, content => {
      if (isAlignmentLocked()) { setIsProcessing(false); return null; }
      const incoming = sniffFastaCategory(content);
      const loaded = getLoadedCategory(records);
      if (incoming !== loaded) {
        setMoleculeTypeMismatch({ incoming, loaded, fileName: file.name });
        addLog(
          `Cannot import ${incoming === 'protein' ? 'peptide' : 'nucleotide'} alignment "${file.name}": session contains ${loaded === 'protein' ? 'peptide' : 'nucleotide'} sequences.`,
        );
        setIsProcessing(false);
        return null;
      }
      return { type: 'PARSE_FASTA', filename: file.name, content, asAlignment: true };
    }, workerDeps);
  };

  const handleAnnotationUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = takeFiles(e.target);
    if (files.length === 0 || records.length === 0) return;
    setIsProcessing(true);
    addLog(`Importing annotations from ${files.length} files...`);
    files.forEach(file =>
      dispatchFile(
        file,
        content => ({ type: 'PARSE_ANNOTATIONS', filename: file.name, content }),
        workerDeps,
      ),
    );
  };

  const loadProjectFile = (file: File): Promise<void> => {
    if (isAlignmentLocked()) return Promise.resolve();
    setIsProcessing(true);
    addLog(`Loading project: ${file.name}`);
    return (dropImport?.readText ?? readFileAsText)(file)
      .then(text => {
        if (isAlignmentLocked()) { setIsProcessing(false); return; }
        const parsed = parseProject(text);
        if (!parsed.ok) { addLog(parsed.message); return; }
        const project = parsed.project;
        workspaceRevision.current++;
        setters.onWorkspaceReplaced?.();
        setRecords(project.records.map(r => ({ ...r, visible: r.visible ?? true })));
        setFeatureColors(project.featureColors);
        setActiveSelection(project.activeSelection ?? null);
        setShowAnnotations(project.showAnnotations);
        setShowTranslation(project.showTranslation);
        setShowConservation(project.showConservation);
        if (project.name?.trim()) setProjectName(project.name.trim());
        addLog('Project loaded successfully.');
      })
      .catch(err => {
        addLog(`Could not read project file "${file.name}": ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => setIsProcessing(false));
  };

  const handleProjectUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isAlignmentLocked()) return;
    const [file] = takeFiles(e.target);
    if (file) void loadProjectFile(file);
  };

  const handleDroppedFiles = (files: File[]): Promise<void> => {
    if (isAlignmentLocked() || files.length === 0) return Promise.resolve();
    const route = routeDroppedFiles(files);
    if (route.kind === 'refused') {
      addLog(route.reason);
      return Promise.resolve();
    }
    const run = async () => {
      if (isAlignmentLocked()) return;
      if (route.kind === 'project') {
        if (window.confirm('Load this project and replace the workspace?')) await loadProjectFile(route.file);
        return;
      }
      const getRevision = () => dropImport?.getWorkspaceRevision?.() ?? workspaceRevision.current;
      const revision = getRevision();
      const shouldCommit = () => getRevision() === revision;
      const checkWorkspace = () => {
        if (!shouldCommit()) throw new Error('Drop cancelled: the workspace was replaced');
      };
      setIsProcessing(true);
      const request = async (message: BioWorkerRequest) => {
        checkWorkspace();
        if (isAlignmentLocked()) throw new Error('Import stopped: alignment is locked.');
        if (!dropImport) throw new Error('The processing worker is unavailable.');
        const response = await dropImport.requestBio(message, shouldCommit);
        if (response === 'stale') throw new Error('Drop cancelled: the workspace was replaced');
        checkWorkspace();
        return response;
      };
      try {
        await importDroppedBatch<File>(route, {
          readText: dropImport?.readText ?? readFileAsText,
          importSequence: async (file, content) => {
            checkWorkspace();
            const currentRecords = dropImport?.getRecords() ?? recordsRef.current;
            const category = currentRecords.length > 0 ? getLoadedCategory(currentRecords) : undefined;
            const isFasta = ['fa', 'fasta'].includes(file.name.split('.').pop()!.toLowerCase());
            const incoming = isFasta ? sniffFastaCategory(content) : sniffGenBankCategory(content);
            if (category && category !== incoming) {
              setMoleculeTypeMismatch({ incoming, loaded: category, fileName: file.name });
              throw new Error(`Cannot load "${file.name}": molecule type differs from the session.`);
            }
            const response = await request({ type: isFasta ? 'PARSE_FASTA' : 'PARSE_GENBANK', filename: file.name, content, ...(isFasta ? { asAlignment: false } : {}) });
            if (response.type !== 'PARSE_SUCCESS' && response.type !== 'FASTA_SUCCESS') throw new Error(`Unexpected sequence response for "${file.name}".`);
            if (!response.idMap) throw new Error(`Missing workspace assignments for "${file.name}".`);
            return response.idMap;
          },
          importAnnotations: async (file, content, idMap) => {
            const response = await request({ type: 'PARSE_ANNOTATIONS', filename: file.name, content, idMap });
            if (response.type !== 'ANNOTATIONS_SUCCESS') throw new Error(`Unexpected annotation response for "${file.name}".`);
          },
        });
      } catch (error) {
        addLog(error instanceof Error ? error.message : String(error));
      } finally { setIsProcessing(false); }
    };
    const pending = dropQueue.current.then(run);
    dropQueue.current = pending;
    return pending;
  };

  // ── Export helpers ────────────────────────────────────────────────────────

  const exportSelection = () => {
    const start = activeSelection ? Math.min(activeSelection.start, activeSelection.end) : undefined;
    const end = activeSelection ? Math.max(activeSelection.start, activeSelection.end) : undefined;
    downloadBlob(
      exportToFasta(records, { residues: 'aligned', header: 'id', slice: start !== undefined && end !== undefined ? { start, end } : undefined }).text,
      activeSelection ? 'selection_export.fasta' : 'msa_export.fasta',
      'text/plain',
    );
    addLog(`${activeSelection ? 'Selection' : 'Full'} FASTA exported.`);
  };

  const exportSelectionJson = () => {
    if (!activeSelection) { addLog('No selection active for JSON export.'); return; }
    const start = Math.min(activeSelection.start, activeSelection.end);
    const end = Math.max(activeSelection.start, activeSelection.end);
    const selectedRecords = records.flatMap(record => {
      const aligned = record.alignedSequence;
      const biologicalStart = aligned ? getOriginalPos(aligned, start) : start;
      const biologicalEnd = aligned ? getOriginalPos(aligned, end) : end;
      return sliceRecordsBySelection([{ ...record, alignedSequence: undefined }], biologicalStart, biologicalEnd)
        .map(sliced => ({
          ...sliced,
          alignedSequence: aligned?.substring(start, end),
          // Source location text cannot describe coordinates rebased to a selection.
          features: sliced.features.map(feature => ({ ...feature, locationString: undefined })),
        }));
    });
    const project = {
      records: selectedRecords,
      featureColors,
      ...viewportState,
      activeSelection: null,
      selectionRange: { start, end },
      version: __APP_VERSION__,
      exportedAt: new Date().toISOString(),
    };
    downloadBlob(
      serializeProject(project),
      `selection_${start}_${end}.json`,
      'application/json',
    );
    addLog(`Selection JSON exported (${start}-${end}).`);
  };

  const handleExportRecord = (recordId: string) => {
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    downloadBlob(
      exportToFasta([record]).text,
      `${record.id.replace(/[^a-z0-9]/gi, '_')}.fasta`,
      'text/plain',
    );
    addLog(`Exported record ${record.id} to FASTA.`);
  };

  const saveProject = (selectedRecords: SeqRecord[]) => {
    const chosenProjectName = promptForProjectName();
    if (!chosenProjectName) {
      addLog('Project save cancelled: a project name is required.');
      return;
    }
    const safeName = chosenProjectName.replace(/[^a-z0-9._-]/gi, '_');
    const project = {
      name: chosenProjectName,
      records: selectedRecords,
      featureColors,
      activeSelection,
      showAnnotations: viewportState.showAnnotations,
      showTranslation: viewportState.showTranslation,
      showConservation: viewportState.showConservation,
      version: __APP_VERSION__,
    };
    downloadBlob(serializeProject(project), `${safeName || 'dunceious_project'}.json`, 'application/json');
    addLog('Project JSON exported.');
  };

  const exportProjectJson = () => saveProject(records);
  const exportRecords = (ids: string[], format: HubExportFormat, options: ExportOptions = {}) => {
    const requested = new Set(ids);
    const subset = records.filter(record => requested.has(record.id));
    if (!subset.length) return;
    try {
      const result = serializeExport(subset, format, { ...options,
        projectState: { featureColors, ...viewportState, activeSelection: null, name: options.fileName?.replace(/\.json$/i, ''), version: __APP_VERSION__ },
      });
      downloadBlob(result.text, options.fileName ?? `sequences.${EXPORT_EXTENSION[format]}`, format === 'project' ? 'application/json' : 'text/plain');
      addLog(`Exported ${subset.length} sequences as ${format}.`);
    } catch (error) { addLog(`Export stopped: ${error instanceof Error ? error.message : String(error)}`); }
  };

  return {
    exportRecords,
    handleDroppedFiles,
    handleFileUpload,
    handleAlignmentUpload,
    handleAnnotationUpload,
    handleProjectUpload,
    handleExportRecord,
    exportSelection,
    exportSelectionJson,
    exportProjectJson,
    moleculeTypeMismatch,
    closeMismatchModal: () => setMoleculeTypeMismatch(null),
  };
}
