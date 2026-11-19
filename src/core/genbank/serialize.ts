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

import { parseCodeBreak, codeBreakMessage, transformCodeBreak } from '@/src/domain/bio/translationExceptions';
import { isCds, conceptualTranslation } from '@/src/domain/bio/translation';
import type { BioFeature, FeatureSegment, RemotePart, SeqRecord } from '@/src/domain/bio/types';
import { parseLocation } from './locationParser';
import { genBankExportProblem } from '@/src/domain/bio/genbankValidation';
import { hasMixedLocalStrands, splitFeaturePart, storedLocalParts } from '@/src/domain/bio/featureParts';
import { expandedRemoteParts, expandedWrittenOrder } from '@/src/domain/bio/featureEnvelope';
import { formatInsdcLocation } from '@/src/domain/bio/insdcLocation';
import { isOrderLocation, SINGLE_ORDER_CDS_OMISSION } from '@/src/domain/bio/locationFlags';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { DETAIL_QUALIFIER } from '@/src/domain/bio/details';
import { emptyReport, detailsForExport, type ExportResult, type ExportReport } from '../exportReport';
import { searchHitNote } from '../formats/searchHitNote';
import { locationTextProblem } from './locationValidation';
import { NUCLEOTIDE_QUALIFIERS, PROTEIN_QUALIFIERS, formatQualifier, assertGenBankQualifierText, type QualifierSyntax } from './qualifierRules';

/**
 * An INSDC join evaluates contiguous written blocks in order; a complement reverses
 * their order and flips their strands (§3.4.2.2). Find the junctions where a written
 * prefix covers consecutive evaluation ranks at either end of the current block.
 */
function nestedLocation(order: number[], leaves: [string, string][], operator: string): string | null {
  const render = (start: number, end: number, firstRank: number, reversed: boolean): string | null => {
    if (end - start === 1) return leaves[order[start]][reversed ? 1 : 0];
    let minRank = Infinity, maxRank = -Infinity;
    let blockStart = start;
    let nextRank = reversed ? firstRank + end - start - 1 : firstRank;
    const parts: string[] = [];
    for (let i = start; i < end; i++) {
      minRank = Math.min(minRank, order[i]);
      maxRank = Math.max(maxRank, order[i]);
      const size = i - blockStart + 1;
      const blockRank = reversed ? nextRank - size + 1 : nextRank;
      if (minRank !== blockRank || maxRank !== blockRank + size - 1) continue;
      if (size === end - start) return null;
      const body = render(blockStart, i + 1, blockRank, reversed);
      if (!body) {
        const flipped = render(blockStart, i + 1, blockRank, !reversed);
        if (!flipped) return null;
        parts.push(`complement(${flipped})`);
      } else parts.push(body);
      blockStart = i + 1;
      nextRank += reversed ? -size : size;
      minRank = Infinity;
      maxRank = -Infinity;
    }
    return blockStart === end ? `${operator}(${parts.join(',')})` : null;
  };
  const direct = render(0, order.length, 0, false);
  if (direct) return direct;
  const reversed = render(0, order.length, 0, true);
  return reversed && `complement(${reversed})`;
}

function writtenNestedLocation(feature: BioFeature, record: SeqRecord): string | null {
  const stored = storedLocalParts(feature);
  if (!stored?.some(part => part.strand !== undefined)) return null;
  const landmark = { length: record.sequence.length, isCircular: record.isCircular };
  const split = stored.map(part => splitFeaturePart(part, landmark));
  const segments = split.flat();
  const ranks = expandedWrittenOrder(feature.writtenOrder, stored, split);
  if (ranks.every((rank, i) => rank === i)) return null;
  const remoteParts = expandedRemoteParts(feature.remoteParts ?? [], split);
  const parts: (FeatureSegment | RemotePart)[] = [...segments];
  for (const part of remoteParts) parts.splice(part.index, 0, part);

  // Only local written ranks are fixed. Group remote leaves with a neighbouring local leaf in
  // evaluation order so inserting them cannot break a reconstructable local permutation.
  const written = ranks.map((): number[] => []);
  let localIndex = 0;
  parts.forEach((part, i) => {
    const anchor = 'accession' in part ? Math.max(0, localIndex - 1) : localIndex++;
    written[ranks[anchor]].push(i);
  });
  const strandOf = (segment: FeatureSegment) => segment.strand ?? feature.strand;
  const oriented = (segment: FeatureSegment | RemotePart, strand: 1 | -1) => {
    const geometry = 'accession' in segment
      ? { ...segment, strand, segments: [], remoteParts: [{ ...segment, strand, index: 0 }] }
      : { ...segment, strand, segments: [{ ...segment, strand: undefined }] };
    const location = formatInsdcLocation(geometry, landmark);
    return location.kind === 'insdc' ? location.text : location.display;
  };
  const location = nestedLocation(written.flat(), parts.map(segment => [
    oriented(segment, strandOf(segment)), oriented(segment, strandOf(segment) === 1 ? -1 : 1),
  ]), feature.operator ?? 'join');
  if (!location) return null;

  const reread = parseLocation(location, landmark);
  const reverseWhole = reread.strand === -1 && reread.segments.every(part => part.strand === undefined);
  const evaluated = reverseWhole ? reread.segments.slice().reverse() : reread.segments;
  const sameInterval = (actual: FeatureSegment, expected: FeatureSegment) =>
    actual.start === expected.start && actual.end === expected.end
    && Boolean(actual.partialStart) === Boolean(expected.partialStart)
    && Boolean(actual.partialEnd) === Boolean(expected.partialEnd)
    && (actual.strand ?? reread.strand) === strandOf(expected);
  const sameLocal = evaluated.length === segments.length && evaluated.every((part, i) =>
    sameInterval(part, segments[i])
    && (reverseWhole ? evaluated.length - 1 - i : reread.writtenOrder?.[i] ?? i) === ranks[i]);
  const rereadRemote = reread.remoteParts ?? [];
  if (reverseWhole) rereadRemote.reverse();
  const sameRemote = rereadRemote.length === remoteParts.length && rereadRemote.every((part, i) =>
    part.accession === remoteParts[i].accession && sameInterval(part, remoteParts[i])
    && (reverseWhole ? parts.length - 1 - part.index : part.index) === remoteParts[i].index);
  return sameLocal && sameRemote ? location : null;
}

