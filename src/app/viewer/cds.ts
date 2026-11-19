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

import { checkedTranslation, compareTranslation, isCds, resolvedTranslationFeature, storedTranslation } from '@/src/domain/bio/translation';
import { validCodonStart } from '@/src/domain/bio/codonStart';
import { otherReadings, startTables, tableOneReadings } from '@/src/domain/bio/assumedTranslation';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { definesOneSequence } from '@/src/domain/bio/locationFlags';
import type { BioFeature, SeqRecord, ConceptualTranslation } from '@/src/domain/bio/types';
import { alignedToOriginalPositions, extractCodingSequence, featureTranslTable, isFeatureBroken, isNcbiGeneticCode } from '@/src/domain/bio';

/** Feature types rendered as translated coding sequences (CDS/ORF, upper- and lower-case forms). */
export const CDS_ORF_TYPES = ['CDS', 'ORF', 'orf', 'cds', 'SO:0000316'];

/** A CDS/ORF whose location defines one coding sequence; an `order()` CDS has none (LOC-7). */
export const isTranslatedFeature = (feature: BioFeature): boolean =>
  (isCds(feature) || ['ORF', 'orf'].includes(feature.type)) && definesOneSequence(feature);

/** A mapped deferral withholds a code-dependent substitution, not the explicitly assumed DNA view. */
export function allowsAssumedCode(result: ConceptualTranslation): boolean {
  return result.status === 'unavailable' && result.reason === 'invalid-code'
    && (result.exceptions ?? []).every(e => e.status !== 'malformed'
      && (e.status !== 'deferred' || (e.codonIndex !== undefined && !!e.bases?.length)));
}

/** Invalid codes cannot verify stored residues or establish the assumed view as a DNA result. */
export function geneticCodeWarning(feature: BioFeature, codingSeq?: string, moleculeType?: SeqRecord['moleculeType']): string | null {
  if (!CDS_ORF_TYPES.includes(feature.type)) return null;
  if (!validCodonStart(feature.metadata?.codon_start)) {
    return `⚠ /codon_start=${feature.metadata?.codon_start ?? ''} is invalid; codons are not translated`;
  }
  if (isNcbiGeneticCode(featureTranslTable(feature))) return null;
  const prefix = `⚠ /transl_table=${feature.metadata?.transl_table ?? ''} is not an NCBI genetic code.`;
  if (moleculeType === 'protein' || typeof getFeatureStrand(feature) !== 'number') return prefix;
  const stored = storedTranslation(feature);
  if (!stored) return `${prefix} Residues assume table 1 (Standard) and may be wrong at code-sensitive codons such as TGA.`;
  if (codingSeq !== undefined && stored.length < Math.floor(codingSeq.length / 3)) {
    return `${prefix} The first ${stored.length} residues are the annotation's /translation and can't be checked; the rest assume table 1.`;
  }
  return `${prefix} The residues shown are the annotation's /translation and can't be checked against the DNA.`;
}

/** Every assumed cell, including invariant ones, must disclose the unknown genetic code. */
export function assumedCodonDescription(codon: string, residue: string, codeSensitive: boolean, initiation = false): string {
  const normalized = codon.toUpperCase().replace(/U/g, 'T');
  const readings = tableOneReadings(normalized);
  const starts = initiation ? startTables(normalized) : [];
  if (starts.length) {
    const others = otherReadings(normalized, true).filter(r => r.residue !== 'M')
      .map(({ residue, tables }) => `${residue === '*' ? 'stop' : residue} in tables ${tables.join(', ')}`);
    return `${normalized}: ${residue}, assuming table 1. M as a start in tables ${starts.join(', ')}.${others.length ? ` ${others.join('; ')}.` : ''}`;
  }
  if (residue === '?') {
    const choices = readings.filter(r => r !== '*').concat(readings.includes('*') ? ['a stop'] : []);
    const alternatives = choices.length > 1 ? `${choices.slice(0, -1).join(', ')} or ${choices.at(-1)}` : choices[0];
    const prefix = `${normalized}: ambiguous, assuming table 1.`;
    if (!alternatives) return `${prefix} This codon cannot be resolved.`;
    return codeSensitive
      ? `${prefix} In table 1 it can be ${alternatives}; other codes read some of these differently.`
      : `${prefix} ${alternatives}, in every NCBI code.`;
  }
  if (codeSensitive) {
    const alternatives = otherReadings(normalized).map(({ residue: other, tables }, i) =>
      `${other === '*' ? 'stop' : other} in ${i === 0 && tables.length > 1 ? 'tables ' : ''}${tables.join(', ')}`);
    return `${normalized}: ${residue === '*' ? 'stop' : residue}, assuming table 1. ${alternatives.length ? alternatives.join('; ') : 'Other codes read some expansions differently'}.`;
  }
  return /^[ACGT]{3}$/.test(normalized)
    ? `${residue}, assuming table 1. ${normalized} reads ${residue} in every NCBI code.`
    : `${residue}, assuming table 1. Every reading of ${normalized} is ${residue} in every NCBI code.`;
}

