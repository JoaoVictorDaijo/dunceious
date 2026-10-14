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

import { describe, it, expect } from 'vitest';
import { routeDroppedFiles, importDroppedBatch } from '../dropRouting';
import { applyParseSuccess, applyAnnotations } from '../bioResponse';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import type { SeqRecord } from '@/src/domain/bio/types';

const file = (name: string) => ({ name });

describe('drop routing', () => {
  it.each(['gb', 'genbank', 'fasta', 'fa', 'GB', 'FASTA'])('routes %s as sequences', ext => {
    const item = file(`camel.${ext}`);
    expect(routeDroppedFiles([item])).toEqual({ kind: 'batch', sequences: [item], annotations: [] });
  });
  it.each(['gff', 'gff3', 'bed', 'bedgraph'])('routes %s as annotations', ext => {
    const item = file(`camel.${ext}`);
    expect(routeDroppedFiles([item])).toEqual({ kind: 'batch', sequences: [], annotations: [item] });
  });
  it('routes a project only when it is alone', () => {
    expect(routeDroppedFiles([file('workspace.json')])).toEqual({ kind: 'project', file: file('workspace.json') });
    expect(routeDroppedFiles([file('workspace.json'), file('camel.fa')])).toEqual({ kind: 'refused', reason: 'Drop a project file on its own' });
  });
  it('refuses an unknown extension with the filename', () => {
    expect(routeDroppedFiles([file('camel.txt')])).toEqual({ kind: 'refused', reason: 'Unsupported file: camel.txt' });
  });
});

it.each([false, true])('waits for sequence commits when annotation reads finish first (existing workspace: %s)', async existing => {
  let resolveSequence!: (text: string) => void;
  const sequenceText = new Promise<string>(resolve => { resolveSequence = resolve; });
  let records: SeqRecord[] = existing ? [{ id: 'contig1', name: 'contig1', sequence: 'A'.repeat(100), features: [] }] : [];
  const dispatched: string[] = [];
  const batch = importDroppedBatch({ sequences: [file('contig.fa')], annotations: [file('contig.gff3')] }, {
    readText: f => f.name.endsWith('.fa') ? sequenceText : Promise.resolve('contig1\ts\tgene\t800\t900\t.\t+\t.\tID=late'),
    importSequence: async (f, content) => {
      dispatched.push(f.name);
      const parsed = handleBioMessage({ type: 'PARSE_FASTA', filename: f.name, content });
      if (parsed.type !== 'FASTA_SUCCESS') throw new Error('Expected FASTA');
      const result = applyParseSuccess(records, parsed.alignedData, f.name);
      records = result.next;
      return result.idMap;
    },
    importAnnotations: async (f, content, idMap) => {
      dispatched.push(f.name);
      const parsed = handleBioMessage({ type: 'PARSE_ANNOTATIONS', filename: f.name, content });
      if (parsed.type !== 'ANNOTATIONS_SUCCESS') throw new Error('Expected annotations');
      records = applyAnnotations(records, parsed.annotations, parsed.details, idMap).next;
    },
  });
  await Promise.resolve();
  expect(dispatched).toEqual([]);
  resolveSequence('>contig1\n' + 'A'.repeat(1000));
  await batch;
  expect(dispatched).toEqual(['contig.fa', 'contig.gff3']);
  if (existing) expect(records[0].features).toEqual([]);
  expect(records[existing ? 1 : 0]).toMatchObject({ id: existing ? 'contig1_1' : 'contig1', features: [{ start: 799, end: 900, name: 'late' }] });
});

it('marks repeated incoming IDs across separate files as ambiguous', async () => {
  let received: unknown;
  await importDroppedBatch({ sequences: [file('a.fa'), file('b.fa')], annotations: [file('a.gff')] }, {
    readText: async () => '',
    importSequence: async f => ({ x: f.name === 'a.fa' ? 'x_1' : 'x_2' }),
    importAnnotations: async (_f, _text, idMap) => { received = idMap; },
  });
  expect(received).toEqual({ x: null });
});


it('keeps sequence file order when the second read finishes first', async () => {
  let resolveFirst!: (text: string) => void;
  const first = new Promise<string>(resolve => { resolveFirst = resolve; });
  const order: string[] = [];
  const pending = importDroppedBatch({ sequences: [file('first.fa'), file('second.fa')], annotations: [] }, {
    readText: f => f.name === 'first.fa' ? first : Promise.resolve('second'),
    importSequence: async f => { order.push(f.name); return {}; },
    importAnnotations: async () => {},
  });
  await Promise.resolve();
  expect(order).toEqual([]);
  resolveFirst('first');
  await pending;
  expect(order).toEqual(['first.fa', 'second.fa']);
});
