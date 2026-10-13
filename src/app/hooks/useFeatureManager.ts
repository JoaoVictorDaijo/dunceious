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

import { useState, useCallback, useRef, useEffect, Dispatch, SetStateAction } from 'react';
import { SeqRecord, SelectionArea, BioFeature, SequenceDetails } from '@/src/domain/bio/types';
import { writeDetails } from '@/src/domain/bio/details';
import { annotationFeatures } from '@/src/domain/bio/recordStatus';
import type { EditingFeatureState } from '../components/FeatureEditorModal';
import {
  saveEditedFeature as saveEditedFeatureReducer,
  removeFeature as removeFeatureReducer,
  toggleRecordVisibility as toggleVisibility,
  newFeatureFromSelection,
  annotationCoords,
} from '@/src/app/logic/featureManager';

function sameAnnotations(record: SeqRecord, expected: BioFeature[] | undefined): boolean {
  if (!expected) return false;
  const annotations = annotationFeatures(record);
  const previous = expected.filter(feature => feature.type !== 'source');
  return annotations.length === previous.length && annotations.every((feature, index) => feature === previous[index]);
}

export interface UseFeatureManagerReturn {
  /** State for the feature-editor modal; null when modal is closed. */
  editing: EditingFeatureState | null;
  setEditing: (state: EditingFeatureState | null) => void;

  setRecordDetails: (recordId: string, details: SequenceDetails) => void;
  setRecordLabel: (recordId: string, label: string) => void;

  undoAvailable: boolean;
  undoDelete: () => void;
  dismissUndo: () => void;
  removeFeatures: (keys: Set<string>) => void;

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
    strand?: 1 | -1,
  ) => void;

  removeFeature: (recordId: string, featureIndex: number) => void;
  toggleRecordVisibility: (recordId: string) => void;
}

export function useFeatureManager(
  records: SeqRecord[],
  setRecords: Dispatch<SetStateAction<SeqRecord[]>>,
  activeSelection: SelectionArea | null,
  addLog: (msg: string) => void,
): UseFeatureManagerReturn {
  const [editing, setEditingState] = useState<EditingFeatureState | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [undoVersion, setUndoVersion] = useState(0);
  const undoArrays = useRef<Map<string, BioFeature[]> | null>(null);
  const undo = useRef<(() => void) | null>(null);

  const setEditing = useCallback((next: EditingFeatureState | null) => {
    if (next && (next.feature.type === 'source' || records.find(record => record.id === next.recordId)?.features[next.featureIndex]?.type === 'source')) return;
    setEditingState(next);
  }, [records]);
  const setRecordDetails = useCallback((recordId: string, details: SequenceDetails) => {
    setRecords(prev => prev.map(record => record.id === recordId ? writeDetails(record, details) : record));
  }, [setRecords]);
  const setRecordLabel = useCallback((recordId: string, label: string) => {
    setRecords(prev => prev.map(record => record.id === recordId ? { ...record, label: label.trim() || undefined } : record));
  }, [setRecords]);

  const removeFeatures = useCallback((keys: Set<string>) => {
    const removals = records.flatMap(record => {
      const entries = record.features.flatMap((feature, index) => feature.type !== 'source' && keys.has(`${record.id}:${index}`) ? [{ feature, index }] : []);
      return entries.length ? [{ record, entries }] : [];
    });
    if (!removals.length) return;
    const after = new Map<string, BioFeature[]>();
    setRecords(prev => prev.map(record => {
      const removal = removals.find(item => item.record.id === record.id);
      if (!removal) return record;
      let next = record;
      for (const entry of [...removal.entries].reverse()) next = removeFeatureReducer([next], record.id, entry.index).next[0];
      after.set(record.id, next.features);
      return next;
    }));
    undoArrays.current = after;
    undo.current = () => {
      setRecords(prev => prev.map(record => {
        const removal = removals.find(item => item.record.id === record.id);
        if (!removal || !sameAnnotations(record, after.get(record.id))) return record;
        const features = [...record.features];
        removal.entries.forEach(entry => features.splice(entry.index, 0, entry.feature));
        return { ...record, features, annotationsEdited: removal.record.annotationsEdited };
      }));
      addLog('Annotation deletion undone.');
    };
    setUndoAvailable(true);
    setUndoVersion(prev => prev + 1);
    addLog(`Removed ${removals.reduce((count, item) => count + item.entries.length, 0)} annotations.`);
  }, [records, setRecords, addLog]);

  const dismissUndo = useCallback(() => {
    undo.current = null;
    undoArrays.current = null;
    setUndoAvailable(false);
  }, []);

  const undoDelete = useCallback(() => {
    undo.current?.();
    undo.current = null;
    undoArrays.current = null;
    setUndoAvailable(false);
  }, []);

  useEffect(() => {
    if (!undoAvailable || !undoArrays.current) return;
    const valid = [...undoArrays.current].every(([id, features]) => { const record = records.find(record => record.id === id); return Boolean(record && sameAnnotations(record, features)); });
    if (!valid) {
      undo.current = null;
      undoArrays.current = null;
      setUndoAvailable(false);
    }
  }, [records, undoAvailable]);

  useEffect(() => {
    if (!undoAvailable) return;
    const timer = setTimeout(() => {
      undo.current = null;
      undoArrays.current = null;
      setUndoAvailable(false);
    }, 8000);
    return () => clearTimeout(timer);
  }, [undoAvailable, undoVersion]);

  const toggleRecordVisibility = useCallback((recordId: string) => {
    setRecords(prev => toggleVisibility(prev, recordId));
  }, [setRecords]);

  const removeFeature = useCallback((recordId: string, featureIndex: number) => removeFeatures(new Set([`${recordId}:${featureIndex}`])), [removeFeatures]);

  const saveEditedFeature = () => {
    if (!editing || editing.feature.type === 'source' || records.find(record => record.id === editing.recordId)?.features[editing.featureIndex]?.type === 'source') return;
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
    strand?: 1 | -1,
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
        strand: strand ?? 1,
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
    setRecordDetails,
    setRecordLabel,
    undoAvailable,
    undoDelete,
    dismissUndo,
    removeFeatures,
    saveEditedFeature,
    startNewFeature,
    addAnnotationFromSearch,
    removeFeature,
    toggleRecordVisibility,
  };
}
