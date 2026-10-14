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

function rowKeyRemapper(before: SeqRecord[], after: SeqRecord[]): (key: string) => string | null {
  const keys = new Map<string, string | null>();
  for (const record of before) {
    const next = after.find(value => value.id === record.id);
    if (!next || next.features === record.features) continue;
    record.features.forEach((feature, index) => {
      const shifted = next.features.indexOf(feature);
      keys.set(`${record.id}:${index}`, shifted < 0 ? null : `${record.id}:${shifted}`);
    });
  }
  return key => keys.has(key) ? keys.get(key)! : key;
}

export interface UseFeatureManagerReturn {
  /** State for the feature-editor modal; null when modal is closed. */
  editing: EditingFeatureState | null;
  setEditing: (state: EditingFeatureState | null) => void;

  setRecordDetails: (recordId: string, details: SequenceDetails) => void;
  setRecordLabel: (recordId: string, label: string) => void;

  undoAvailable: boolean;
  undoVersion: number;
  setUndoPaused: (paused: boolean) => void;
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
  options: { isLocked?: () => boolean; onRemapRows?: (remap: (key: string) => string | null) => void } = {},
): UseFeatureManagerReturn {
  const { isLocked, onRemapRows } = options;
  const latestRecords = useRef(records);
  latestRecords.current = records;
  const [undoPaused, setUndoPaused] = useState(false);
  const undoRemaining = useRef(8000);
  const undoEpoch = useRef(0);
  const [editing, setEditingState] = useState<EditingFeatureState | null>(null);
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [undoVersion, setUndoVersion] = useState(0);
  const undoArrays = useRef<Map<string, BioFeature[]> | null>(null);
  const undo = useRef<(() => void) | null>(null);

  const setEditing = useCallback((next: EditingFeatureState | null) => {
    if (next && (next.feature.type === 'source' || records.find(record => record.id === next.recordId)?.features[next.featureIndex]?.type === 'source')) {
      addLog('Source features are sequence details. Use Edit details to change them.');
      return;
    }
    setEditingState(next);
  }, [records, addLog]);
  const setRecordDetails = useCallback((recordId: string, details: SequenceDetails) => {
    setRecords(prev => prev.map(record => record.id === recordId ? writeDetails(record, details) : record));
  }, [setRecords]);
  const setRecordLabel = useCallback((recordId: string, label: string) => {
    setRecords(prev => prev.map(record => record.id === recordId ? { ...record, label: label.trim() || undefined } : record));
  }, [setRecords]);

  const removeFeatures = useCallback((keys: Set<string>) => {
    if (isLocked?.()) return;
    const removals = records.flatMap(record => {
      const entries = record.features.flatMap((feature, index) => feature.type !== 'source' && keys.has(`${record.id}:${index}`) ? [{ feature, index }] : []);
      return entries.length ? [{ record, entries }] : [];
    });
    if (!removals.length) return;
    const after = new Map<string, BioFeature[]>();
    const removeFrom = (previous: SeqRecord[]) => previous.map(record => {
      const removal = removals.find(item => item.record.id === record.id);
      if (!removal) return record;
      let next = record;
      for (const entry of [...removal.entries].reverse()) next = removeFeatureReducer([next], record.id, entry.index).next[0];
      after.set(record.id, next.features);
      return next;
    });
    const nextRecords = removeFrom(records);
    setRecords(previous => previous === records ? nextRecords : removeFrom(previous));
    onRemapRows?.(rowKeyRemapper(records, nextRecords));
    undoArrays.current = after;
    undo.current = () => {
      const current = latestRecords.current;
      const restoreInto = (previous: SeqRecord[]) => previous.map(record => {
        const removal = removals.find(item => item.record.id === record.id);
        if (!removal || !sameAnnotations(record, after.get(record.id))) return record;
        const features = [...record.features];
        removal.entries.forEach(entry => features.splice(entry.index, 0, entry.feature));
        return { ...record, features, annotationsEdited: removal.record.annotationsEdited };
      });
      const restored = restoreInto(current);
      setRecords(previous => previous === current ? restored : restoreInto(previous));
      onRemapRows?.(rowKeyRemapper(current, restored));
      addLog('Annotation deletion undone.');
    };
    undoEpoch.current++;
    undoRemaining.current = 8000;
    setUndoPaused(false);
    setUndoAvailable(true);
    setUndoVersion(prev => prev + 1);
    addLog(`Removed ${removals.reduce((count, item) => count + item.entries.length, 0)} annotations.`);
  }, [records, setRecords, addLog, isLocked, onRemapRows]);

  const dismissUndo = useCallback(() => {
    undo.current = null;
    undoArrays.current = null;
    setUndoAvailable(false);
  }, []);

  const undoDelete = useCallback(() => {
    if (isLocked?.()) return;
    undo.current?.();
    undo.current = null;
    undoArrays.current = null;
    setUndoAvailable(false);
  }, [isLocked]);

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
    if (!undoAvailable || undoPaused) return;
    const epoch = undoEpoch.current;
    const started = Date.now();
    const timer = setTimeout(() => {
      undo.current = null;
      undoArrays.current = null;
      setUndoAvailable(false);
    }, undoRemaining.current);
    return () => {
      clearTimeout(timer);
      if (undoEpoch.current !== epoch) return;
      undoRemaining.current = Math.max(0, undoRemaining.current - (Date.now() - started));
    };
  }, [undoAvailable, undoVersion, undoPaused]);

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
    undoVersion,
    setUndoPaused,
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
