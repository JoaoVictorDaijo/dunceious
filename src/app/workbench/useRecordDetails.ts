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

import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { featureIndexOf as resolveFeatureIndex } from '@/src/app/logic/featureIndex';
import { withoutSearchHit } from '@/src/domain/bio/searchHit';
import { withAnnotationBases } from '@/src/app/viewer/annotationPresentation';

type BasesMode = boolean | 'nothing' | 'record' | 'query';

/**
 * The record and feature shown in the details panel. Details can open from the Hub (a copy
 * carrying `index`) or the viewer (the aligned copy, same order as the record's features),
 * so the feature is resolved by position and edits write back to that index.
 */
export function useRecordDetails(records: SeqRecord[], transposedRecords: SeqRecord[], setRecords: Dispatch<SetStateAction<SeqRecord[]>>) {
  const [viewingRecordDetails, setViewingRecordDetails] = useState<SeqRecord | null>(null);
  const [viewingFeatureDetails, setViewingFeatureDetails] = useState<BioFeature | null>(null);
  const detailsInvoker = useRef<HTMLElement | null>(null);
  const [viewingFeatureIndex, setViewingFeatureIndex] = useState(-1);

  const handleViewDetails = useCallback((recordId: string, feature?: BioFeature) => {
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    const index = feature ? resolveFeatureIndex(records, transposedRecords, recordId, feature) : -1;
    detailsInvoker.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setViewingRecordDetails(record);
    setViewingFeatureDetails(record.features[index] ?? null);
    setViewingFeatureIndex(index);
  }, [records, transposedRecords]);

  const updateViewedFeature = (update: (feature: BioFeature) => BioFeature) => {
    const recordId = viewingRecordDetails?.id;
    const index = viewingFeatureIndex;
    if (!recordId || index < 0) return;
    setRecords(prev => prev.map(r => r.id !== recordId ? r : { ...r, features: r.features.map((f, i) => (i === index ? update(f) : f)) }));
    setViewingFeatureDetails(current => (current ? update(current) : current));
  };
  const closeDetails = () => { setViewingRecordDetails(null); setViewingFeatureDetails(null); };

  return {
    viewingRecordDetails, viewingFeatureDetails, viewingFeatureIndex, detailsInvoker, handleViewDetails, closeDetails,
    handleSetShowBases: (show: BasesMode) => updateViewedFeature(f => withAnnotationBases(f, show)),
    removeSearchDetails: () => updateViewedFeature(withoutSearchHit),
  };
}

export type RecordDetails = ReturnType<typeof useRecordDetails>;