/** DNA determines CDS stop status; unavailable CDSs have no stop claim. ORFs retain their display policy. */
export const computeBrokenFeatureMap = (
  features: BioFeature[],
  seq: string,
  moleculeType?: SeqRecord['moleculeType'],
  topology: { isCircular?: boolean; biologicalLength?: number } = { isCircular: true },
): Map<BioFeature, boolean> => {
  const map = new Map<BioFeature, boolean>();
  if (moleculeType === 'protein') return map;
  features
    .filter(f => validCodonStart(f.metadata?.codon_start) && isTranslatedFeature(f) && typeof getFeatureStrand(f) === 'number')
    .forEach(f => {
      if (isCds(f)) {
        const broken = isFeatureBroken(f, { sequence: seq, moleculeType, ...topology });
        if (broken !== undefined) map.set(f, broken);
        return;
      }
      const { codingSeq } = extractCodingSequence(resolvedTranslationFeature(f), seq, topology);
      const translTable = featureTranslTable(f);
      // Stored stops remain annotation claims; assumed residues never establish broken status.
      const storedBroken = storedTranslation(f)
        ? /[_*]/.test(storedTranslation(f)!.slice(0, -1)) : undefined;
      map.set(f, storedBroken ?? isFeatureBroken(f, codingSeq, translTable));
    });
  return map;
};

/**
 * Reading frame (0, 1, or 2) of one codon, from its first base. A forward
 * codon reads up from `firstBase`; a reverse codon reads down from it and
 * occupies `[firstBase - 2, firstBase]`, so its frame is the exclusive end
 * `firstBase + 1` modulo 3 and a plain reverse CDS keeps the frame of its
 * `end`. `firstBase` is a biological index: in an alignment the caller maps
 * columns to residues first (see `alignedToOriginalPositions`). Computed per
 * codon rather than per feature so that a ribosomal frameshift inside a join
 * changes frame (and row) where translation really does.
 */
export const codonFrame = (firstBase: number, strand: 1 | -1): 0 | 1 | 2 => {
  const anchor = strand === 1 ? firstBase : firstBase + 1;
  return (((anchor % 3) + 3) % 3) as 0 | 1 | 2;
};

/** Codon pieces follow biological adjacency; alignment gaps split pieces. */
export function codonSpans(indices: number[], positions: ArrayLike<number> | null): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  indices.forEach((index, i) => {
    const previous = indices[i - 1];
    const adjacent = i > 0 && Math.abs(index - previous) === 1 && Math.abs(positions ? positions[index] - positions[previous] : index - previous) === 1;
    const span = adjacent ? spans[spans.length - 1] : undefined;
    if (span) {
      span.start = Math.min(span.start, index);
      span.end = Math.max(span.end, index + 1);
    } else spans.push({ start: index, end: index + 1 });
  });
  return spans;
}

type Frame = 0 | 1 | 2;
type StrandFrame = Frame | -1 | -2 | -3;

/** A feature can occupy the same frame index on both sides of the nucleotide row. */
export function translationLaneKey(strand: 1 | -1, frame: Frame): StrandFrame {
  return strand === 1 ? frame : (-(frame + 1) as StrandFrame);
}

/** One codon stays in the lane of its first biological base, including across a strand change. */
export function codonDisplayAnchor(
  coding: ReturnType<typeof extractCodingSequence>,
  offset: number,
  featureStrand: 1 | -1,
  positions: ArrayLike<number> | null,
): { strand: 1 | -1; frame: Frame } {
  const index = coding.alignedIndices[offset];
  const strand = coding.baseStrands?.[offset] ?? featureStrand;
  return { strand, frame: codonFrame(positions ? positions[index] : index, strand) };
}

/** Amino-acid row assignment for a record's translated CDS/ORF features. */
export interface TranslationLanes {
  /** Lane of each feature's codons per strand and reading frame, counted outward from the nucleotide row. */
  laneOf: Map<BioFeature, Map<StrandFrame, number>>;
  /** Row counts include space for invalid-frame warnings, which have no codon assignment. */
  forward: number;
  reverse: number;
}

