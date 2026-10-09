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

import type { SeqRecord } from '@/src/domain/bio/types';
import { parseFasta, type FastaRecord } from '../formats/fasta';

export type EngineId = 'mafft' | 'kalign' | 'clustalo' | 'muscle';
export type AlignmentMoleculeKind = 'dna' | 'protein';
export interface AlignmentEngine {
  id: EngineId;
  label: string;
  subtext: string;
  maxSequences: number;
  maxBytes: number;
  buildParams: (kind: AlignmentMoleculeKind) => Record<string, string>;
}

export const DEFAULT_ENGINE: EngineId = 'mafft';
export const ALIGNMENT_ENGINES: readonly AlignmentEngine[] = [
  { id: 'mafft', label: 'MAFFT', subtext: 'Accurate and quick on whole genomes. The best general choice.', maxSequences: 500, maxBytes: 1_000_000,
    buildParams: kind => ({ stype: kind, format: 'fasta', order: 'input' }) },
  { id: 'kalign', label: 'Kalign', subtext: 'Fastest, about 3× MAFFT. Slightly less precise on divergent sequences.', maxSequences: 2000, maxBytes: 2_000_000,
    buildParams: kind => ({ stype: kind, format: 'fasta' }) },
  { id: 'clustalo', label: 'Clustal Omega', subtext: 'Takes the largest inputs. Slower on long genomes.', maxSequences: 4000, maxBytes: 4_000_000,
    buildParams: kind => ({ stype: kind, outfmt: 'fa', order: 'input' }) },
  { id: 'muscle', label: 'MUSCLE', subtext: 'Accurate on small sets. Slowest on long sequences.', maxSequences: 500, maxBytes: 1_000_000,
    buildParams: () => ({ format: 'fasta' }) },
];

export function checkEngineLimits(engine: AlignmentEngine, count: number, bytes: number): string | null {
  if (count < 2) return 'At least 2 sequences are required.';
  if (count > engine.maxSequences) return `${count} sequences — ${engine.label} takes up to ${engine.maxSequences}`;
  if (bytes > engine.maxBytes * 0.995) return `${(bytes / 1_000_000).toFixed(2)} MB — ${engine.label} takes up to ${engine.maxBytes / 1_000_000} MB`;
  return null;
}

export type AlignmentInput = Pick<SeqRecord, 'id' | 'sequence' | 'moleculeType'>;
export interface AlignmentSubmission {
  fasta: string;
  aliases: Map<string, string>;
  sequences: Map<string, string>;
  bytes: number;
}

function fastaEntry(id: string, sequence: string): string {
  return `>${id}\n${sequence.match(/.{1,60}/g)?.join('\n') ?? ''}\n`;
}

export function buildSubmission(records: readonly AlignmentInput[]): AlignmentSubmission {
  const aliases = new Map<string, string>();
  const sequences = new Map<string, string>();
  const fasta = records.map((record, index) => {
    const alias = `s${index + 1}`;
    const sequence = record.sequence.replace(/-/g, '');
    aliases.set(alias, record.id);
    sequences.set(alias, sequence);
    return fastaEntry(alias, sequence);
  }).join('');

  return { fasta, aliases, sequences, bytes: new TextEncoder().encode(fasta).length };
}

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (!code.startsWith('#')) return named[code] ?? entity;
    const value = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : entity;
  });
}

export function parseEbiError(xml: string): string {
  const description = xml.match(/<description(?:\s[^>]*)?>([\s\S]*?)<\/description>/i)?.[1];
  if (description === undefined) return xml.trim().slice(0, 300);
  return decodeXml(description.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1')).trim();
}

export function parseResultTypes(xml: string): string[] {
  return [...xml.matchAll(/<identifier>([^<]*)<\/identifier>/g)].map(match => decodeXml(match[1]).trim());
}

export function pickResultTypes(types: readonly string[]): string[] {
  return ['aln-fasta', 'fa', 'out'].filter(type => types.includes(type));
}

const JOB_STATUSES = ['QUEUED', 'RUNNING', 'FINISHED', 'ERROR', 'FAILURE', 'NOT_FOUND'] as const;
export type JobStatus = typeof JOB_STATUSES[number];
export function parseJobStatus(text: string): JobStatus | null {
  return JOB_STATUSES.find(status => status === text.trim()) ?? null;
}

export function remapAlignment(fasta: string, submission: AlignmentSubmission): { ok: true; records: FastaRecord[] } | { ok: false; reason: string } {
  const records = parseFasta(fasta);
  const returned = new Map(records.map(record => [record.id, record.sequence]));
  if (records.length !== submission.aliases.size || returned.size !== records.length ||
      [...submission.aliases.keys()].some(alias => !returned.has(alias))) {
    return { ok: false, reason: 'The returned alias set does not match the submitted sequences.' };
  }
  const lengths = new Set(records.map(record => record.sequence.length));
  if (lengths.size !== 1 || lengths.has(0)) return { ok: false, reason: 'Aligned lengths must be equal and greater than zero.' };
  for (const [alias, sequence] of returned) {
    if (sequence.replace(/-/g, '').toUpperCase() !== submission.sequences.get(alias)?.toUpperCase()) {
      return { ok: false, reason: `The returned sequence for ${alias} differs from the submitted sequence.` };
    }
  }

  return { ok: true, records: [...submission.aliases].map(([alias, id]) => ({
    ...records.find(record => record.id === alias)!, id, name: id,
  })) };
}
