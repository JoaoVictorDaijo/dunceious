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

import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import type { SeqRecord, SelectionArea } from '@/src/domain/bio/types';
import type { AlignmentComparisonSettings } from '@/src/app/logic/alignmentComparison';
import type { BioWorkerRequest, BioWorkerResponse } from '@/src/workers/protocol';

/** Subset of app state that the project-restore handler needs to write back. */
export interface ProjectSetters {
  onWorkspaceReplaced?: () => void;
  setRecords: Dispatch<SetStateAction<SeqRecord[]>>;
  setFeatureColors: Dispatch<SetStateAction<Record<string, string>>>;
  setActiveSelection: Dispatch<SetStateAction<SelectionArea | null>>;
  setShowAnnotations: Dispatch<SetStateAction<boolean>>;
  setShowTranslation: Dispatch<SetStateAction<boolean>>;
  setShowConservation: Dispatch<SetStateAction<boolean>>;
  setAlignmentComparison: Dispatch<SetStateAction<AlignmentComparisonSettings>>;
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
}

export interface MoleculeTypeMismatchError {
  incoming: 'nucleotide' | 'protein';
  loaded: 'nucleotide' | 'protein';
  fileName: string;
}

export interface ViewportState { showAnnotations: boolean; showTranslation: boolean; showConservation: boolean; alignmentComparison: AlignmentComparisonSettings }

/** Acknowledged worker requests for drops, and the injectable reader tests use. */
export interface DropImport {
  getWorkspaceRevision?: () => number;
  getRecords: () => SeqRecord[];
  requestBio: (request: BioWorkerRequest, shouldCommit?: () => boolean) => Promise<BioWorkerResponse | 'stale'>;
  readText?: (file: File) => Promise<string>;
}

/** What every file handler reads from the app for one render. */
export interface FileHandlerContext {
  bioWorkerRef: MutableRefObject<Worker | null>;
  records: SeqRecord[];
  /** Live records: the worker's committed state when available, else the latest render's. */
  getRecords: () => SeqRecord[];
  activeSelection: SelectionArea | null;
  featureColors: Record<string, string>;
  viewportState: ViewportState;
  setters: ProjectSetters;
  addLog: (msg: string) => void;
  isAlignmentLocked: () => boolean;
  dropImport?: DropImport;
  readText: (file: File) => Promise<string>;
  reportMismatch: (mismatch: MoleculeTypeMismatchError) => void;
  /** Bumped when a project replaces the workspace, so in-flight drops stop. */
  workspaceRevision: MutableRefObject<number>;
}
