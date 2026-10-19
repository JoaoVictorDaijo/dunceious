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

import { useCallback, useMemo, useState } from 'react';
import type { ComparisonMenuProps } from '@/src/app/components/ComparisonMenu';
import {
  DEFAULT_ALIGNMENT_COMPARISON,
  activeComparison,
  canCompare,
  comparisonCandidates,
  resolveReference,
  withReference,
  type AlignmentComparisonSettings,
} from '@/src/app/logic/alignmentComparison';
import type { SeqRecord } from '@/src/domain/bio/types';

/**
 * App's comparison wiring over the sample alignment: the settings the menu edits,
 * what the sequence rows draw, and the reference a row header can claim. The menu is
 * null when the session has fewer than two aligned rows, as in the workbench.
 */
export function useShowroomComparison(records: SeqRecord[], isProtein: boolean): {
  menu: Omit<ComparisonMenuProps, 'compact' | 'arrive'> | null;
  comparison: ReturnType<typeof activeComparison>;
  setReference: ((id: string) => void) | undefined;
} {
  const [settings, setSettings] = useState<AlignmentComparisonSettings>(DEFAULT_ALIGNMENT_COMPARISON);
  const comparable = useMemo(() => canCompare(records), [records]);
  const candidates = useMemo(() => comparisonCandidates(records), [records]);
  const reference = useMemo(
    () => (comparable ? resolveReference(records, settings.referenceId) : null),
    [comparable, records, settings.referenceId],
  );
  const comparison = useMemo(
    () => activeComparison(records, settings, isProtein),
    [records, settings, isProtein],
  );
  const setReference = useCallback(
    (referenceId: string) => setSettings(previous => withReference(previous, referenceId)),
    [],
  );

  return {
    menu: comparable ? { settings, onChange: setSettings, reference, candidates } : null,
    comparison,
    setReference: comparable ? setReference : undefined,
  };
}
