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


import type { BioFeature, SeqRecord, ConceptualTranslation, CodonProvenance } from '@/src/domain/bio/types';
import { checkedTranslation, compareTranslation, storedTranslation, translationDescription, translationReason } from '@/src/domain/bio/translation';
import { definesOneSequence } from '@/src/domain/bio/locationFlags';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { assumedTranslation } from '@/src/domain/bio/assumedTranslation';
import { validCodonStart } from '@/src/domain/bio/codonStart';
import { extractCodingSequence, featureTranslTable } from '@/src/domain/bio/sequence';
import { resolvedTranslationFeature } from '@/src/domain/bio/translation';

export interface CodonMark {
  codonIndex: number;
  indices: number[];
  residue: string;
  state: 'ordinary' | 'difference' | 'hidden-stop' | 'early-stop' | 'substitution' | 'terminal' | 'unverified';
  description: string;
}
const names: Record<string, string> = { A: 'Ala', R: 'Arg', N: 'Asn', D: 'Asp', C: 'Cys', Q: 'Gln', E: 'Glu', G: 'Gly', H: 'His', I: 'Ile', L: 'Leu', K: 'Lys', M: 'Met', F: 'Phe', P: 'Pro', S: 'Ser', T: 'Thr', W: 'Trp', Y: 'Tyr', V: 'Val', U: 'Sec', O: 'Pyl', X: 'unknown', B: 'Asx', Z: 'Glx', J: 'Xle', '*': 'stop' };
const named = (residue: string) => `${residue} (${names[residue] ?? 'unknown'})`;
const choices = (set: string) => [...set].map(named).join(', ');
type TranslationRecord = Pick<SeqRecord, 'sequence' | 'moleculeType' | 'isCircular' | 'accession' | 'version'>;

export function codonPrefix(feature: BioFeature, i: number, indices: number[]): string {
  return `${feature.name}, ${getFeatureStrand(feature) === 1 ? 'forward' : 'reverse'} strand, codon ${i + 1}, bases ${indices.map(n => n + 1).join(', ')}.`;
}

function explained(feature: BioFeature, result: Extract<ConceptualTranslation, { status: 'ok' }>, c: CodonProvenance, residue: string, state: CodonMark['state']): string {
  const table = featureTranslTable(feature);
  const applied = result.exceptions?.filter(e => e.status === 'applied' && e.codonIndex === c.codonIndex) ?? [];
  const clauses = [state === 'early-stop' ? 'Early stop before the end of the CDS.' : `${storedTranslation(feature) ? 'Annotated ' : ''}${named(residue)}.`];
  if (state === 'terminal') clauses[0] = 'Terminal stop excluded from the protein.';
  clauses.push(`${c.fragment} ordinarily reads ${choices(c.ordinary)} under table ${table}; the effective conceptual reading is ${choices(c.effective)}.`);
  if (c.codonIndex === 0 && c.contextual === 'M' && c.ordinary !== c.contextual) clauses.push(`Initiator M (Met): a complete CDS starts with M at this codon; contextual reading ${choices(c.contextual)}.`);
  for (const e of applied) clauses.push(`Translation exception: ${e.raw}. Before the exception the contextual reading is ${choices(c.contextual)}; the annotated exception specifies ${choices(c.effective)}.${c.effective.length > 3 ? ' Unspecified sense amino acid.' : ''}`);
  if (state === 'hidden-stop') clauses.push('Early stop in the conceptual CDS; the annotation has a residue here.');
  if (state === 'difference') clauses.push('Stored /translation differs here.');
  if (residue === 'X' && state === 'substitution') clauses.push(`The conceptual reading is ${choices(c.effective)}; the stored residue remains unknown.`);
  if (c.fragment.length < 3) clauses.push(`Partial codon ${c.fragment}; padded with ${3 - c.fragment.length} N bases to ${c.triplet} for conceptual translation; ${choices(c.effective)} under table ${table}.`);
  if (c.effective.length > 1) clauses.push(`Possible readings: ${choices(c.effective)}.`);
  if (result.threePrimeIndeterminate && c.codonIndex === result.residues.length - 1) clauses.push(`End uncertain: ${c.triplet} may read ${choices(c.effective)}, including a terminal stop; this position is retained.`);
  if (feature.metadata?.exception) clauses.push(`Annotated exception: ${feature.metadata.exception}.`);
  return clauses.join(' ');
}

