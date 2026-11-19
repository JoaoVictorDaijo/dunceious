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

import { useState, useRef } from 'react';
import type { SeqRecord, SelectionArea } from '@/src/domain/bio/types';
import type { HubExportFormat, ExportOptions } from '@/src/app/logic/exportPlan';
import { readFileAsText } from '@/src/app/logic/upload';
import type { DropImport, FileHandlerContext, MoleculeTypeMismatchError, ProjectSetters, ViewportState } from './fileHandlers/context';
import { createPickerHandlers } from './fileHandlers/pickerImports';
import { createDropHandler } from './fileHandlers/dropImport';
import { useProjectFile } from './fileHandlers/projectFile';
import { createExportHandlers } from './fileHandlers/exports';

export type { MoleculeTypeMismatchError, ProjectSetters } from './fileHandlers/context';

export interface UseFileHandlersReturn {
  handleDroppedFiles: (files: File[]) => Promise<void>;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAlignmentUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleAnnotationUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleProjectUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleExportRecord: (recordId: string) => void;
  exportRecords: (ids: string[], format: HubExportFormat, options?: ExportOptions) => void;
  exportSelection: () => void;
  exportSelectionJson: () => void;
  exportProjectJson: () => string | null;
  moleculeTypeMismatch: MoleculeTypeMismatchError | null;
  closeMismatchModal: () => void;
}

/**
 * Provides all file-upload and data-export handlers.
 *
 * Upload handlers delegate parsing to the bio worker; export helpers use
 * the pure serializers in `@/src/core` (`formats`/`genbank`).
 *
 * @param bioWorkerRef   - Ref to the active bioWorker instance.
 * @param records        - Current active records (read-only).
 * @param activeSelection - Current viewport selection used for selection exports.
 * @param featureColors  - Custom colour overrides included in project-JSON exports.
 * @param viewportState  - Display-toggle values included in project-JSON exports.
 * @param setters        - State setters required to restore a loaded project.
 * @param addLog         - Callback to append a timestamped message.
 */
export function useFileHandlers(
  bioWorkerRef: React.MutableRefObject<Worker | null>,
  records: SeqRecord[],
  activeSelection: SelectionArea | null,
  featureColors: Record<string, string>,
  viewportState: ViewportState,
  setters: ProjectSetters,
  addLog: (msg: string) => void,
  isAlignmentLocked: () => boolean = () => false,
  dropImport?: DropImport,
): UseFileHandlersReturn {
  const [moleculeTypeMismatch, setMoleculeTypeMismatch] = useState<MoleculeTypeMismatchError | null>(null);
  const recordsRef = useRef(records);
  recordsRef.current = records;
  const dropQueue = useRef(Promise.resolve());
  const workspaceRevision = useRef(0);
  const ctx: FileHandlerContext = {
    bioWorkerRef, records, activeSelection, featureColors, viewportState, setters, addLog, isAlignmentLocked, dropImport,
    getRecords: () => dropImport?.getRecords() ?? recordsRef.current,
    readText: dropImport?.readText ?? readFileAsText,
    reportMismatch: setMoleculeTypeMismatch,
    workspaceRevision,
  };
  const project = useProjectFile(ctx);
  return {
    ...createPickerHandlers(ctx),
    ...createExportHandlers(ctx),
    handleDroppedFiles: createDropHandler(ctx, dropQueue, project.loadProjectFile),
    handleProjectUpload: project.handleProjectUpload,
    exportProjectJson: project.exportProjectJson,
    moleculeTypeMismatch,
    closeMismatchModal: () => setMoleculeTypeMismatch(null),
  };
}
