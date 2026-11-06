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

import { isCds } from '@/src/domain/bio/translation';
import type { BioFeature, FeatureSegment, SeqRecord } from '@/src/domain/bio/types';
import { parseLocation } from './locationParser';
import { genBankExportProblem } from '@/src/domain/bio/genbankValidation';
import { splitWrapAround } from '@/src/domain/bio/intervals';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { isBetweenBasesSite } from '@/src/domain/bio/locationFlags';
import { DETAIL_QUALIFIER } from '@/src/domain/bio/details';
import { emptyReport, detailsForExport, type ExportResult, type ExportReport } from '../exportReport';
import { searchHitNote } from '../formats/searchHitNote';
import { NUCLEOTIDE_QUALIFIERS, PROTEIN_QUALIFIERS, formatQualifier } from './qualifierRules';

/** An interval, local or in another entry (`accession`, INSDC FT 11.4 §3.4.2.1(e)). */
type Written = FeatureSegment & { accession?: string };

const span = (segment: Written) =>
  `${segment.accession ? `${segment.accession}:` : ''}${segment.partialStart ? '<' : ''}${segment.start + 1}..${segment.partialEnd ? '>' : ''}${segment.end}`;
const oriented = (segment: Written, strand: 1 | -1) => (strand === -1 ? `complement(${span(segment)})` : span(segment));

/**
 * The written form of per-strand segments stored in evaluation order (#241). Written neighbours
 * that evaluation reads in reverse sat inside one `complement(join(...))` (INSDC FT 11.4 §3.4.2.2),
 * so each such run is written back that way, its strands flipped. The result is re-parsed and used
 * only when it gives the stored segments back; otherwise the evaluated form is written.
 */
function writtenNestedLocation(feature: BioFeature, segments: FeatureSegment[]): string | null {
  const order = feature.writtenOrder;
  // writtenOrder ranks local intervals only; with remote parts the evaluated form is written.
  if (order?.length !== segments.length || feature.remoteParts?.length) return null;
  const operator = feature.operator ?? 'join';
  const strandOf = (segment: FeatureSegment) => segment.strand ?? feature.strand;
  const evaluationAt: number[] = [];
  order.forEach((position, i) => { evaluationAt[position] = i; });
  const parts: string[] = [];
  for (let first = 0; first < segments.length;) {
    let last = first;
    while (last + 1 < segments.length && evaluationAt[last + 1] === evaluationAt[last] - 1) last++;
    if (last === first) {
      const segment = segments[evaluationAt[first]];
      parts.push(oriented(segment, strandOf(segment)));
    } else {
      const inner = evaluationAt.slice(first, last + 1).map(i => oriented(segments[i], strandOf(segments[i]) === 1 ? -1 : 1));
      parts.push(`complement(${operator}(${inner.join(',')}))`);
    }
    first = last + 1;
  }
  const location = parts.length === 1 ? parts[0] : `${operator}(${parts.join(',')})`;
  const reread = parseLocation(location);
  const same = reread.segments.length === segments.length && reread.segments.every((part, i) =>
    part.start === segments[i].start && part.end === segments[i].end && (part.strand ?? reread.strand) === strandOf(segments[i]));
  return same ? location : null;
}

/** Rebuild an edited/custom location from its existing segments, preserving
 * their order. This serializes coordinates; it does not extract a spliced product.
 */
function featureLocation(feature: BioFeature, sequenceLength: number): string {
  if (feature.locationString) return feature.locationString;
  if (isBetweenBasesSite(feature)) {
    // INSDC FT 11.4 §3.4.2.1: n^n+1, or length^1 for the site at a circular molecule's origin.
    const site = `${feature.start}^${feature.start === sequenceLength ? 1 : feature.start + 1}`;
    return feature.strand === -1 ? `complement(${site})` : site;
  }
  const remote = feature.remoteParts ?? [];
  const segments = feature.segments?.length || remote.length ? feature.segments ?? [] : splitWrapAround(feature.start, feature.end, sequenceLength);
  const mixed = segments.some(segment => segment.strand !== undefined) || remote.some(part => part.strand !== feature.strand);
  const nested = mixed ? writtenNestedLocation(feature, segments) : null;
  if (nested) return nested;
  // Remote parts go back to their place in the stored order (#245).
  const stored: Written[] = [...segments];
  for (const part of [...remote].sort((a, b) => a.index - b.index)) stored.splice(Math.min(part.index, stored.length), 0, part);
  const locations = stored.map(segment => (mixed ? oriented(segment, segment.strand ?? feature.strand) : span(segment)));
  const location = locations.length > 1 ? `${feature.operator ?? 'join'}(${locations.join(',')})` : locations[0];
  return !mixed && feature.strand === -1 ? `complement(${location})` : location;
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
      if (feature.metadata?._translationSource === 'removed') report.translationWarnings.push(`${feature.name}: ${feature.metadata._translationMessage ?? 'Translation removed'}`);
    report.droppedAttributes += Object.keys(feature.unknownQualifiers ?? {}).length;
    gb += `     ${feature.type.padEnd(15)} ${featureLocation(feature, length)}\n`;
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
    for (const [key, value] of Object.entries(metadata)) {
      if (key.startsWith('_')) continue;
      const syntax = rules.get(key);
      if (!syntax || (isProtein && key === 'mol_type') || (syntax !== 'flag' && !value)) {
        report.droppedAttributes++;
        continue;
      }
      gb += formatQualifier(key, value, syntax).map(line => line + '\n').join('');
    }
    const searchNote = searchHitNote(feature);
    if (searchNote) gb += formatQualifier('note', searchNote, 'quoted').map(line => line + '\n').join('');
  }
  gb += 'ORIGIN\n';
  const residues = r.sequence.toLowerCase();
  for (let i = 0; i < residues.length; i += 60) {
    const groups = residues.slice(i, i + 60).match(/.{1,10}/g) ?? [];
    gb += `${(i + 1).toString().padStart(9)} ${groups.join(' ')}\n`;
  }
  return gb + '//\n';

}