export const NO_TRANSLATION_LANES: TranslationLanes = { laneOf: new Map(), forward: 0, reverse: 0 };

/**
 * Packs each strand's CDS/ORF translations into as few rows as possible.
 * Distinct overlapping features retain independent provenance and targets. A
 * frameshifted join reads in two frames, so each frame of a feature is packed
 * on its own and the frameshift step crosses between their rows. Lanes are
 * derived from the whole record, not the viewport, so rows stay put while scrolling.
 */
export const assignTranslationLanes = (
  features: BioFeature[],
  seq: string,
  moleculeType?: SeqRecord['moleculeType'],
  topology: { isCircular?: boolean; biologicalLength?: number } = { isCircular: true },
): TranslationLanes => {
  if (moleculeType === 'protein') return NO_TRANSLATION_LANES;
  const positions = seq.includes('-') ? alignedToOriginalPositions(seq) : null;
  const laneOf = new Map<BioFeature, Map<StrandFrame, number>>();
  type Unit = { feature: BioFeature; key: StrandFrame; spans: { start: number; end: number }[] };
  const byStrand: Record<1 | -1, Unit[]> = { 1: [], [-1]: [] };
  for (const feature of features) {
    const featureStrand = getFeatureStrand(feature);
    if (typeof featureStrand !== 'number' || !validCodonStart(feature.metadata?.codon_start) || !isTranslatedFeature(feature)) continue;
    const result = isCds(feature) ? checkedTranslation(feature, { sequence: seq, moleculeType, ...topology }) : undefined;
    const stored = result ? storedTranslation(feature) : undefined;
    if (result?.status === 'unavailable' && !stored && !allowsAssumedCode(result)) continue;
    const coding = extractCodingSequence(resolvedTranslationFeature(feature), seq, topology);
    const { alignedIndices } = coding;
    const units = new Map<StrandFrame, Unit>();
    const add = (offset: number, pieces: Unit['spans']) => {
      const { strand, frame } = codonDisplayAnchor(coding, offset, featureStrand, positions);
      const key = translationLaneKey(strand, frame);
      let unit = units.get(key);
      if (!unit) {
        unit = { feature, key, spans: [] };
        units.set(key, unit);
        byStrand[strand].push(unit);
      }
      unit.spans.push(...pieces);
    };
    for (let offset = 0; offset < alignedIndices.length; offset += 3) {
      add(offset, codonSpans(alignedIndices.slice(offset, offset + 3), positions));
    }
    if (result?.status === 'ok' && stored && alignedIndices.length) {
      const comparison = compareTranslation(stored, result);
      if (comparison.storedExtra || comparison.storedShortBy) {
        const last = alignedIndices.at(-1)!;
        const tailStrand = coding.baseStrands?.at(-1) ?? featureStrand;
        const pieces = tailStrand === 1 ? [{ start: last + 1, end: last + 31 }] : [{ start: last - 30, end: last }];
        add(Math.floor((alignedIndices.length - 1) / 3) * 3, pieces);
      }
    }
    for (const unit of units.values()) {
      const merged: Unit['spans'] = [];
      unit.spans.sort((a, b) => a.start - b.start).forEach(piece => {
        const last = merged.at(-1);
        if (last && piece.start <= last.end) last.end = Math.max(last.end, piece.end);
        else merged.push({ ...piece });
      });
      unit.spans = merged;
    }
  }
  const pack = (strand: 1 | -1) => {
    const units = byStrand[strand];
    const lanes: (typeof units)[] = [];
    units.sort((a, b) => a.spans[0].start - b.spans[0].start).forEach(unit => {
      let lane = lanes.findIndex(placed => placed.every(p =>
        (p.feature === unit.feature && p.key === unit.key) || unit.spans.every(a => p.spans.every(b => a.end <= b.start || b.end <= a.start))));
      if (lane < 0) lane = lanes.push([]) - 1;
      lanes[lane].push(unit);
      const frames = laneOf.get(unit.feature) ?? new Map<StrandFrame, number>();
      laneOf.set(unit.feature, frames.set(unit.key, lane));
    });
    const needsWarning = features.some(f => CDS_ORF_TYPES.includes(f.type)
      && getFeatureStrand(f) === strand && !validCodonStart(f.metadata?.codon_start));
    return Math.max(lanes.length, needsWarning ? 1 : 0);
  };
  const forward = pack(1);
  const reverse = pack(-1);
  return { laneOf, forward, reverse };
};
