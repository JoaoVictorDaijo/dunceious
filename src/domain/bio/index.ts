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

export { transposeCoordinates, transposeInterval, buildAlignedSegments, processTransposition } from './coordinate';
export { calculateConsensus } from './consensus';
export { compareToReference } from './referenceComparison';
export type { ResidueComparison, ComparisonAlphabet } from './referenceComparison';
export { clipInterval, clipSegments, splitWrapAround, sliceRecordsBySelection } from './intervals';
export {
  reverseComplement,
  complementAlphabet,
  translateSequence,
  isNcbiGeneticCode,
  featureTranslTable,
  extractFeatureSequence,
  extractCodingSequence,
  detectEarlyStop,
  translateFeature,
  isFeatureBroken,
  PROTEIN_ONLY_RESIDUES,
  detectMoleculeType,
  classifyLocusMoleculeType,
  removeGapsWithMap,
  mapUngappedRangeToAligned,
  getOriginalPos,
  alignedToOriginalPositions,
  isProteinSession,
} from './sequence';

export { buildAlignedSegments as getNonGapSegments } from './coordinate';
export type {
  DetailKey,
  SequenceDetails,
  FeatureSegment,
  BioFeature,
  QuantitativeTrack,
  SeqRecord,
  SearchResult,
  SearchableRecord,
  SelectionArea,
} from './types';

export { getFeatureStrand } from './strand';
export { segmentFrameshifts } from './frameshift';
export type { FrameShift, SegmentFrameshift } from './frameshift';

export { DETAIL_QUALIFIER, readDetails, writeDetails, isDetailEdited, validateDetail } from './details';
export { INSDC_COUNTRIES, INSDC_MISSING_TERMS } from './insdcVocabulary';
export { isSourceFeature, annotationFeatures, isUnannotated, isPartial, isEdited, needsAttention, isolateOf } from './recordStatus';

export { featureEnvelope } from './featureEnvelope';

export { parseCigar, formatCigar, cigarSpans, expandCigar } from './cigar';
export type { CigarOp } from './cigar';