function featureLocation(feature: BioFeature, record: SeqRecord, report: ExportReport): string | null {
  if (feature.locationString) return feature.locationString;
  const length = record.sequence.length;
  const location = formatInsdcLocation(feature, { length, isCircular: record.isCircular });
  if (location.kind === 'no-insdc-form') {
    report.featuresWithoutInsdcLocation[location.reason === 'linear-edge-site' ? 'linearEdgeSite' : 'invalidGeometry']++;
    return null;
  }
  const text = writtenNestedLocation(feature, record) ?? location.text;
  if (isCds(feature) && isOrderLocation(feature) && !isOrderLocation({ locationString: text })) {
    report.genBankFeaturesOmitted.push(`${record.id}: CDS ${feature.name}: ${SINGLE_ORDER_CDS_OMISSION}`);
    return null;
  }
  return text;
}

export function exportToGenBank(records: SeqRecord[]): ExportResult {
  const report = emptyReport();
  records = records.filter(record => {
    const reason = genBankExportProblem(record);
    if (!reason) return true;
    const gaps = /[-.]/.test(record.sequence);
    if (gaps) report.gapRecordsOmitted.push(record.id);
    report.genBankRecordsOmitted.push({ id: record.id, reason: gaps ? `${record.id} not exported: its sequence contains gap characters` : reason });
    return false;
  });
  if (records.some(record => record.features.some(feature => typeof getFeatureStrand(feature) !== 'number'))) {
    throw new Error('GenBank cannot preserve annotations with unknown or unstranded direction. Export GFF3 or project JSON to preserve these annotations, or choose an explicit strand.');
  }
  const text = records.map(record => serializeRecord(record, report)).join('\n');
  return { text, report };
}

