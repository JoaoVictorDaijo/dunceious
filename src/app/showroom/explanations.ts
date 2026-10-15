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

export type ExplainId =
  | 'import' | 'export' | 'project' | 'options' | 'hub'
  | 'ingest-sequences' | 'ingest-alignment' | 'ingest-annotations' | 'ingest-project'
  | 'context-menu' | 'remove-record' | 'view-details' | 'add-annotation' | 'annotate-hit' | 'join-hits'
  | 'align-submit' | 'external-link' | 'select-mode' | 'conservation' | 'export-fasta';

/**
 * What each control that would do work does in the workbench. The title is the
 * control's name there; the body is two or three plain sentences.
 */
export const EXPLANATIONS: Record<ExplainId, { title: string; body: string }> = {
  import: {
    title: 'Import',
    body: 'Adds sequences, an alignment, annotations or a saved project to the workspace. Your browser reads the files itself and uploads nothing.',
  },
  export: {
    title: 'Export',
    body: 'Writes the sequences you choose as FASTA, GenBank, GFF3 or a project file, with a preview of exactly what goes in. Files are created by your browser and saved to your computer.',
  },
  project: {
    title: 'Project',
    body: 'Saves the whole workspace as a project file on your computer, opens a project you saved before, or clears the workspace. A project keeps the records, annotations, colours and view settings.',
  },
  options: {
    title: 'Options',
    body: 'Sets the colour of each feature type and the look of the top and bottom bars. This browser remembers the theme you pick.',
  },
  hub: {
    title: 'Annotation Hub',
    body: 'Lists every annotation of every record in one table, where you can filter, edit, delete and export them or jump to one in the viewer. It is not part of this test drive yet.',
  },
  'ingest-sequences': {
    title: 'Drop input batch',
    body: 'Opens GenBank or FASTA files, picked or dropped on the card, and adds their records to the workspace. Your browser reads the files and uploads nothing.',
  },
  'ingest-alignment': {
    title: 'Upload pre-aligned FASTA',
    body: 'Overlays an alignment from a FASTA file whose IDs match the loaded records. The viewer then shows the gaps, and the Conservation layer becomes available.',
  },
  'ingest-annotations': {
    title: 'Import annotations',
    body: 'Adds annotations or data tracks from BED, GFF3 or BedGraph files to the loaded records. Each line goes to the record whose ID it names.',
  },
  'ingest-project': {
    title: 'Load project JSON',
    body: 'Restores a workspace saved from the Project menu, with its records, annotations, colours and view settings. It replaces whatever is open.',
  },
  'context-menu': {
    title: 'Right-click menu',
    body: 'Right-clicking a record or an annotation in the viewer opens a menu to zoom to the annotation, view its details, copy its sequence or remove the record. Copying puts the sequence on your clipboard.',
  },
  'remove-record': {
    title: 'Remove sequence',
    body: 'Removes the record and its annotations from the workspace after you confirm. The file it came from is not touched.',
  },
  'view-details': {
    title: 'Details',
    body: 'Tapping a record or an annotation opens its details: location, qualifiers and source metadata. From there you can focus the viewer on it, copy or export its sequence, or show its bases in the viewer.',
  },
  'add-annotation': {
    title: 'Add annotation',
    body: 'Creates an annotation over the selected region and opens it in the editor, where you set its type, name, strand and qualifiers. It goes with the record into every export and project.',
  },
  'annotate-hit': {
    title: 'Annotate match',
    body: 'Turns a search match into an annotation on its record, named after the matched sequence. You can then edit it, export it or find it in the Annotation Hub.',
  },
  'join-hits': {
    title: 'Join matches',
    body: 'Joins matches on the same record and strand into one annotation with a segment for each match. It suits a feature that the sequence splits into pieces.',
  },
  'align-submit': {
    title: 'Align',
    body: 'Sends every loaded sequence, including hidden ones, and your email to EMBL-EBI, which aligns them with the engine you chose. Dunceious follows the job and overlays the result on your records when it finishes. This test drive sends nothing.',
  },
  'external-link': {
    title: 'Link to another website',
    body: "Opens a page on another website, here EMBL-EBI's privacy notice or terms of use, in a new tab. The test drive stays on this page and follows no links to other websites.",
  },
  'select-mode': {
    title: 'Select mode',
    body: 'Dragging across the viewer with a mouse selects a region, which you can then zoom to, export or annotate. Selecting by touch is not available yet, so switch to Pan mode to move around.',
  },
  conservation: {
    title: 'Conservation',
    body: 'Colours each column of an alignment by how much the sequences agree there. It needs an alignment, and these samples are unrelated genomes that are not aligned.',
  },
  'export-fasta': {
    title: 'Export selection as FASTA',
    body: 'Downloads the selected region of every visible record as a FASTA file. Your browser creates the file and saves it to your computer.',
  },
};
