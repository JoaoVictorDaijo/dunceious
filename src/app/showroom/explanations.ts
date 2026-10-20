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
  | 'export' | 'project' | 'options'
  | 'ingest-sequences' | 'ingest-alignment' | 'ingest-annotations' | 'ingest-project'
  | 'context-menu' | 'remove-record' | 'add-annotation' | 'annotate-hit' | 'join-hits'
  | 'align-submit' | 'external-link' | 'select-mode' | 'export-fasta'
  | 'edit-annotation' | 'delete-annotations' | 'edit-record' | 'drop-files' | 'export-save'
  | 'export-edit-details' | 'copy' | 'show-bases' | 'remove-search-details' | 'local-search';

/**
 * What the visitor chose in Export, for the one explanation that repeats it back. `rows` is
 * set only by the Hub's "Export GFF3" over selected annotation rows, where the file holds
 * those rows rather than whole sequences.
 */
export interface ExplainVars { fileName: string; format: string; count: number; rows?: number }

/**
 * What each control that would do work does in the workbench. The title is the
 * control's name there; the body is two or three plain sentences.
 */
export const EXPLANATIONS: Record<ExplainId, { title: string; body: string | ((vars: ExplainVars) => string) }> = {
  export: {
    title: 'Export',
    body: 'Writes the sequences you choose as FASTA, GenBank, GFF3 or a project file, with a preview of exactly what goes in. Files are created by your browser and saved to your computer.',
  },
  project: {
    title: 'Project and options',
    body: 'Saves the whole workspace as a project file on your computer, opens a project you saved before, or clears the workspace. A project keeps the records, annotations, colours and view settings. The same cog holds feature colours.',
  },
  options: {
    title: 'Options',
    body: 'Sets the colour of each feature type. Colours show in the viewer tracks and the annotation hub, and are saved with the project.',
  },
  'ingest-sequences': {
    title: 'Drop input batch',
    body: 'Opens GenBank, GenPept or FASTA files, picked or dropped, and adds their records to the workspace. Your browser reads the files and uploads nothing.',
  },
  'ingest-alignment': {
    title: 'Upload pre-aligned FASTA',
    body: 'Overlays an alignment from a FASTA file whose IDs match the loaded records. The viewer then shows the gaps, and the Conservation layer becomes available.',
  },
  'ingest-annotations': {
    title: 'Import annotations',
    body: 'Adds annotations or data tracks from GFF3, BED or bedGraph files to the loaded sequences. Each line goes to the record whose ID it names.',
  },
  'ingest-project': {
    title: 'Load project JSON',
    body: 'Restores a workspace saved as a Dunceious project, with its records, annotations, colours and view settings. It replaces whatever is open.',
  },
  'context-menu': {
    title: 'Right-click menu',
    body: 'Right-clicking a record or an annotation in the viewer opens a menu to zoom to the annotation, view its details, copy its sequence or remove the record. Copying puts the sequence on your clipboard.',
  },
  'remove-record': {
    title: 'Remove sequence',
    body: 'Removes the record and its annotations from the workspace after you confirm. The file it came from is not touched.',
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
  'export-fasta': {
    title: 'Export selection as FASTA',
    body: 'Downloads the selected region of every visible record as a FASTA file. Your browser creates the file and saves it to your computer.',
  },
  'edit-annotation': {
    title: 'Edit annotation',
    body: 'Opens the annotation in the editor, where you change its type, name, location, strand and qualifiers. The change goes with the record into every export and project.',
  },
  'delete-annotations': {
    title: 'Delete annotations',
    body: 'Removes the chosen annotations from their records and offers Undo for a short while. The files they came from are not touched.',
  },
  'edit-record': {
    title: 'Edit sequence details',
    body: "Saves a sequence's display name or its details, such as organism, host, location and collection date. Exports and projects carry the new values, and the file it came from is not touched.",
  },
  'drop-files': {
    title: 'Drop files',
    body: 'Dropping files on the Hub imports them as the Import menu does: sequences, annotations or a project, which asks before it replaces the workspace. Your browser reads the files and uploads nothing.',
  },
  'export-save': {
    title: 'Export file',
    body: ({ fileName, format, count, rows }) => {
      const sequences = count === 1 ? 'one sequence' : `${count} sequences`;
      const contents = rows === undefined
        ? count === 1 ? 'this sequence' : `these ${count} sequences`
        : `${rows === 1 ? 'this annotation' : `these ${rows} annotations`} from ${sequences}`;
      return `Your browser would build ${fileName}, a ${format} file of ${contents}, and save it to your computer. The test drive doesn't download anything.`;
    },
  },
  'export-edit-details': {
    title: 'Edit details',
    body: 'Opens the details editor for the sequences that have no organism, so you can fill it in before exporting. A GenBank file names the organism of every sequence.',
  },
  copy: {
    title: 'Copy',
    body: 'Puts the text on your clipboard, ready to paste into another program. The test drive leaves your clipboard alone.',
  },
  'show-bases': {
    title: 'Show bases',
    body: "Draws the annotation's bases inside its box when you zoom in, or for a search match, the query aligned to the record. The choice is saved with the annotation and kept in projects.",
  },
  'remove-search-details': {
    title: 'Remove search details',
    body: 'Strips the search match details from an annotation made from a match, leaving a plain annotation. The change goes into every export and project.',
  },
  'local-search': {
    title: 'Local search',
    body: 'Local finds several non-overlapping local alignments in each record and strand, with a score and identity for each. It runs entirely in your browser and is not part of this test drive yet.',
  },
};

/** The body as the callout shows it; only `export-save` needs `vars`. */
export function explanationBody(id: ExplainId, vars?: ExplainVars): string {
  const { body } = EXPLANATIONS[id];
  if (typeof body === 'string') return body;
  if (!vars) throw new Error(`The ${id} explanation needs the export choices`);
  return body(vars);
}
