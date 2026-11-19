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
import type { SeqRecord } from '@/src/domain/bio/types';
import { takeFiles } from '@/src/app/logic/upload';
import { parseProject, serializeProject, type ProjectFile } from '@/src/app/logic/projectFile';
import { DEFAULT_ALIGNMENT_COMPARISON } from '@/src/app/logic/alignmentComparison';
import { downloadBlob } from '@/src/app/lib/download';
import type { FileHandlerContext } from './context';

function restoreProject(ctx: FileHandlerContext, project: ProjectFile) {
  const s = ctx.setters;
  ctx.workspaceRevision.current++;
  s.onWorkspaceReplaced?.();
  s.setRecords(project.records.map(r => ({ ...r, visible: r.visible ?? true })));
  s.setFeatureColors(project.featureColors);
  s.setActiveSelection(project.activeSelection ?? null);
  s.setShowAnnotations(project.showAnnotations);
  s.setShowTranslation(project.showTranslation);
  s.setShowConservation(project.showConservation);
  s.setAlignmentComparison(project.alignmentComparison ?? DEFAULT_ALIGNMENT_COMPARISON);
}

/** Loading a project replaces the whole workspace; saving prompts for the project's name. */
export function useProjectFile(ctx: FileHandlerContext) {
  const { addLog, isAlignmentLocked, setters: { setIsProcessing } } = ctx;
  const [projectName, setProjectName] = useState('dunceious_project');

  const loadProjectFile = (file: File): Promise<void> => {
    if (isAlignmentLocked()) return Promise.resolve();
    setIsProcessing(true);
    addLog(`Loading project: ${file.name}`);
    return ctx.readText(file)
      .then(text => {
        if (isAlignmentLocked()) { setIsProcessing(false); return; }
        const parsed = parseProject(text, addLog);
        if (!parsed.ok) { addLog(parsed.message); return; }
        restoreProject(ctx, parsed.project);
        if (parsed.project.name?.trim()) setProjectName(parsed.project.name.trim());
        addLog('Project loaded successfully.');
      })
      .catch(err => {
        addLog(`Could not read project file "${file.name}": ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => setIsProcessing(false));
  };

  const handleProjectUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isAlignmentLocked()) return;
    const [file] = takeFiles(e.target);
    if (file) void loadProjectFile(file);
  };

  const promptForProjectName = () => {
    const input = window.prompt('Project name (required):', projectName);
    if (input === null) return null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    setProjectName(trimmed);
    return trimmed;
  };

  /** Returns the saved file name, or null when the user cancels the name prompt. */
  const saveProject = (selectedRecords: SeqRecord[]): string | null => {
    const chosenProjectName = promptForProjectName();
    if (!chosenProjectName) {
      addLog('Project save cancelled: a project name is required.');
      return null;
    }
    const safeName = chosenProjectName.replace(/[^a-z0-9._-]/gi, '_');
    const { viewportState } = ctx;
    const project = {
      name: chosenProjectName,
      records: selectedRecords,
      featureColors: ctx.featureColors,
      activeSelection: ctx.activeSelection,
      showAnnotations: viewportState.showAnnotations,
      showTranslation: viewportState.showTranslation,
      showConservation: viewportState.showConservation,
      alignmentComparison: viewportState.alignmentComparison,
      version: __APP_VERSION__,
    };
    const fileName = `${safeName || 'dunceious_project'}.json`;
    downloadBlob(serializeProject(project), fileName, 'application/json');
    addLog('Project JSON exported.');
    return fileName;
  };

  return { loadProjectFile, handleProjectUpload, exportProjectJson: () => saveProject(ctx.records) };
}
