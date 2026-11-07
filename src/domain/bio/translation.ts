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


import type { BioFeature, SeqRecord, ConceptualTranslation, CodonProvenance, TranslationExceptionEvidence, SelectionArea } from './types';
export type { ConceptualTranslation } from './types';
import { codeBreakEvidence, codeBreakMessage, transformCodeBreak, SENSE_RESIDUES } from './translationExceptions';
import { NCBI_GENETIC_CODES } from './geneticCodes';
import { extractCodingSequence, featureTranslTable, initiatorResidue, isNcbiGeneticCode } from './sequence';
import { definesOneSequence, isFivePrimePartialLocation, isThreePrimePartialLocation } from './locationFlags';
import { invalidLocationPart } from './featureParts';
import { validCodonStart } from './codonStart';
import { getFeatureStrand } from './strand';

type TranslationRecord = Pick<SeqRecord, 'sequence' | 'moleculeType' | 'isCircular' | 'accession' | 'version'> & { biologicalLength?: number };


export const isCds = (feature: Pick<BioFeature, 'type'>): boolean => ['CDS', 'cds', 'SO:0000316'].includes(feature.type);
export const storedTranslation = (feature: { metadata?: Record<string, unknown> }): string | undefined =>
  typeof feature.metadata?.translation === 'string' ? feature.metadata.translation.replace(/\s/g, '') || undefined : undefined;

const bases: Record<string, string> = { A: 'A', C: 'C', G: 'G', T: 'T', R: 'AG', Y: 'CT', S: 'CG', W: 'AT', K: 'GT', M: 'AC', B: 'CGT', D: 'AGT', H: 'ACT', V: 'ACG', N: 'ACGT' };
function expansions(codon: string): string[] {
  let result = [''];
  for (const base of codon) result = result.flatMap(prefix => [...(bases[base] ?? 'ACGT')].map(b => prefix + b));
  return result;
}
function reading(set: string): string {
  if (set.length === 1) return set;
  return ({ DN: 'B', EQ: 'Z', IL: 'J' } as Record<string, string>)[set] ?? 'X';
}