/** Biological evidence is independent of display alignment and viewport movement. */
export function codonMarks(feature: BioFeature, record: TranslationRecord, evidence = checkedTranslation(feature, record)) {
  const cells: CodonMark[] = [];
  const empty = { cells, summary: '', assumed: undefined as ReturnType<typeof assumedTranslation>, comparison: undefined as ReturnType<typeof compareTranslation> | undefined };
  if (record.moleculeType === 'protein' || getFeatureStrand(feature) === undefined || ![1, -1].includes(getFeatureStrand(feature) as number) || !definesOneSequence(feature) || !validCodonStart(feature.metadata?.codon_start)) return empty;
  const stored = storedTranslation(feature);
  const coding = extractCodingSequence(resolvedTranslationFeature(feature), record.sequence, { isCircular: record.isCircular });
  if (!coding.codingSeq) return empty;
  const summary = translationDescription(feature, record, evidence);
  if (evidence.status === 'unavailable') {
    for (let i = 0; i < (stored?.length ?? 0); i++) {
      const indices = coding.alignedIndices.slice(i * 3, i * 3 + 3);
      if (!indices.length) break;
      cells.push({ codonIndex: i, indices, residue: stored![i], state: 'unverified', description: `${codonPrefix(feature, i, indices)} Annotated ${named(stored![i])}. Cannot check against DNA: ${translationReason(evidence, feature)}. ${summary}` });
    }
    return { ...empty, cells, summary, assumed: evidence.reason === 'invalid-code' && !evidence.exceptions?.some(e => e.status === 'malformed' || e.status === 'deferred') ? assumedTranslation(feature, coding.codingSeq) : undefined };
  }
  const comparison = stored ? compareTranslation(stored, evidence) : undefined;
  for (const c of evidence.codons) {
    if (!c.terminalRemoved && stored && c.codonIndex >= stored.length) continue;
    const residue = c.terminalRemoved ? '_' : stored?.[c.codonIndex] ?? evidence.residues[c.codonIndex];
    const stop = evidence.internalStops.includes(c.codonIndex);
    const changed = (c.codonIndex === 0 && c.contextual === 'M' && c.ordinary !== c.contextual) || (c.contextual !== c.effective && !!evidence.exceptions?.some(e => e.status === 'applied' && e.codonIndex === c.codonIndex));
    const state: CodonMark['state'] = c.terminalRemoved ? 'terminal' : stop ? residue === '*' ? 'early-stop' : 'hidden-stop'
      : comparison?.differing.includes(c.codonIndex) ? 'difference' : changed ? 'substitution' : 'ordinary';
    cells.push({ codonIndex: c.codonIndex, indices: c.alignedIndices, residue, state,
      description: `${codonPrefix(feature, c.codonIndex, c.alignedIndices)} ${explained(feature, evidence, c, residue, state)} ${summary}` });
  }
  return { cells, summary, comparison, assumed: undefined };
}

const evidenceCache = new WeakMap<object, { sequence: string; key: string; view: ReturnType<typeof codonMarks> }>();

/** Transposition preserves metadata identity, so mapping revisions can reuse biological evidence. */
export function cachedCodonMarks(feature: BioFeature, record: TranslationRecord) {
  const biological = { ...feature, ...(feature.biological ?? {}), biological: undefined };
  const key = JSON.stringify([biological.start, biological.end, biological.strand, biological.segments, biological.remoteParts,
    biological.operator, biological.locationString, biological.betweenBases, biological.translationExceptions, record.moleculeType, record.isCircular, record.accession, record.version, feature.name]);
  const owner = feature.metadata ?? feature;
  const cached = evidenceCache.get(owner);
  if (cached?.sequence === record.sequence && cached.key === key) return cached.view;
  const view = codonMarks(biological, record);
  evidenceCache.set(owner, { sequence: record.sequence, key, view });
  return view;
}
