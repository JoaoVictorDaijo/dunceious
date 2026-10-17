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

import { describe, expect, it } from 'vitest';
import { EXPLANATIONS, explanationBody, type ExplainId } from '../explanations';

const IDS: ExplainId[] = [
  'export', 'project', 'options',
  'ingest-sequences', 'ingest-alignment', 'ingest-annotations', 'ingest-project',
  'context-menu', 'remove-record', 'add-annotation', 'annotate-hit', 'join-hits',
  'align-submit', 'external-link', 'select-mode', 'export-fasta',
  'edit-annotation', 'delete-annotations', 'edit-record', 'drop-files', 'export-save',
  'export-edit-details', 'copy', 'show-bases', 'remove-search-details', 'local-search',
];

const VARS = { fileName: 'demo.gb', format: 'GenBank', count: 4 };

const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter(Boolean);

describe('EXPLANATIONS', () => {
  it('covers exactly the explaining controls', () => {
    expect(Object.keys(EXPLANATIONS).sort()).toEqual([...IDS].sort());
  });

  it.each(IDS)('%s has a title and two or three plain sentences', id => {
    const { title } = EXPLANATIONS[id];
    const body = explanationBody(id, VARS);
    expect(title.trim()).not.toBe('');
    expect(title[0]).toBe(title[0].toUpperCase());
    expect(sentences(body).length).toBeGreaterThanOrEqual(2);
    expect(sentences(body).length).toBeLessThanOrEqual(3);
    expect(body).toMatch(/[.!?]$/);
    expect(`${title} ${body}`).not.toContain('→');
  });

  it('export-save names the chosen file, its format and the sequence count', () => {
    expect(explanationBody('export-save', VARS)).toContain('demo.gb, a GenBank file of these 4 sequences');
    expect(explanationBody('export-save', { fileName: 'one.fasta', format: 'FASTA', count: 1 })).toContain('one.fasta, a FASTA file of this sequence');
  });

  it('a parameterised explanation refuses to render without its values', () => {
    expect(() => explanationBody('export-save')).toThrow(/export choices/);
    expect(explanationBody('copy')).toBe(EXPLANATIONS.copy.body);
  });
});
