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

import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { HubFocusOrigin } from '@/src/app/components/AnnotationHubPanel';
import { useHubState } from '@/src/app/hooks/useHubState';
import { featureIndexOf } from '@/src/app/logic/featureIndex';
import type { FocusTarget } from '@/src/app/logic/focusTarget';
import type { BioFeature, SelectionArea, SeqRecord } from '@/src/domain/bio/types';

export type ShowroomTab = 'alignment' | 'features';

/**
 * App's view wiring without the workbench's state owners: which workspace the
 * showroom shows, the Hub's own state, the trip from a hub row to the viewport and
 * back, and the record whose details are open. The workspace keeps the selection, so
 * its setter comes in rather than being duplicated here.
 *
 * `transposedRecords` is optional only because details is the one caller that needs
 * it: the viewer hands back aligned feature copies, which exist in no other list.
 */
export function useShowroomView(
  records: SeqRecord[],
  setActiveSelection: Dispatch<SetStateAction<SelectionArea | null>>,
  transposedRecords: SeqRecord[] = [],
) {
  const [tab, setTabValue] = useState<ShowroomTab>('alignment');
  const hubState = useHubState();
  // The hub row a Focus jump left from: the viewport offers the way back while
  // `showHubReturn` holds, and the hub keeps marking the row after returning.
  const [hubFocus, setHubFocus] = useState<HubFocusOrigin | null>(null);
  const [showHubReturn, setShowHubReturn] = useState(false);
  // `focusedRegion` names the selection while it stands; `focusRequest` asks the
  // viewport to frame it once and is cleared when handled, so a remount does not replay it.
  const [focusedRegion, setFocusedRegion] = useState<FocusTarget | null>(null);
  const [focusRequest, setFocusRequest] = useState<FocusTarget | null>(null);
  const [details, setDetails] = useState<{ record: SeqRecord; feature: BioFeature | null } | null>(null);

  const setTab = useCallback((next: ShowroomTab) => {
    if (next === 'features') setShowHubReturn(false);
    setTabValue(next);
  }, []);

  const focusOn = useCallback((target: FocusTarget) => {
    setTabValue('alignment');
    setActiveSelection({ start: target.start, end: target.end, recordIds: [target.recordId] });
    setFocusedRegion(target);
    setFocusRequest(target);
  }, [setActiveSelection]);

  const focusFromHub = useCallback((target: FocusTarget, origin: HubFocusOrigin) => {
    setHubFocus(origin);
    setShowHubReturn(true);
    focusOn(target);
  }, [focusOn]);

  const completeFocus = useCallback(() => setFocusRequest(null), []);
  const dismissHubReturn = useCallback(() => setShowHubReturn(false), []);

  const { setJumpTarget } = hubState;
  const returnToHub = useCallback(() => {
    if (!hubFocus) return;
    setJumpTarget(previous => ({ key: hubFocus.key, serial: (previous?.serial ?? 0) + 1 }));
    setTab('features');
  }, [hubFocus, setJumpTarget, setTab]);

  const openDetails = useCallback((recordId: string, feature?: BioFeature) => {
    const record = records.find(candidate => candidate.id === recordId);
    if (!record) return;
    const index = feature ? featureIndexOf(records, transposedRecords, recordId, feature) : -1;
    // An annotation the record does not own (-1) would silently open the record's own panel
    // instead, which looks like the wrong panel opened for no reason. Open nothing.
    if (feature && index < 0) return;
    setDetails({ record, feature: record.features[index] ?? null });
  }, [records, transposedRecords]);
  const closeDetails = useCallback(() => setDetails(null), []);

  return {
    tab, setTab,
    hubState,
    hubFocus, showHubReturn, dismissHubReturn, returnToHub,
    focusRequest, focusedRegion, completeFocus, focusOn, focusFromHub,
    details, openDetails, closeDetails,
  };
}

export type ShowroomView = ReturnType<typeof useShowroomView>;
