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

import { useState, useMemo, useCallback, Dispatch, SetStateAction } from 'react';
import { SeqRecord, SelectionArea, BioFeature } from '@/src/domain/bio/types';
import type { EditingFeatureState } from '../components/FeatureEditorModal';
import type { FlatItem } from '../components/DatabaseHubPanel';
import {
  saveEditedFeature as saveEditedFeatureReducer,
  removeFeature as removeFeatureReducer,
  toggleRecordVisibility as toggleVisibility,
  groupFeaturesBySearch,
  buildFlattenedFeatures,
  newFeatureFromSelection,
  annotationCoords,
} from '@/src/app/logic/featureManager';

export interface UseFeatureManagerReturn {
  /** State for the feature-editor modal; null when modal is closed. */
  editing: EditingFeatureState | null;
  setEditing: (state: EditingFeatureState | null) => void;

  featureSearch: string;
  setFeatureSearch: (q: string) => void;

  /** Features per record filtered by featureSearch, with original index attached. */
  groupedFeatures: Record<string, (BioFeature & { index: number })[]>;
  /** Total feature count across all records (unfiltered). */
  allFeaturesCount: number;
  /** Flat list used by the virtualised DatabaseHubPanel. */
  flattenedFeatures: FlatItem[];

  /** Commit a pending edit (insert or update) and close the editor. */
  saveEditedFeature: () => void;
  /**
   * Open the feature editor for a new feature, defaulting coordinates to
   * the current viewport selection if one exists.
   */
  startNewFeature: () => void;
  /**
   * Open the feature editor pre-filled from a search match, converting
   * viewport (aligned) coordinates to original sequence coordinates.
   */
  addAnnotationFromSearch: (
    recordId: string,
    start: number,
    end: number,
    name: string,
    segments?: { start: number; end: number }[],
  ) => void;

  removeFeature: (recordId: string, featureIndex: number) => void;
  toggleRecordVisibility: (recordId: string) => void;
}

/**
 * Manages the feature editor modal, feature CRUD, and derived
 * grouped/flattened lists consumed by DatabaseHubPanel.
 *
 * @param records         - Current active records (read-only from this hook).
 * @param setRecords      - Setter to mutate records when features change.
 * @param activeSelection - Current viewport selection for seeding new features.
 * @param addLog          - Callback to append a timestamped message.
 */
export function useFeatureManager(
  records: SeqRecord[],
  setRecords: Dispatch<SetStateAction<SeqRecord[]>>,
  activeSelection: SelectionArea | null,
  addLog: (msg: string) => void,
): UseFeatureManagerReturn {
  const [editing, setEditing] = useState<EditingFeatureState | null>(null);
  const [featureSearch, setFeatureSearch] = useState('');

  // ── Derived lists ─────────────────────────────────────────────────────────

  const groupedFeatures = useMemo(
    () => groupFeaturesBySearch(records, featureSearch),
    [records, featureSearch],
  );

  const allFeaturesCount = useMemo(
    () => records.reduce((acc, r) => acc + r.features.length, 0),
    [records],
  );

  const flattenedFeatures = useMemo<FlatItem[]>(
    () => buildFlattenedFeatures(records, featureSearch),
    [records, featureSearch],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────

  const toggleRecordVisibility = (recordId: string) => {
    setRecords(prev => toggleVisibility(prev, recordId));
  };

  const removeFeature = useCallback(
    (recordId: string, featureIndex: number) => {
      setRecords(prev => {
        const { next, removedName } = removeFeatureReducer(prev, recordId, featureIndex);
        addLog(`Removed feature: ${removedName}`);
        return next;
      });
    },
    [setRecords, addLog],
  );

  const saveEditedFeature = () => {
    if (!editing) return;
    const { recordId, featureIndex, feature } = editing;
    setRecords(prev => saveEditedFeatureReducer(prev, recordId, featureIndex, feature));
    addLog(
      featureIndex === -1
        ? `New feature '${feature.name}' created.`
        : 'Feature metadata updated.',
    );
    setEditing(null);
  };

  const startNewFeature = () => {
    const coords = newFeatureFromSelection(records, activeSelection);
    if (!coords) return;
    setEditing({
      recordId: coords.targetRecordId,
      featureIndex: -1,
      feature: {
        name: 'New Feature',
        type: 'misc_feature',
        start: coords.start,
        end: coords.end,
        strand: 1,
      },
    });
  };

  const addAnnotationFromSearch = (
    recordId: string,
    start: number,
    end: number,
    name: string,
    segments?: { start: number; end: number }[],
  ) => {
    const targetRecord = records.find(r => r.id === recordId);
    const c = annotationCoords(targetRecord, start, end, segments);

    setEditing({
      recordId,
      featureIndex: -1,
      feature: {
        name,
        type: 'misc_feature',
        start: c.start,
        end: c.end,
        strand: 1,
        segments: c.segments,
      },
    });
    addLog(
      `Preparing annotation for match${segments ? ' (multi-segment)' : ''} at ${c.start} bp.`,
    );
  };

  return {
    editing,
    setEditing,
    featureSearch,
    setFeatureSearch,
    groupedFeatures,
    allFeaturesCount,
    flattenedFeatures,
    saveEditedFeature,
    startNewFeature,
    addAnnotationFromSearch,
    removeFeature,
    toggleRecordVisibility,
  };
}