function serializeRecord(r: SeqRecord, report: ExportReport): string {
  const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase().replace(/ /g, '-');
  const length = r.sequence.length;
  const topology = r.isCircular ? 'circular' : 'linear  ';
  const isProtein = r.moleculeType === 'protein';
  const molecule = r.moleculeType === 'rna' ? 'RNA' : 'DNA';
  const rules = isProtein ? PROTEIN_QUALIFIERS : NUCLEOTIDE_QUALIFIERS;
  const details = detailsForExport(r, report);
  if (!isProtein && !details.organism) report.missingOrganism++;

  let gb = isProtein
    ? `LOCUS       ${r.id.padEnd(12)} ${length.toString().padStart(7)} aa            ${topology}   UNK ${date}\n`
    : `LOCUS       ${r.id.padEnd(12)} ${length.toString().padStart(7)} bp    ${molecule}     ${topology}   UNK ${date}\n`;
  const marker = ' Exported by Dunceious.';
  const definition = (r.definition || r.name || r.id).replace(marker, '');
  gb += `DEFINITION  ${definition}${marker}\nACCESSION   ${r.accession ?? '.'}\n`;
  if (r.version) gb += `VERSION     ${r.version}\n`;
  gb += `KEYWORDS    .\nSOURCE      ${details.organism || '.'}\n  ORGANISM  ${details.organism || '.'}\nFEATURES             Location/Qualifiers\n`;

  const features = [...r.features.filter(f => f.type === 'source'), ...r.features.filter(f => f.type !== 'source')];
  if (!isProtein && !features.some(f => f.type === 'source')) {
    features.unshift({ type: 'source', name: 'source', start: 0, end: length, strand: 1 });
  }
  for (const feature of features) {
    assertFeatureQualifierText(feature);
    if (feature.metadata?._translationSource === 'removed') report.translationWarnings.push(`${feature.name}: ${feature.metadata._translationMessage ?? 'Translation removed'}`);
    report.droppedAttributes += Object.keys(feature.unknownQualifiers ?? {}).length;
    const text = featureLocation(feature, r, report);
    if (text === null) continue;
    const problem = locationTextProblem(text);
    if (problem) throw new Error(`Feature ${feature.name} location ${JSON.stringify(text)} ${problem.message}.`);
    if (feature.type !== 'source') {
      report.genBankWritten.annotations++;
      if (feature.hubEdit === 'edited' || feature.hubEdit === 'added') report.genBankWritten.edited++;
    }
    gb += `     ${feature.type.padEnd(15)} ${text}\n`;
    const metadata = { ...feature.metadata };
    if (!isCds(feature)) delete metadata.translation;
    if (feature.type === 'source') {
      for (const [key, qualifier] of Object.entries(DETAIL_QUALIFIER)) {
        const value = details[key as keyof typeof details];
        if (!value) {
          delete metadata[qualifier];
          if (key === 'location') delete metadata.country;
        }
      }
      if (!isProtein) metadata.mol_type ||= `unassigned ${molecule}`;
    }
    // A valid name-bearing qualifier keeps custom annotations identifiable after import.
    if (!isProtein && feature.type !== 'source' && feature.name && feature.name !== feature.type && !['gene', 'product', 'locus_tag', 'standard_name'].some(key => metadata[key])) {
      metadata.standard_name = feature.name;
    }
    if (feature.type === 'CDS' && !metadata.codon_start) {
      let phase = metadata.phase;
      if (metadata._gffPhases) {
        try {
          const phases: unknown = JSON.parse(metadata._gffPhases);
          if (Array.isArray(phases)) {
            const reverse = feature.strand === -1 && !feature.segments?.some(part => part.strand !== undefined);
            phase = String(phases[reverse ? phases.length - 1 : 0]);
          }
        } catch {
          // Malformed part phases retain the single-feature phase fallback.
        }
      }
      if (/^[012]$/.test(phase ?? '')) metadata.codon_start = String(Number(phase) + 1);
    }
    gb += serializeCodeBreaks(feature, r, report);
    for (const [key, value] of Object.entries(metadata)) {
      if (key.startsWith('_')) continue;
      const syntax = rules.get(key);
      if (!syntax || (isProtein && key === 'mol_type') || (syntax !== 'flag' && !value)) {
        report.droppedAttributes++;
        continue;
      }
      gb += serializeQualifier(key, value, syntax, feature, r, report);
    }
    const searchNote = searchHitNote(feature);
    if (searchNote) gb += serializeQualifier('note', searchNote, 'quoted', feature, r, report);
  }
  return gb + serializeOrigin(r.sequence) + '//\n';
}

function serializeOrigin(sequence: string): string {
  let text = 'ORIGIN\n';
  const residues = sequence.toLowerCase();
  for (let i = 0; i < residues.length; i += 60) {
    const groups = residues.slice(i, i + 60).match(/.{1,10}/g) ?? [];
    text += `${(i + 1).toString().padStart(9)} ${groups.join(' ')}\n`;
  }
  return text;
}

function serializeCodeBreaks(feature: BioFeature, r: SeqRecord, report: ExportReport): string {
  if (!feature.translationExceptions?.length) return '';
  let text = '';
  const malformed = conceptualTranslation(feature, r).exceptions?.find(e => e.status === 'malformed');
  if (malformed) throw new Error(codeBreakMessage(malformed));
  const mixed = hasMixedLocalStrands(feature);
  for (const [occurrence, raw] of feature.translationExceptions.entries()) {
    const parsed = parseCodeBreak(raw, feature);
    if (typeof parsed === 'string') throw new Error(codeBreakMessage({ feature: feature.name, occurrence, raw, status: 'malformed', reason: parsed }));
    const value = mixed ? transformCodeBreak(raw, feature, 0) : raw;
    text += serializeQualifier('transl_except', value, 'unquoted', feature, r, report);
  }
  return text;
}

function assertFeatureQualifierText(feature: BioFeature): void {
  const metadata = Object.entries(feature.metadata ?? {}).filter(([key]) => !key.startsWith('_'));
  for (const [key, value] of [...Object.entries(feature.unknownQualifiers ?? {}), ...metadata]) assertGenBankQualifierText(key, value);
}

function serializeQualifier(key: string, value: string, syntax: QualifierSyntax, feature: BioFeature, record: SeqRecord, report: ExportReport): string {
  const lines = formatQualifier(key, value, syntax);
  if (/[^\u0020-\u007e]/u.test(value)) report.qualifierWarnings.push(`${record.id}: ${feature.name}, /${key}=${JSON.stringify(value)}: INSDC requires printable ASCII 32–126; exported unchanged by owner policy`);
  return lines.map(line => line + '\n').join('');
}
