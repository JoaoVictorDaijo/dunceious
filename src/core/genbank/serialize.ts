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

import { parseCodeBreak, codeBreakMessage } from '@/src/domain/bio/translationExceptions';
import { isCds, conceptualTranslation } from '@/src/domain/bio/translation';
import type { BioFeature, FeatureSegment, SeqRecord } from '@/src/domain/bio/types';
import { parseLocation } from './locationParser';
import { genBankExportProblem } from '@/src/domain/bio/genbankValidation';
import { featureParts } from '@/src/domain/bio/featureParts';
import { formatInsdcLocation } from '@/src/domain/bio/insdcLocation';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { DETAIL_QUALIFIER } from '@/src/domain/bio/details';
import { emptyReport, detailsForExport, type ExportResult, type ExportReport } from '../exportReport';
import { searchHitNote } from '../formats/searchHitNote';
import { NUCLEOTIDE_QUALIFIERS, PROTEIN_QUALIFIERS, formatQualifier, assertGenBankQualifierText, type QualifierSyntax } from './qualifierRules';

/**
 * The written form of per-strand segments stored in evaluation order (#241). Written neighbours
 * that evaluation reads in reverse sat inside one `complement(join(...))` (INSDC FT 11.4 §3.4.2.2),
 * so each such run is written back that way, its strands flipped. The result is re-parsed and used
 * only when it gives the stored segments back; otherwise the evaluated form is written.
 */
function writtenNestedLocation(feature: BioFeature, segments: FeatureSegment[], record: SeqRecord): string | null {
  const oriented = (segment: FeatureSegment, strand: 1 | -1) => {
    const location = formatInsdcLocation({ ...segment, strand, segments: [{ ...segment, strand: undefined }] }, { length: record.sequence.length, isCircular: record.isCircular });
    return location.kind === 'insdc' ? location.text : location.display;
  };
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

function featureLocation(feature: BioFeature, record: SeqRecord, report: ExportReport): string | null {
  if (feature.locationString) return feature.locationString;
  const length = record.sequence.length;
  const location = formatInsdcLocation(feature, { length, isCircular: record.isCircular });
  if (location.kind === 'no-insdc-form') {
    report.featuresWithoutInsdcLocation[location.reason === 'linear-edge-site' ? 'linearEdgeSite' : 'invalidGeometry']++;
    return null;
  }
  const parts = featureParts(feature, { length, isCircular: record.isCircular });
  const nested = parts.some(part => part.strand !== undefined) ? writtenNestedLocation(feature, parts, record) : null;
  return nested ?? location.text;
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
  gb += 'ORIGIN\n';
  const residues = r.sequence.toLowerCase();
  for (let i = 0; i < residues.length; i += 60) {
    const groups = residues.slice(i, i + 60).match(/.{1,10}/g) ?? [];
    gb += `${(i + 1).toString().padStart(9)} ${groups.join(' ')}\n`;
  }
  return gb + '//\n';
}

function serializeCodeBreaks(feature: BioFeature, r: SeqRecord, report: ExportReport): string {
  if (!feature.translationExceptions?.length) return '';
  let text = '';
  const malformed = conceptualTranslation(feature, r).exceptions?.find(e => e.status === 'malformed');
  if (malformed) throw new Error(codeBreakMessage(malformed));
  for (const [occurrence, raw] of (feature.translationExceptions ?? []).entries()) {
    const parsed = parseCodeBreak(raw, feature.strand);
    if (typeof parsed === 'string') throw new Error(codeBreakMessage({ feature: feature.name, occurrence, raw, status: 'malformed', reason: parsed }));
    text += serializeQualifier('transl_except', raw, 'unquoted', feature, r, report);
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