/** Contextual NCBI CDS product, independent of every stored protein assertion. */
export function conceptualTranslation(feature: BioFeature, record: TranslationRecord): ConceptualTranslation {
  const exceptions = geometryCodeBreakEvidence(feature, record);
  const unavailable = (reason: Extract<ConceptualTranslation, { status: 'unavailable' }>['reason']): ConceptualTranslation => ({ status: 'unavailable', reason, ...(exceptions.length ? { exceptions: exceptions.map(e => e.status === 'applied' ? { ...e, status: 'deferred', reason: `translation unavailable: ${reason}` } : e) } : {}) });
  if (record.moleculeType === 'protein') return unavailable('protein-record');
  const table = featureTranslTable(feature);
  if (!isNcbiGeneticCode(table)) return unavailable('invalid-code');
  if (feature.metadata?.transl_except !== undefined) return unavailable('unsupported-exception');
  const strand = getFeatureStrand(feature);
  if (strand !== 1 && strand !== -1) return unavailable('unknown-strand');
  if (!definesOneSequence(feature)) return unavailable('nonlocal-location');
  const source = feature.biological ?? feature;
  const length = feature.biological ? record.biologicalLength ?? record.sequence.replace(/-/g, '').length : record.sequence.length;
  if (!feature.segments?.length || (source.segments?.length ? source.segments : [source]).some(part => invalidLocationPart(part, { length, isCircular: record.isCircular }))) return unavailable('unknown-completeness');
  const resolved = resolvedTranslationFeature(feature);
  const { codingSeq, alignedIndices } = extractCodingSequence(resolved, record.sequence, { isCircular: record.isCircular, biologicalLength: record.biologicalLength });
  if (!codingSeq) return unavailable('empty');
  const seq = codingSeq.toUpperCase().replace(/U/g, 'T');
  const code = NCBI_GENETIC_CODES[table];
  const possible: string[] = [];
  const residues: string[] = [];
  const ordinary: string[] = [];
  const contextual: string[] = [];
  const full = Math.floor(seq.length / 3);
  const index = (codon: string) => [...codon].reduce((n, b) => n * 4 + 'TCAG'.indexOf(b), 0);
  const readings = (codon: string, terminal: boolean) => [...new Set(expansions(codon).map(c => {
    const i = index(c);
    return terminal && code.starts[i] === '*' ? '*' : code.aminoAcids[i];
  }))].sort().join('');
  for (let i = 0; i < full; i++) {
    const codon = seq.slice(i * 3, i * 3 + 3);
    ordinary.push(readings(codon, false));
    let set = readings(codon, i === full - 1 && seq.length % 3 === 0 && !isThreePrimePartialLocation(resolved));
    if (i === 0 && !isFivePrimePartialLocation(resolved) && Number(feature.metadata?.codon_start ?? 1) === 1 && initiatorResidue(codon, table)) set = 'M';
    contextual.push(set);
    possible.push(set); residues.push(reading(set));
  }
  if (seq.length % 3) {
    const set = readings(seq.slice(full * 3).padEnd(3, 'N'), false);
    ordinary.push(set); contextual.push(set);
    if (set.length === 1 && set !== '*') { possible.push(set); residues.push(set); }
  }
  if (feature.translationExceptions?.length) {
    if (exceptions.some(e => e.status === 'malformed' || e.status === 'deferred')) return unavailable('unsupported-exception');
    for (const evidence of exceptions) if (evidence.status === 'applied') {
      possible[evidence.codonIndex!] = evidence.possible!;
      residues[evidence.codonIndex!] = reading(evidence.possible!);
    }
  }
  const codons: CodonProvenance[] = possible.map((effective, codonIndex) => ({
    codonIndex, proteinIndex: codonIndex, fragment: codingSeq.slice(codonIndex * 3, codonIndex * 3 + 3),
    triplet: codingSeq.slice(codonIndex * 3, codonIndex * 3 + 3).padEnd(3, 'N'),
    alignedIndices: alignedIndices.slice(codonIndex * 3, codonIndex * 3 + 3),
    ordinary: ordinary[codonIndex], contextual: contextual[codonIndex], effective,
    terminalRemoved: effective === '*' && codonIndex === possible.length - 1,
  }));
  if (codons.at(-1)?.terminalRemoved) codons[codons.length - 1].proteinIndex = undefined;
  if (possible.at(-1) === '*') { possible.pop(); residues.pop(); }
  const threePrimeIndeterminate = !!possible.at(-1)?.includes('*') && possible.at(-1) !== '*';
  return { status: 'ok', codons, residues: residues.join(''), possible, internalStops: possible.flatMap((p, i) => p === '*' ? [i] : []), threePrimeIndeterminate, alignedIndices: alignedIndices.slice(0, residues.length * 3), ...(exceptions.length ? { exceptions } : {}) };
}

export function compareTranslation(stored: string, conceptual: Extract<ConceptualTranslation, { status: 'ok' }>) {
  const differing: number[] = [];
  for (let i = 0; i < Math.min(stored.length, conceptual.residues.length); i++) {
    const actual = stored[i]; const expected = conceptual.residues[i];
    if (actual === expected) continue;
    const actualSet = ({ B: 'DN', Z: 'EQ', J: 'IL', X: SENSE_RESIDUES } as Record<string, string>)[actual] ?? actual;
    if (expected !== '*' && [...actualSet].some(residue => conceptual.possible[i].includes(residue))) continue;
    differing.push(i);
  }
  return { differing, storedExtra: stored.slice(conceptual.residues.length), storedShortBy: Math.max(0, conceptual.residues.length - stored.length) };
}

