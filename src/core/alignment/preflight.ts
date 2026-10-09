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

import { ALIGNMENT_ENGINES, buildSubmission, type AlignmentInput, type AlignmentSubmission, type EngineId } from './ebi';

export type EmailValidation = { ok: true; value: string } | { ok: false; reason: 'empty' | 'format' | 'too-long' | 'whitespace' };
export function validateEmail(raw: string): EmailValidation {
  const value = raw.trim();
  if (!value) return { ok: false, reason: 'empty' };
  if (value !== raw) return { ok: false, reason: 'whitespace' };
  if (value.length > 254) return { ok: false, reason: 'too-long' };
  const parts = value.split('@');
  if (parts.length !== 2 || !parts[0] || !/^[\x21-\x7e]+$/.test(value) || /["<>]/.test(value)) return { ok: false, reason: 'format' };
  const domain = parts[1].replace(/\.$/, '');
  const labels = domain.split('.');
  if (labels.length < 2 || labels.some(label => !/^[a-z0-9-]+$/i.test(label)) || !/^[a-z]{2,}$/i.test(labels.at(-1)!)) return { ok: false, reason: 'format' };
  return { ok: true, value };
}

export interface AlignmentIssue {
  code: 'too-few' | 'too-many' | 'too-large' | 'empty-sequence' | 'invalid-characters' | 'internal-stop';
  message: string;
  recordIds?: string[];
  characters?: string[];
}
export type AlignmentPreflight = { ok: true; submission: AlignmentSubmission } | { ok: false; issues: AlignmentIssue[] };
export const GLOBAL_ALIGNMENT_ISSUES = new Set<AlignmentIssue['code']>(['too-few', 'empty-sequence', 'invalid-characters', 'internal-stop']);

function normalizeSequence(sequence: string, protein: boolean): string {
  const ungapped = sequence.replace(/[-.\s]/g, '');
  return protein ? ungapped.replace(/\*$/, '') : ungapped;
}
export function measureAlignmentBytes(records: readonly AlignmentInput[]): number {
  const protein = records.some(record => record.moleculeType === 'protein');
  return records.reduce((bytes, record, index) => {
    const sequence = normalizeSequence(record.sequence, protein);
    return bytes + new TextEncoder().encode(sequence).length + Math.max(1, Math.ceil(sequence.length / 60)) + `>s${index + 1}\n`.length;
  }, 0);
}

export function preflightAlignment(records: readonly AlignmentInput[], engineId: EngineId): AlignmentPreflight {
  const engine = ALIGNMENT_ENGINES.find(engine => engine.id === engineId)!;
  const protein = records.some(record => record.moleculeType === 'protein');
  const alphabet = protein ? /^[ACDEFGHIKLMNPQRSTVWYBXZJUO]$/i : /^[ACGTURYSWKMBDHVN]$/i;
  const issues: AlignmentIssue[] = [];
  const empty: string[] = [];
  const invalid: string[] = [];
  const stops: string[] = [];
  const characters = new Set<string>();
  const bytes = measureAlignmentBytes(records);
  const normalized = records.map(record => {
    const sequence = normalizeSequence(record.sequence, protein);
    if (!sequence) empty.push(record.id);
    if (protein && sequence.includes('*')) stops.push(record.id);
    const bad = [...new Set([...sequence].filter(char => !alphabet.test(char) && !(protein && char === '*')))];
    if (bad.length) { invalid.push(record.id); bad.forEach(char => characters.add(char)); }
    return { ...record, sequence };
  });
  if (records.length < 2) issues.push({ code: 'too-few', message: 'At least 2 sequences are required.' });
  if (records.length > engine.maxSequences) issues.push({ code: 'too-many', message: `${records.length} sequences — ${engine.label} takes up to ${engine.maxSequences}` });
  if (bytes > engine.maxBytes * 0.995) issues.push({ code: 'too-large', message: `${bytes.toLocaleString()} bytes — ${engine.label} accepts a safe payload up to ${(engine.maxBytes * 0.995).toLocaleString()} bytes.` });
  if (empty.length) issues.push({ code: 'empty-sequence', recordIds: empty, message: `Empty sequences: ${empty.slice(0, 5).join(', ')}` });
  if (invalid.length) issues.push({ code: 'invalid-characters', recordIds: invalid.slice(0, 5), characters: [...characters], message: `Dunceious alphabet guard: invalid characters ${[...characters].join(', ')} in ${invalid.slice(0, 5).join(', ')}.` });
  if (stops.length) issues.push({ code: 'internal-stop', recordIds: stops, message: `Dunceious protein guard: internal stop in ${stops.slice(0, 5).join(', ')}.` });

  return issues.length ? { ok: false, issues } : { ok: true, submission: buildSubmission(normalized) };
}
