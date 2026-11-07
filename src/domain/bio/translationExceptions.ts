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


import type { BioFeature, SeqRecord, TranslationExceptionEvidence } from './types';

export const SENSE_RESIDUES = 'ACDEFGHIKLMNPQRSTVWYUO';
const names: Record<string, string> = Object.fromEntries([
  ...'Ala Arg Asn Asp Cys Gln Glu Gly His Ile Leu Lys Met Phe Pro Ser Thr Trp Tyr Val Sec Pyl'.split(' ').map((name, i) => [name.toUpperCase(), 'ARNDCQEGHILKMFPSTWYVUO'[i]]),
  ...[...SENSE_RESIDUES].map(letter => [letter, letter]),
  ['ASX', 'DN'], ['B', 'DN'], ['GLX', 'EQ'], ['Z', 'EQ'], ['XLE', 'IL'], ['J', 'IL'],
  ['OTHER', SENSE_RESIDUES], ['XAA', SENSE_RESIDUES], ['X', SENSE_RESIDUES], ['TERM', '*'],
]);
type Position = { base: number; strand: 1 | -1; identity?: string };
export type ParsedCodeBreak = { positions: Position[]; possible: string };

/** INSDC 11.4 single-codon grammar; entry bases are converted once to zero-based positions. */
export function parseCodeBreak(raw: string, inherited: 1 | -1): ParsedCodeBreak | string {
  const match = raw.match(/^\(\s*pos:\s*(.+)\s*,\s*aa:\s*([A-Za-z]+)\s*\)$/i);
  if (!match) return 'expected (pos:<exact location>,aa:<INSDC residue>)';
  const possible = names[match[2].toUpperCase()];
  if (!possible) return 'unknown INSDC residue name';
  const text = match[1].replace(/\s/g, '');
  let cursor = 0;
  const location = (strand: 1 | -1): Position[] => {
    if (text.startsWith('complement(', cursor)) {
      cursor += 11;
      const result = location(strand === 1 ? -1 : 1);
      if (text[cursor++] !== ')') throw new Error('unclosed complement');
      return result.reverse();
    }
    if (text.startsWith('join(', cursor)) {
      cursor += 5;
      const result = location(strand);
      while (text[cursor] === ',') { cursor++; result.push(...location(strand)); }
      if (text[cursor++] !== ')') throw new Error('unclosed join');
      if (result.length > 3) throw new Error('a code break names at most three real bases');
      return result;
    }
    const part = text.slice(cursor).match(/^(?:([A-Za-z][A-Za-z0-9_]*(?:\.\d+)?):)?([1-9]\d*)(?:\.\.([1-9]\d*))?/);
    if (!part) throw new Error('position must name exact entry bases');
    cursor += part[0].length;
    const start = Number(part[2]), end = Number(part[3] ?? part[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || end - start > 2) throw new Error('a code break names one to three exact bases');
    return Array.from({ length: end - start + 1 }, (_, i) => ({ base: start + i - 1, strand, identity: part[1] }));
  };
  try {
    const positions = location(1);
    if (inherited === -1 && !text.includes('complement(')) {
      positions.reverse();
      for (const position of positions) position.strand = -1;
    }
    if (cursor !== text.length) return 'illegal position token';
    return { positions, possible };
  } catch (error) { return error instanceof Error ? error.message : 'invalid position'; }
}

/** Map exact entry bases onto extraction's biological codon visits; never round an offset. */
export function codeBreakEvidence(feature: BioFeature, record: Pick<SeqRecord, 'accession' | 'version'>, codingSeq?: string, baseMap?: number[]): TranslationExceptionEvidence[] {
  return (feature.translationExceptions ?? []).map((raw, occurrence) => {
    const evidence: TranslationExceptionEvidence = { feature: feature.name, occurrence, raw, status: 'deferred' };
    const parsed = parseCodeBreak(raw, feature.strand);
    const fail = (status: TranslationExceptionEvidence['status'], reason: string) => ({ ...evidence, status, reason });
    if (typeof parsed === 'string') return fail('malformed', parsed);
    evidence.bases = parsed.positions.map(p => p.base);
    evidence.possible = parsed.possible;
    if (parsed.positions.length < 3 && parsed.possible !== '*') return fail('malformed', 'incomplete codon: short code break requires TERM');
    if (parsed.positions.some(p => p.identity && p.identity !== record.accession && p.identity !== record.version)) return fail('dropped', 'another exact accession/version');
    if (!baseMap || codingSeq === undefined) return fail('deferred', 'CDS geometry is unavailable');
    const offsets = evidence.bases.map(base => baseMap.flatMap((b, i) => b === base ? [i] : []));
    if (offsets.every(visits => !visits.length) && evidence.bases.length === 3) return fail('dropped', 'whole codon is outside CDS');
    const geometry = feature.biological ?? feature;
    const parts = geometry.segments?.length ? geometry.segments : [geometry];
    if (parsed.positions.some(position => parts.some(part =>
      (part.start <= part.end ? position.base >= part.start && position.base < part.end : position.base >= part.start || position.base < part.end)
      && (part.strand ?? feature.strand) !== position.strand))) return fail('malformed', 'contrary-orientation code break');
    if (parsed.positions.length < 3 && !((baseMap.length - parsed.positions.length) % 3 === 0
      && /^(T|TA)$/.test(codingSeq.slice(-parsed.positions.length))
      && evidence.bases.every((base, i) => base === baseMap[baseMap.length - parsed.positions.length + i]))) return fail('malformed', 'incomplete codon: short TERM requires terminal T or TA');
    if (offsets.some(visits => visits.length > 1)) {
      if (!offsets[0].some(start => start % 3 === 0 && evidence.bases!.every((base, i) => baseMap[start + i] === base))) return fail('malformed', 'off-frame or contrary-orientation code break');
      return fail('dropped', 'repeated base visits do not identify one codon');
    }
    if (offsets.some(visits => !visits.length)) return fail('malformed', 'incomplete codon in CDS');
    const indices = offsets.map(visits => visits[0]);
    const first = indices[0];
    if (first % 3 !== 0 || indices.some((offset, i) => offset !== first + i)) return fail('malformed', 'off-frame or contrary-orientation code break');
    evidence.codonIndex = first / 3;
    const warnings: string[] = [];
    if (/aa:\s*OTHER\s*\)$/i.test(raw) && !feature.metadata?.note) warnings.push('OTHER/Xaa requires an explanatory note');
    if (indices.length < 3 && !feature.metadata?.note) warnings.push('terminal T/TA polyadenylation requires an explanatory note');
    return { ...evidence, status: 'applied', ...(warnings.length ? { warnings } : {}) };
  });
}