/** Disposable JSON cache fits the string-valued qualifier metadata contract. */
export function checkTranslation(feature: BioFeature, record: TranslationRecord): BioFeature {
  if (!isCds(feature)) return feature;
  const conceptual = conceptualTranslation(feature, record);
  const dropped = new Set(geometryCodeBreakEvidence(feature, record).filter(e => e.status === 'dropped').map(e => e.occurrence));
  if (dropped.size) feature = { ...feature, translationExceptions: feature.translationExceptions?.filter((_, i) => !dropped.has(i)) };
  const stored = storedTranslation(feature);
  const comparison = stored && conceptual.status === 'ok' ? compareTranslation(stored, conceptual) : undefined;
  return { ...feature, metadata: { ...feature.metadata, ...(stored && !feature.metadata?._translationSource ? { _translationSource: 'imported' } : {}), _translationCheck: JSON.stringify({ ...conceptual, comparison }) } };
}
export function translationWarning(records: SeqRecord[]): string | null {
  let count = 0;
  const notices: string[] = [];
  for (const record of records) for (const f of record.features) {
    if (!isCds(f)) continue;
    const checked = checkedTranslation(f, record);
    for (const e of checked.exceptions ?? []) {
      if (e.status !== 'applied') notices.push(codeBreakMessage(e));
      for (const warning of e.warnings ?? []) notices.push(`${codeBreakMessage(e)}: ${warning}`);
    }
    if (f.metadata?.exception !== undefined) continue;
    const stored = storedTranslation(f); const result = conceptualTranslation(f, record);
    if (!stored || result.status !== 'ok') continue;
    const c = compareTranslation(stored, result);
    if (c.differing.length || c.storedExtra || c.storedShortBy) count++;
  }
  if (count) notices.push(`${count} CDS have a /translation that differs from their DNA`);
  return notices.length ? `WARNING: ${notices.join('; ')}` : null;
}
export function translationReason(result: ConceptualTranslation, feature: BioFeature): string {
  if (result.status === 'ok') return result.internalStops.length ? `internal stop at codon ${result.internalStops[0] + 1}; fix the CDS or mark it /pseudo` : '';
  return ({ 'protein-record': 'nucleotide translation is not applicable to a protein record', 'invalid-code': `/transl_table=${feature.metadata?.transl_table ?? ''} is not an NCBI genetic code`, 'unsupported-exception': result.exceptions?.find(e => e.status === 'malformed' || e.status === 'deferred')?.reason ?? "/transl_except can't be applied yet", 'unknown-strand': 'biological strand is unknown', 'nonlocal-location': 'location does not define one locally available sequence', 'unknown-completeness': 'CDS end completeness cannot be established', empty: 'CDS has no translatable coding bases' })[result.reason];
}

/** Fill omitted interval orientations only in the per-interval evaluation path (LOC-3). */
export function resolvedTranslationFeature(feature: BioFeature): BioFeature {
  return feature.segments?.some(s => s.strand !== undefined)
    ? { ...feature, segments: feature.segments.map(s => ({ ...s, strand: s.strand ?? feature.strand })) } : feature;
}

/** Import/save/load own cache invalidation; redraws consume that disposable result. */
export function checkedTranslation(feature: BioFeature, record: TranslationRecord): ConceptualTranslation {
  if (feature.metadata?._translationCheck) {
    try {
      return JSON.parse(feature.metadata._translationCheck) as ConceptualTranslation;
    } catch {
      return conceptualTranslation(feature, record);
    }
  }
  return conceptualTranslation(feature, record);
}

export function translationDescription(feature: BioFeature, record: TranslationRecord, result = checkedTranslation(feature, record)): string {
  const clauses = [feature.metadata?._translationMessage ?? ''];
  for (const e of result.exceptions ?? []) {
    if (e.status !== 'applied') clauses.push(codeBreakMessage(e));
    clauses.push(...(e.warnings ?? []));
  }
  if (result.status === 'unavailable') clauses.push(`Can't verify: ${translationReason(result, feature)}`);
  if (result.status === 'ok') {
    if (result.internalStops.length) clauses.push(`${result.residues.length} positions, ${result.internalStops.length} internal stop${result.internalStops.length === 1 ? '' : 's'}`);
    for (const i of result.internalStops) {
      const c = result.codons[i];
      clauses.push(`Internal stop at codon ${i + 1}, bases ${c.alignedIndices.map(n => n + 1).join(', ')}, ${c.fragment}; effective stop under table ${featureTranslTable(feature)}${result.exceptions?.filter(e => e.status === 'applied' && e.codonIndex === i).map(e => `; exception ${e.raw}`).join('') ?? ''}`);
    }
    if (result.threePrimeIndeterminate) {
      const c = result.codons[result.residues.length - 1];
      clauses.push(`End uncertain: ${c.triplet} may read ${[...c.effective].join(', ')}, including a terminal stop; this position is retained`);
    }
  }
  const stored = storedTranslation(feature);
  if (stored && result.status === 'ok') {
    const comparison = compareTranslation(stored, result);
    if (comparison.differing.length) clauses.push(`Annotation differs from DNA at ${comparison.differing.length} codon${comparison.differing.length === 1 ? '' : 's'}`);
    for (const [n, direction] of [[comparison.storedExtra.length, 'longer'], [comparison.storedShortBy, 'shorter']] as const) {
      if (n) clauses.push(`Annotated protein is ${n} translation position${n === 1 ? '' : 's'} ${direction} than the DNA-derived protein`);
    }
    if (feature.metadata?.exception) clauses.push(`/exception: ${feature.metadata.exception}`);
  }
  return clauses.filter(Boolean).join('. ');
}

