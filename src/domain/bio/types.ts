
export interface FeatureSegment {
  start: number;
  end: number;
}

export interface BioFeature {
  type: string;
  name: string;
  start: number;
  end: number;
  strand: 1 | -1;
  color?: string;
  metadata?: Record<string, string>;
  translation?: string;
  segments?: FeatureSegment[];
  locationString?: string;
}

export interface QuantitativeTrack {
  id: string;
  name: string;
  kind?: 'line' | 'interval';
  data: { start: number; end: number; value: number }[];
  color?: string;
}

export interface SeqRecord {
  id: string;
  name: string;
  definition?: string;
  accession?: string;
  sequence: string;
  moleculeType?: 'dna' | 'rna' | 'protein';
  features: BioFeature[];
  tracks?: QuantitativeTrack[];
  alignedSequence?: string;
  isCircular?: boolean;
  metadata?: Record<string, any>;
  visible?: boolean;
}

export enum WorkflowStep {
  INGESTION = 'Ingestion',
  ALIGNMENT = 'Alignment',
  TRANSPOSITION = 'Transposition',
  VISUALIZATION = 'Visualization'
}

export type AlignmentMode = 'auto' | 'FFT-NS-1' | 'FFT-NS-2' | 'L-INS-i' | 'E-INS-i' | 'G-INS-i';

export interface AlignmentParams {
  algorithm: 'mafft' | 'muscle';
  mode: AlignmentMode;
  gapOpeningPenalty: number;
  gapExtensionPenalty: number;
  maxIterations: number;
  matrix: 'BLOSUM62' | 'PAM30' | 'PAM70';
  threadCount: number;
}

export interface SearchResult {
  start: number;
  end: number;
  sequence: string;
  recordId: string;
  strand: 1 | -1;
  score?: number;
  segments?: FeatureSegment[];
}

export interface SelectionArea {
  start: number;
  end: number;
  recordIds: string[];
}

export interface ProjectState {
  records: SeqRecord[];
  featureColors: Record<string, string>;
  activeSelection: SelectionArea | null;
  showAnnotations: boolean;
  showTranslation: boolean;
  showConservation: boolean;
  version: string;
}

export const DEFAULT_PARAMS: AlignmentParams = {
  algorithm: 'mafft',
  mode: 'auto',
  gapOpeningPenalty: 1.53,
  gapExtensionPenalty: 0.123,
  maxIterations: 1000,
  matrix: 'BLOSUM62',
  threadCount: 4,
};
