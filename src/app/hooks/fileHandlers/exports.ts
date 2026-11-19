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

import { describeSelectionLoss } from '@/src/core/exportReport';
import type { SeqRecord } from '@/src/domain/bio/types';
import { getOriginalPos, sliceRecordsBySelection } from '@/src/domain/bio';
import { serializeExport, EXPORT_EXTENSION, type HubExportFormat, type ExportOptions } from '@/src/app/logic/exportPlan';
import { exportToFasta } from '@/src/core/formats/fasta';
import { serializeProject } from '@/src/app/logic/projectFile';
import { downloadBlob } from '@/src/app/lib/download';
import type { FileHandlerContext } from './context';

/** Each record cut to the aligned columns [start, end), with features rebased to the cut. */
function sliceToSelection(records: SeqRecord[], start: number, end: number, addLog: FileHandlerContext['addLog']): SeqRecord[] {
  return records.flatMap(record => {
    const aligned = record.alignedSequence;
    const biologicalStart = aligned ? getOriginalPos(aligned, start) : start;
    const biologicalEnd = aligned ? getOriginalPos(aligned, end) : end;
    const sliced = sliceRecordsBySelection([{ ...record, alignedSequence: undefined }], biologicalStart, biologicalEnd);
    for (const loss of sliced.losses) addLog(`WARNING: ${describeSelectionLoss(loss)}`);
    return sliced.records
      .map(sliced => ({
        ...sliced,
        alignedSequence: aligned?.substring(start, end),
      }));
  });
}

function downloadExport(addLog: FileHandlerContext['addLog'], result: ReturnType<typeof serializeExport>, fileName: string, mime = 'text/plain') {
  if (result.text) downloadBlob(result.text, fileName, mime);
  if (result.unalignedText) {
    const separateName = fileName.replace(/(\.[^.]*)?$/, '_unaligned$1');
    downloadBlob(result.unalignedText, separateName, mime);
    const savedCount = result.report.unalignedRows.filter(id => !result.report.emptyRowsOmitted.includes(id)).length;
    addLog(`${savedCount} sequences aren't in the alignment, so they have no alignment columns and were saved separately in ${separateName}`);
  }
  for (const warning of [...result.report.translationWarnings, ...result.report.qualifierWarnings, ...result.report.genBankFeaturesOmitted, ...result.report.gff3FeaturesOmitted.map(omitted => omitted.reason), ...result.report.gff3RangeWarnings]) addLog(`WARNING: ${warning}`);
  for (const omitted of result.report.genBankRecordsOmitted) addLog(omitted.reason);
  if (result.report.gapOnlyRows.length) addLog(`Only gaps in the exported window: ${result.report.gapOnlyRows.join(', ')}`);
  if (result.report.emptyRowsOmitted.length) addLog(`No residues in the exported window; left out: ${result.report.emptyRowsOmitted.join(', ')}`);
}

/** Downloads of the selection, single records and record subsets. */
export function createExportHandlers(ctx: FileHandlerContext) {
  const { records, activeSelection, featureColors, viewportState, addLog } = ctx;

  const exportSelection = (mode: 'original' | 'aligned' = 'aligned') => {
    const start = activeSelection ? Math.min(activeSelection.start, activeSelection.end) : undefined;
    const end = activeSelection ? Math.max(activeSelection.start, activeSelection.end) : undefined;
    downloadExport(addLog, exportToFasta(records, { residues: mode, header: 'id', slice: start !== undefined && end !== undefined ? { start, end } : undefined }),
      activeSelection ? 'selection_export.fasta' : 'msa_export.fasta');
    addLog(`${activeSelection ? 'Selection' : 'Full'} FASTA exported.`);
  };

  const exportSelectionJson = () => {
    if (!activeSelection) { addLog('No selection active for JSON export.'); return; }
    const start = Math.min(activeSelection.start, activeSelection.end);
    const end = Math.max(activeSelection.start, activeSelection.end);
    const project = {
      records: sliceToSelection(records, start, end, addLog),
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

  const handleExportRecord = (recordId: string, mode: 'original' | 'aligned' = 'original') => {
    const record = records.find(r => r.id === recordId);
    if (!record) return;
    downloadBlob(
      exportToFasta([record], { residues: mode, header: 'id' }).text,
      `${record.id.replace(/[^a-z0-9]/gi, '_')}.fasta`,
      'text/plain',
    );
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
      downloadExport(addLog, result, options.fileName ?? `sequences.${EXPORT_EXTENSION[format]}`, format === 'project' ? 'application/json' : 'text/plain');
      addLog(`Exported ${subset.length - result.report.genBankRecordsOmitted.length - result.report.emptyRowsOmitted.length} sequences as ${format}.`);
    } catch (error) { addLog(`Export stopped: ${error instanceof Error ? error.message : String(error)}`); }
  };

  return { exportSelection, exportSelectionJson, handleExportRecord, exportRecords };
}