const recordGaps = new WeakMap<object, { sequence: string; gaps: number[] }>();

/** Cache only gap positions, never a genome-sized entry map for each CDS. */
function entryIndices(record: TranslationRecord, indices: number[]): number[] {
  if (!indices.length) return indices;
  let cached = recordGaps.get(record);
  if (!cached || cached.sequence !== record.sequence) {
    cached = { sequence: record.sequence, gaps: Array.from(record.sequence.matchAll(/-/g), match => match.index) };
    recordGaps.set(record, cached);
  }
  const gaps = cached.gaps;
  if (!gaps.length) return indices;
  return indices.map(index => {
    let low = 0, high = gaps.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (gaps[middle] < index) low = middle + 1;
      else high = middle;
    }
    return index - low;
  });
}

export function malformedCodeBreakMessage(feature: BioFeature, record?: TranslationRecord): string | undefined {
  const evidence = record ? geometryCodeBreakEvidence(feature, record) : codeBreakEvidence(feature, {});
  const malformed = evidence?.find(item => item.status === 'malformed');
  return malformed && codeBreakMessage(malformed);
}

/** INSDC codon membership/shape needs local geometry and frame, independently of genetic-code eligibility. */
export function geometryCodeBreakEvidence(feature: BioFeature, record: TranslationRecord, selection?: Pick<SelectionArea, 'start' | 'end'>): TranslationExceptionEvidence[] {
  const syntax = codeBreakEvidence(feature, record);
  if (!syntax.length) return syntax;
  if (record.moleculeType === 'protein') return syntax.map(e => e.status === 'dropped' ? { ...e, status: 'deferred', reason: 'code breaks require nucleotide coordinates' } : e);
  const strand = getFeatureStrand(feature);
  if ((strand !== 1 && strand !== -1) || !definesOneSequence(feature) || !validCodonStart(feature.metadata?.codon_start)) return syntax;
  const source = feature.biological ?? feature;
  const length = feature.biological ? record.biologicalLength ?? record.sequence.replace(/-/g, '').length : record.sequence.length;
  if (!feature.segments?.length || (source.segments?.length ? source.segments : [source]).some(part => invalidLocationPart(part, { length, isCircular: record.isCircular }))) return syntax;
  const { codingSeq, alignedIndices } = extractCodingSequence(resolvedTranslationFeature(feature), record.sequence, record);
  const mapped = codeBreakEvidence(feature, record, codingSeq.toUpperCase().replace(/U/g, 'T'), entryIndices(record, alignedIndices));
  const sets = new Map<number, Set<string>>();
  for (const evidence of mapped) if (evidence.status === 'applied') {
    const values = sets.get(evidence.codonIndex!) ?? new Set<string>();
    values.add(evidence.possible!);
    sets.set(evidence.codonIndex!, values);
  }
  return mapped.map(evidence => {
    if (evidence.status !== 'applied') return evidence;
    if (sets.get(evidence.codonIndex!)!.size > 1) return { ...evidence, status: 'dropped', reason: 'conflicting residues for one codon' };
    if (!selection) return evidence;
    const missing = evidence.bases!.filter(base => base < selection.start || base >= selection.end);
    if (missing.length) return { ...evidence, status: 'dropped', reason: `${missing.length === evidence.bases!.length ? 'wholly excluded codon' : 'selection destroys codon'}; lost entry bases ${missing.map(base => base + 1).join(', ')}` };
    return { ...evidence, rebased: transformCodeBreak(evidence.raw, feature.strand, -selection.start, false) };
  });
}
