import { Dispatch, SetStateAction } from 'react';
import { SeqRecord, SelectionArea } from '@/src/domain/bio/types';
import {
  exportToFasta,
  downloadBlob,
  exportToGff,
  exportToGenBank,
  sliceRecordsBySelection,
} from '@/services/bioUtils';
import type { BioWorkerRequest } from '@/src/workers/protocol';

/** Returns 'protein' if the GenBank LOCUS line declares amino-acid units, else 'nucleotide'. */
function sniffGenBankCategory(content: string): 'nucleotide' | 'protein' {
  const match = content.match(/^LOCUS\s+.+$/m);
  if (match && /\baa\b/.test(match[0].toLowerCase())) return 'protein';
  return 'nucleotide';
}

/**
 * Samples the first sequence in a FASTA string to detect its category.
 * Checks for protein-exclusive IUPAC characters (D, E, F, H, I, K, L, M, P, Q, R, S, V, W, Y).
 */
function sniffFastaCategory(content: string): 'nucleotide' | 'protein' {
  const lines = content.split('\n');
  let seq = '';
  let seenHeader = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('>')) {
      if (seenHeader && seq) break;
      seenHeader = true;
    } else if (seenHeader && t) {
      seq += t;
      if (seq.length >= 200) break;
    }
  }
  if (/[DEFHIKLMPQRSVWY]/.test(seq.substring(0, 200).toUpperCase())) return 'protein';
  return 'nucleotide';
}

/** Returns the effective category of the current session's records. */
function getLoadedCategory(records: SeqRecord[]): 'nucleotide' | 'protein' {
  return records.some(r => r.moleculeType === 'protein') ? 'protein' : 'nucleotide';
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
}

/**
 * Provides all file-upload and data-export handlers.
 *
 * Upload handlers delegate parsing to the bioWorker; export helpers use
 * the pure service functions from `@/services/bioUtils`.
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

  // ── Upload handlers ───────────────────────────────────────────────────────

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    setIsProcessing(true);
    addLog(`Ingesting batch: ${files.length} GenBank files.`);
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => {
        const content = ev.target?.result as string;
        if (records.length > 0) {
          const incoming = sniffGenBankCategory(content);
          const loaded = getLoadedCategory(records);
          if (incoming !== loaded) {
            const loadedLabel = loaded === 'protein' ? 'peptide' : 'nucleotide';
            const incomingLabel = incoming === 'protein' ? 'peptide' : 'nucleotide';
            addLog(
              `Cannot load ${incomingLabel} file "${file.name}": session contains ${loadedLabel} sequences. Clear all records first to switch sequence type.`,
            );
            setIsProcessing(false);
            return;
          }
        }
        const request: BioWorkerRequest = { type: 'PARSE_GENBANK', content };
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
        const loadedLabel = loaded === 'protein' ? 'peptide' : 'nucleotide';
        const incomingLabel = incoming === 'protein' ? 'peptide' : 'nucleotide';
        addLog(
          `Cannot import ${incomingLabel} alignment "${file.name}": session contains ${loadedLabel} sequences. Clear all records first to switch sequence type.`,
        );
        setIsProcessing(false);
        return;
      }
      const request: BioWorkerRequest = { type: 'PARSE_FASTA', content };
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
      version: '3.4',
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
    const project = {
      records,
      featureColors,
      activeSelection,
      showAnnotations: viewportState.showAnnotations,
      showTranslation: viewportState.showTranslation,
      showConservation: viewportState.showConservation,
      version: '3.4',
    };
    downloadBlob(JSON.stringify(project, null, 2), 'dunceious_project.json', 'application/json');
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
  };
}
