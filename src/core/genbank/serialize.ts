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

import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { featureParts } from '@/src/domain/bio/featureParts';
import { formatInsdcLocation } from '@/src/domain/bio/insdcLocation';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { DETAIL_QUALIFIER } from '@/src/domain/bio/details';
import { emptyReport, detailsForExport, type ExportResult, type ExportReport } from '../exportReport';
import { searchHitNote } from '../formats/searchHitNote';
import { NUCLEOTIDE_QUALIFIERS, PROTEIN_QUALIFIERS, formatQualifier } from './qualifierRules';

function featureLocation(feature: BioFeature, record: SeqRecord, report: ExportReport): string | null {
  if (feature.locationString) return feature.locationString;
  const length = record.sequence.length;
  const location = formatInsdcLocation(feature, { length, isCircular: record.isCircular });
  if (location.kind === 'no-insdc-form') {
    report.featuresWithoutInsdcLocation[location.reason === 'linear-edge-site' ? 'linearEdgeSite' : 'invalidGeometry']++;
    return null;
  }
  const parts = featureParts(feature, { length, isCircular: record.isCircular });
  if (!parts.some(part => part.start === part.end)) return location.text;
  // TODO(#230): emit INSDC site syntax once the parser preserves zero-length sites.
  const perPart = parts.some(part => part.strand !== undefined);
  const locations = parts.map(part => {
    const span = `${part.start + 1}..${part.end}`;
    return perPart && part.strand === -1 ? `complement(${span})` : span;
  });
  const text = locations.length > 1 ? `join(${locations.join(',')})` : locations[0];
  return !perPart && feature.strand === -1 ? `complement(${text})` : text;
}

export function exportToGenBank(records: SeqRecord[]): ExportResult {
  const report = emptyReport();
  report.gapRecordsOmitted = records.filter(record => /[-.]/.test(record.sequence)).map(record => record.id);
  records = records.filter(record => !/[-.]/.test(record.sequence));
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
    const text = featureLocation(feature, r, report);
    if (text === null) continue;
    gb += `     ${feature.type.padEnd(15)} ${text}\n`;
    const metadata = { ...feature.metadata };
    if (feature.translation && metadata.translation === undefined) metadata.translation = feature.translation;
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