export function codeBreakMessage(evidence: TranslationExceptionEvidence): string {
  return `CDS ${evidence.feature}, /transl_except occurrence ${evidence.occurrence} ${JSON.stringify(evidence.raw)}: ${evidence.reason ?? evidence.status}`;
}

/** Preserve biological visit order and each position's strand when transforming entry coordinates. */
export function transformCodeBreak(raw: string, strand: 1 | -1, offset: number, keepIdentity = true, circularLength?: number): string {
  const parsed = parseCodeBreak(raw, strand);
  if (typeof parsed === 'string') return raw;
  const positions = parsed.positions.map(position => {
    const base = position.base + offset;
    return { ...position, base: circularLength ? ((base % circularLength) + circularLength) % circularLength : base };
  });
  const chunks: string[] = [];
  for (let i = 0; i < positions.length;) {
    let end = i;
    const first = positions[i];
    while (end + 1 < positions.length && positions[end + 1].strand === first.strand
      && positions[end + 1].identity === first.identity && positions[end + 1].base === positions[end].base + first.strand) end++;
    const last = positions[end];
    const identity = keepIdentity && first.identity ? `${first.identity}:` : '';
    const span = i === end ? `${first.base + 1}` : `${Math.min(first.base, last.base) + 1}..${Math.max(first.base, last.base) + 1}`;
    const location = identity + span;
    chunks.push(first.strand === -1 ? `complement(${location})` : location);
    i = end + 1;
  }
  const location = chunks.length === 1 ? chunks[0] : `join(${chunks.join(',')})`;
  return `(pos:${location},aa:${raw.match(/aa:\s*([A-Za-z]+)/i)![1]})`;
}
