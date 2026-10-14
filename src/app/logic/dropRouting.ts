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

import type { BatchIdMap } from '@/src/workers/protocol';

type Batch<T> = { sequences: T[]; annotations: T[] };
export type DropRoute<T> =
  | { kind: 'project'; file: T }
  | ({ kind: 'batch' } & Batch<T>)
  | { kind: 'refused'; reason: string };

export function routeDroppedFiles<T extends { name: string }>(files: T[]): DropRoute<T> {
  const extension = (file: T) => file.name.split('.').pop()?.toLowerCase();
  const project = files.find(file => extension(file) === 'json');
  if (project) return files.length === 1 ? { kind: 'project', file: project }
    : { kind: 'refused', reason: 'Drop a project file on its own' };
  const sequences: T[] = [];
  const annotations: T[] = [];
  for (const file of files) {
    const ext = extension(file) ?? '';
    if (['gb', 'genbank', 'fasta', 'fa'].includes(ext)) sequences.push(file);
    else if (['bed', 'gff', 'gff3', 'bedgraph'].includes(ext)) annotations.push(file);
    else return { kind: 'refused', reason: `Unsupported file: ${file.name}` };
  }
  return { kind: 'batch', sequences, annotations };
}

export interface DropBatchDeps<T> {
  readText: (file: T) => Promise<string>;
  importSequence: (file: T, content: string) => Promise<BatchIdMap>;
  importAnnotations: (file: T, content: string, idMap: BatchIdMap) => Promise<void>;
}

/** Reads may finish in any order; sequence acknowledgments precede annotation dispatch. */
export async function importDroppedBatch<T extends { name: string }>(batch: Batch<T>, deps: DropBatchDeps<T>): Promise<void> {
  const reads = [...batch.sequences, ...batch.annotations].map(async file => {
    try { return { file, content: await deps.readText(file) }; }
    catch (error) { return { file, error }; }
  });
  const idMap: BatchIdMap = Object.create(null);
  for (let index = 0; index < reads.length; index++) {
    const read = await reads[index];
    if ('error' in read) throw new Error(`Could not read "${read.file.name}": ${read.error instanceof Error ? read.error.message : String(read.error)}`);
    if (index < batch.sequences.length) {
      const assigned = await deps.importSequence(read.file, read.content);
      for (const [id, workspaceId] of Object.entries(assigned)) {
        idMap[id] = Object.hasOwn(idMap, id) ? null : workspaceId;
      }
    } else await deps.importAnnotations(read.file, read.content, idMap);
  }
}
