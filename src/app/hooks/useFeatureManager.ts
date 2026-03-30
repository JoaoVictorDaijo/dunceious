import { useState, useMemo, useCallback, Dispatch, SetStateAction } from 'react';
import { SeqRecord, SelectionArea, BioFeature } from '@/src/domain/bio/types';
import { getOriginalPos } from '@/services/bioUtils';
import type { EditingFeatureState } from '../components/FeatureEditorModal';
import type { FlatItem } from '../components/DatabaseHubPanel';

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

  const groupedFeatures = useMemo(() => {
    const groups: Record<string, (BioFeature & { index: number })[]> = {};
    const search = featureSearch.toLowerCase();
    records.forEach(r => {
      groups[r.id] = r.features
        .map((f, idx) => ({ ...f, index: idx }))
        .filter(f => {
          const inName = f.name.toLowerCase().includes(search);
          const inType = f.type.toLowerCase().includes(search);
          const inDef = r.definition?.toLowerCase().includes(search);
          const inMeta = f.metadata
            ? Object.values(f.metadata).some(v => v.toLowerCase().includes(search))
            : false;
          return inName || inType || inDef || inMeta;
        });
    });
    return groups;
  }, [records, featureSearch]);

  const allFeaturesCount = useMemo(
    () => records.reduce((acc, r) => acc + r.features.length, 0),
    [records],
  );

  const flattenedFeatures = useMemo<FlatItem[]>(() => {
    const items: FlatItem[] = [];
    Object.entries(groupedFeatures).forEach(([recordId, features]) => {
      const record = records.find(r => r.id === recordId);
      const tracks = record?.tracks || [];
      if (features.length === 0 && tracks.length === 0 && featureSearch) return;
      items.push({ type: 'header', recordId, count: features.length + tracks.length });
      tracks.forEach(t => items.push({ type: 'track', recordId, track: t }));
      features.forEach(f => items.push({ type: 'feature', recordId, feature: f }));
    });
    return items;
  }, [groupedFeatures, records, featureSearch]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const toggleRecordVisibility = (recordId: string) => {
    setRecords(prev =>
      prev.map(r => (r.id === recordId ? { ...r, visible: !r.visible } : r)),
    );
  };

  const removeFeature = useCallback(
    (recordId: string, featureIndex: number) => {
      setRecords(prev =>
        prev.map(r => {
          if (r.id !== recordId) return r;
          const newFeatures = [...r.features];
          const removed = newFeatures.splice(featureIndex, 1);
          addLog(`Removed feature: ${removed[0].name}`);
          return { ...r, features: newFeatures };
        }),
      );
    },
    [setRecords, addLog],
  );

  const saveEditedFeature = () => {
    if (!editing) return;
    const { recordId, featureIndex, feature } = editing;
    setRecords(prev =>
      prev.map(r => {
        if (r.id !== recordId) return r;
        const newFeatures = [...r.features];
        if (featureIndex === -1) newFeatures.push(feature);
        else newFeatures[featureIndex] = feature;
        return { ...r, features: newFeatures };
      }),
    );
    addLog(
      featureIndex === -1
        ? `New feature '${feature.name}' created.`
        : 'Feature metadata updated.',
    );
    setEditing(null);
  };

  const startNewFeature = () => {
    if (records.length === 0) return;
    let start = 0;
    let end = 100;
    let targetRecordId = records[0].id;

    if (activeSelection) {
      targetRecordId = activeSelection.recordIds[0] || records[0].id;
      const targetRecord = records.find(r => r.id === targetRecordId);
      if (targetRecord) {
        start = getOriginalPos(
          targetRecord.alignedSequence || targetRecord.sequence,
          Math.min(activeSelection.start, activeSelection.end),
        );
        end = getOriginalPos(
          targetRecord.alignedSequence || targetRecord.sequence,
          Math.max(activeSelection.start, activeSelection.end),
        );
      }
    }

    setEditing({
      recordId: targetRecordId,
      featureIndex: -1,
      feature: { name: 'New Feature', type: 'misc_feature', start, end, strand: 1 },
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
    let finalStart = start;
    let finalEnd = end;
    let finalSegments = segments;

    if (targetRecord) {
      const seq = targetRecord.alignedSequence || targetRecord.sequence;
      finalStart = getOriginalPos(seq, start);
      finalEnd = getOriginalPos(seq, end);
      if (segments) {
        finalSegments = segments
          .map(seg => ({
            start: getOriginalPos(seq, seg.start),
            end: getOriginalPos(seq, seg.end),
          }))
          .sort((a, b) => a.start - b.start);
      }
    }

    setEditing({
      recordId,
      featureIndex: -1,
      feature: {
        name,
        type: 'misc_feature',
        start: finalStart,
        end: finalEnd,
        strand: 1,
        segments: finalSegments,
      },
    });
    addLog(
      `Preparing annotation for match${segments ? ' (multi-segment)' : ''} at ${finalStart} bp.`,
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
