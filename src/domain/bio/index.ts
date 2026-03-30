export { transposeCoordinates, buildAlignedSegments, processTransposition } from './coordinate';
export { calculateConsensus } from './consensus';
export { clipInterval, clipSegments, splitWrapAround } from './intervals';
export type {
  FeatureSegment,
  BioFeature,
  QuantitativeTrack,
  SeqRecord,
  WorkflowStep,
  AlignmentMode,
  AlignmentParams,
  SearchResult,
  SelectionArea,
  ProjectState,
} from './types';
