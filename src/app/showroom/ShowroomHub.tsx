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

import AnnotationHubPanel from '@/src/app/components/AnnotationHubPanel';
import { EXPORT_EXTENSION, type HubExportFormat } from '@/src/app/logic/exportPlan';
import type { SeqRecord } from '@/src/domain/bio/types';
import type { ExplainId, ExplainVars } from './explanations';
import type { ShowroomView } from './useShowroomView';

export type ShowroomExplain = (id: ExplainId, anchor?: DOMRect, vars?: ExplainVars) => void;

/* The names `ExportDialog` gives each format. */
const FORMAT_LABEL: Record<HubExportFormat, string> = { fasta: 'FASTA', genbank: 'GenBank', gff3: 'GFF3', project: 'Dunceious project' };

const NO_CUSTOM_COLORS: Record<string, string> = {};
const noop = () => {};

interface ShowroomHubProps {
  records: SeqRecord[];
  view: ShowroomView;
  toolsSlot: HTMLDivElement | null;
  explain: ShowroomExplain;
}

/**
 * The workbench's real Annotation Hub over the sample. Looking around, focusing a
 * row in the viewport and opening details work through the showroom's view state;
 * every callback that would change, import, save or export explains instead.
 */
export function ShowroomHub({ records, view, toolsSlot, explain }: ShowroomHubProps) {
  const because = (id: ExplainId) => () => explain(id);
  return (
    <AnnotationHubPanel
      toolsSlot={toolsSlot}
      records={records}
      state={view.hubState}
      featureColors={NO_CUSTOM_COLORS}
      onStartNewFeature={because('add-annotation')}
      onRemoveRecord={because('remove-record')}
      onViewFeatureDetails={view.openDetails}
      onEditFeature={because('edit-annotation')}
      onRemoveFeature={because('delete-annotations')}
      onDeleteRows={because('delete-annotations')}
      undoAvailable={false}
      onUndoPause={noop}
      onUndoDelete={noop}
      onSetRecordDetails={because('edit-record')}
      onSetRecordLabel={because('edit-record')}
      onSetDetail={because('edit-record')}
      onFocusItem={view.focusFromHub}
      lastFocusedKey={view.hubFocus?.key ?? null}
      onExportProjectJson={because('project')}
      onExportRecords={(ids, format, options) => explain('export-save', undefined, {
        fileName: options.fileName ?? `sequences.${EXPORT_EXTENSION[format]}`,
        format: FORMAT_LABEL[format],
        count: ids.length,
        rows: options.annotationRows,
      })}
      onClearAll={because('project')}
      addLog={noop}
      onFileUpload={because('ingest-sequences')}
      onAlignmentUpload={because('ingest-alignment')}
      onAnnotationUpload={because('ingest-annotations')}
      onProjectUpload={because('ingest-project')}
      onDroppedFiles={because('drop-files')}
    />
  );
}
