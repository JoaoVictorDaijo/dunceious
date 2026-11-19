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

import type { SeqRecord, SelectionArea } from '@/src/domain/bio/types';
import { getOriginalPos, sliceRecordsBySelection } from '@/src/domain/bio';
import { serializeExport, EXPORT_EXTENSION, type HubExportFormat, type ExportOptions } from '@/src/app/logic/exportPlan';
import { exportToFasta } from '@/src/core/formats/fasta';
import { serializeProject } from '@/src/app/logic/projectFile';
import { downloadBlob } from '@/src/app/lib/download';
import type { FileHandlerContext } from './context';

/** Each record cut to the aligned columns [start, end), with features rebased to the cut. */
function sliceToSelection(records: SeqRecord[], start: number, end: number): SeqRecord[] {
  return records.flatMap(record => {
    const aligned = record.alignedSequence;
    const biologicalStart = aligned ? getOriginalPos(aligned, start) : start;
    const biologicalEnd = aligned ? getOriginalPos(aligned, end) : end;
    return sliceRecordsBySelection([{ ...record, alignedSequence: undefined }], biologicalStart, biologicalEnd)
      .map(sliced => ({
        ...sliced,
        alignedSequence: aligned?.substring(start, end),
        // Source location text cannot describe coordinates rebased to a selection.
        features: sliced.features.map(feature => ({ ...feature, locationString: undefined })),
      }));
  });
}

const selectionBounds = (selection: SelectionArea) =>
  ({ start: Math.min(selection.start, selection.end), end: Math.max(selection.start, selection.end) });

/** Downloads of the selection, single records and record subsets. */
export function createExportHandlers(ctx: FileHandlerContext) {
  const { records, activeSelection, featureColors, viewportState, addLog } = ctx;

  const exportSelection = () => {
    const slice = activeSelection ? selectionBounds(activeSelection) : undefined;
    downloadBlob(
      exportToFasta(records, { residues: 'aligned', header: 'id', slice }).text,
      activeSelection ? 'selection_export.fasta' : 'msa_export.fasta',
      'text/plain',
    );
    addLog(`${activeSelection ? 'Selection' : 'Full'} FASTA exported.`);
  };

  const exportSelectionJson = () => {
    if (!activeSelection) { addLog('No selection active for JSON export.'); return; }
    const { start, end } = selectionBounds(activeSelection);
    const project = {
      records: sliceToSelection(records, start, end),
      featureColors,
      ...viewportState,
      activeSelection: null,
      selectionRange: { start, end },
      version: __APP_VERSION__,
      exportedAt: new Date().toISOString(),
    };
    downloadBlob(serializeProject(project), `selection_${start}_${end}.json`, 'application/json');
    addLog(`Selection JSON exported (${start}-${end}).`);
  };

  const handleExportRecord = (recordId: string) => {
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    downloadBlob(exportToFasta([record]).text, `${record.id.replace(/[^a-z0-9]/gi, '_')}.fasta`, 'text/plain');
    addLog(`Exported record ${record.id} to FASTA.`);
  };

  const exportRecords = (ids: string[], format: HubExportFormat, options: ExportOptions = {}) => {
    const requested = new Set(ids);
    const subset = records.filter(record => requested.has(record.id));
    if (!subset.length) return;
    try {
      const result = serializeExport(subset, format, { ...options,
        projectState: { featureColors, ...viewportState, activeSelection: null, name: options.fileName?.replace(/\.json$/i, ''), version: __APP_VERSION__ },
      });
      downloadBlob(result.text, options.fileName ?? `sequences.${EXPORT_EXTENSION[format]}`, format === 'project' ? 'application/json' : 'text/plain');
      addLog(`Exported ${subset.length} sequences as ${format}.`);
    } catch (error) { addLog(`Export stopped: ${error instanceof Error ? error.message : String(error)}`); }
  };

  return { exportSelection, exportSelectionJson, handleExportRecord, exportRecords };
}
