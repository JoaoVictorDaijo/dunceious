/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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

import { useCallback, useMemo } from 'react';
import type { SeqRecord } from '@/src/domain/bio/types';
import { activeComparison, canCompare, comparisonCandidates, resolveReference, withReference } from '@/src/app/logic/alignmentComparison';
import { deriveAlignmentState } from '@/src/app/logic/viewModel';
import type { ViewSettings } from './useViewSettings';

/** Alignment facts and the reference comparison derived from the records. */
export function useComparisonView(records: SeqRecord[], view: ViewSettings, isProteinSession: boolean) {
  const { alignmentComparison, setAlignmentComparison } = view;
  const { alignmentLength, sessionMoleculeType } = useMemo(
    () => deriveAlignmentState(records, isProteinSession),
    [records, isProteinSession],
  );
  const comparable = useMemo(() => canCompare(records), [records]);
  const candidates = useMemo(() => comparisonCandidates(records), [records]);
  const comparisonReference = useMemo(
    () => (comparable ? resolveReference(records, alignmentComparison.referenceId) : null),
    [comparable, records, alignmentComparison.referenceId],
  );
  const comparison = useMemo(
    () => activeComparison(records, alignmentComparison, isProteinSession),
    [records, alignmentComparison, isProteinSession],
  );
  const setComparisonReference = useCallback(
    (referenceId: string) => setAlignmentComparison(prev => withReference(prev, referenceId)),
    [setAlignmentComparison],
  );
  return { alignmentLength, sessionMoleculeType, comparable, candidates, comparisonReference, comparison, setComparisonReference };
}
