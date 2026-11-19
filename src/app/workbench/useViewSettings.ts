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

import { useState } from 'react';
import { DEFAULT_ALIGNMENT_COMPARISON, type AlignmentComparisonSettings } from '@/src/app/logic/alignmentComparison';

/** Viewport display toggles, comparison settings and feature colours; a project load restores them. */
export function useViewSettings() {
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [showTranslation, setShowTranslation] = useState(true);
  const [showTracks, setShowTracks] = useState(true);
  const [showConservation, setShowConservation] = useState(false);
  const [alignmentComparison, setAlignmentComparison] = useState<AlignmentComparisonSettings>(DEFAULT_ALIGNMENT_COMPARISON);
  const [dragMode, setDragMode] = useState<'pan' | 'select'>('select');
  const [featureColors, setFeatureColors] = useState<Record<string, string>>({});
  const [jumpTo, setJumpTo] = useState<number | null>(null);
  return {
    showAnnotations, setShowAnnotations, showTranslation, setShowTranslation, showTracks, setShowTracks,
    showConservation, setShowConservation, alignmentComparison, setAlignmentComparison, dragMode, setDragMode,
    featureColors, setFeatureColors, jumpTo, setJumpTo,
  };
}

export type ViewSettings = ReturnType<typeof useViewSettings>;
