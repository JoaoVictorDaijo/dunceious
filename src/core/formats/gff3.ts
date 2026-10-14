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

import type { BioFeature, FeatureSegment, SeqRecord, SequenceDetails } from '@/src/domain/bio/types';
import { DETAIL_QUALIFIER } from '@/src/domain/bio/details';
import { splitWrapAround } from '@/src/domain/bio/intervals';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { detailsForExport, emptyReport, type ExportResult } from '../exportReport';
import { soTypeFor } from './soTypes';

export interface GffSourceRegion {
  details: SequenceDetails;
  start: number;
  end: number;
  feature: BioFeature;
}

function encode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
}

function encodeSeqid(value: string): string {
  return Array.from(value).map(char => /^[a-zA-Z0-9.:^*$@!+_?|-]$/.test(char) ? char : encode(char)).join('');
}

function attributeText(attributes: Record<string, string | string[]>): string {
  return Object.entries(attributes).map(([key, value]) => `${encode(key)}=${Array.isArray(value) ? value.map(encode).join(',') : encode(value)}`).join(';');
}

function attributeValues(metadata: Record<string, string>, key: string): string[] {
  try {
    const lists = JSON.parse(metadata._gffLists ?? '{}');
    const values: unknown = lists?.[key];
    if (Array.isArray(values) && values.every(value => typeof value === 'string') && values.join(',') === metadata[key]) return values;
  } catch {
    // Malformed project caches cannot override editable qualifier values.
  }
  return [metadata[key]];
}

function phaseState(feature: BioFeature, segments: FeatureSegment[]): string {
  return JSON.stringify([feature.start, feature.end, feature.strand, segments, feature.metadata?.codon_start]);
}

function partPhases(feature: BioFeature, segments: FeatureSegment[]): string[] {
  if (feature.type !== 'CDS' && feature.type !== 'SO:0000316') return segments.map(() => '.');
  const imported = feature.metadata?._gffPhases;
  if (imported && feature.metadata?._gffPhaseState === phaseState(feature, segments)) {
    try {
      const phases: unknown = JSON.parse(imported);
      if (Array.isArray(phases) && phases.length === segments.length && phases.every(p => /^[012]$/.test(String(p)))) {
        return phases.map(String);
      }
    } catch {
      // Invalid imported phase data falls back to the feature's reading frame.
    }
  }

  let phase = Math.max(0, Math.min(2, Number(feature.metadata?.codon_start ?? 1) - 1));
  if (!Number.isInteger(phase)) phase = 0;
  const result = segments.map(() => '0');
  const order = segments.map((_, i) => i);
  if (feature.strand === -1 && !segments.some(segment => segment.strand !== undefined)) order.reverse();
  for (const index of order) {
    result[index] = String(phase);
    const length = segments[index].end - segments[index].start;
    phase = ((phase - length) % 3 + 3) % 3;
  }
  return result;
}

export function exportToGff3(records: SeqRecord[]): ExportResult {
  const report = emptyReport();
  const lines = ['##gff-version 3'];
  for (const record of records) {
    const id = encodeSeqid(record.id);
    const length = record.sequence.length;
    lines.push(`##sequence-region ${id} 1 ${length}`);
    const details = detailsForExport(record, report);
    const attributes: Record<string, string> = { ID: `${record.id}.0`, gbkey: 'Src' };
    if (record.isCircular) attributes.Is_circular = 'true';
    for (const [key, value] of Object.entries(details)) attributes[DETAIL_QUALIFIER[key as keyof SequenceDetails]] = value;
    lines.push([id, 'Dunceious', 'region', '1', String(length), '.', '+', '.', attributeText(attributes)].join('\t'));

    let number = 0;
    for (const feature of record.features) {
      if (feature.type === 'source') continue;
      number++;
      const segments = feature.segments?.length ? feature.segments : splitWrapAround(feature.start, feature.end, length);
      const phases = partPhases(feature, segments);
      const so = soTypeFor(feature.type);
      const metadata = feature.metadata ?? {};
      const attrs: Record<string, string | string[]> = { ID: `${record.id}.${number}`, Name: feature.name };
      for (const [key, value] of Object.entries(metadata)) {
        if (key.startsWith('_') || ['ID', 'Name', 'phase', 'score', 'source', 'insdc_type'].includes(key)) continue;
        const outputKey = ['Dbxref', 'Note', 'Alias', 'Ontology_term', 'Parent', 'Target', 'Gap', 'Derives_from', 'Is_circular'].includes(key) ? key : key.toLowerCase();
        const previous = attrs[outputKey];
        const values = previous === undefined ? [] : Array.isArray(previous) ? previous : [previous];
        for (const item of attributeValues(metadata, key)) {
          if (!values.includes(item)) values.push(item);
        }
        attrs[outputKey] = values.length === 1 ? values[0] : values;
      }
      if (so.original) attrs.insdc_type = so.original;
      segments.forEach((segment, index) => {
        const direction = segment.strand ?? getFeatureStrand(feature);
        const strand = direction === 1 ? '+' : direction === -1 ? '-' : direction;
        lines.push([id, 'Dunceious', so.type, String(segment.start + 1), String(segment.end), metadata.score ?? '.', strand, phases[index], attributeText(attrs)].join('\t'));
      });
    }
  }
  return { text: lines.join('\n') + '\n', report };
}



function decode(value: string): string {
  return decodeURIComponent(value);
}

function parseAttributes(raw: string): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  const lists: Record<string, string[]> = Object.create(null);
  for (const attribute of raw.split(';')) {
    const equals = attribute.indexOf('=');
    if (equals < 1) continue;
    const key = decode(attribute.slice(0, equals));
    if (key.startsWith('_')) continue;
    const values = attribute.slice(equals + 1).split(',').map(decode);
    result[key] = values.join(',');
    if (values.length > 1) lists[key] = values;
  }
  if (Object.keys(lists).length) result._gffLists = JSON.stringify(lists);
  return result;
}

function normalizeCircularParts(feature: BioFeature, length: number): void {
  const segments = feature.segments!;
  const hasOrigin = segments.some(part => part.start === 0) && segments.some(part => part.end === length);
  if (segments.length < 2 || !hasOrigin) return;
  let cut = 0;
  const crossesOrigin = segments.some((part, i) => i > 0 && part.start < segments[i - 1].start);
  if (!crossesOrigin) {
    let largestGap = 0;
    for (let i = 1; i < segments.length; i++) {
      const gap = segments[i].start - segments[i - 1].end;
      if (gap > largestGap) {
        largestGap = gap;
        cut = i;
      }
    }
  }
  const ordered = [...segments.slice(cut), ...segments.slice(0, cut)];
  const phases: string[] = JSON.parse(feature.metadata!._gffPhases!);
  feature.metadata!._gffPhases = JSON.stringify([...phases.slice(cut), ...phases.slice(0, cut)]);
  feature.segments = ordered;
  feature.start = ordered[0].start;
  feature.end = ordered[ordered.length - 1].end;
}

function readRows(content: string, lengths: Map<string, number>): { seqid: string; feature: BioFeature }[] {
  const rows: { seqid: string; feature: BioFeature }[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith('##FASTA')) break;
    const directive = /^##sequence-region\s+(\S+)\s+1\s+([0-9]+)$/.exec(line);
    if (directive) {
      lengths.set(decode(directive[1]), Number(directive[2]));
      continue;
    }
    if (!line.trim() || line.startsWith('#')) continue;
    const cols = line.split('\t');
    if (cols.length < 9) continue;
    const [encodedId, source, type, from, to, score, strand, phase, raw] = cols;
    const start = Number(from) - 1;
    const end = Number(to);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) continue;
    const seqid = decode(encodedId);
    const metadata = parseAttributes(raw);
    metadata.source = source;
    metadata.phase = phase;
    if (score !== '.') metadata.score = score;
    // Strand and per-part phases come from columns, never user-provided attributes.
    delete metadata._gffStrand;
    delete metadata._gffPhases;
    delete metadata._gffPhaseState;
    if (strand !== '+' && strand !== '-') metadata._gffStrand = strand === '.' ? '.' : '?';
    const feature: BioFeature = {
      type: metadata.insdc_type || type,
      name: metadata.Name || metadata.name || metadata.ID || metadata.id || `${type}_${start + 1}`,
      start, end, strand: strand === '-' ? -1 : 1, segments: [{ start, end }], metadata,
    };
    rows.push({ seqid, feature });
  }

  return rows;
}

// FIXME(annotation-hub): GFF3 cannot distinguish same-strand inner-complement joins from whole-feature complements.
/** Candidates retain geometry so the import reducer can verify the loaded sequence's length. */
export function parseGFF3(content: string): {
  features: Record<string, BioFeature[]>;
  details: Record<string, GffSourceRegion>;
} {
  const features: Record<string, BioFeature[]> = Object.create(null);
  const details: Record<string, GffSourceRegion> = Object.create(null);
  const lengths = new Map<string, number>();
  const circular = new Set<string>();
  const rows = readRows(content, lengths);

  const annotationRows: typeof rows = [];
  for (const row of rows) {
    const { seqid, feature } = row;
    const metadata = feature.metadata!;
    const isRegion = feature.type === 'region' || feature.type === 'SO:0000001';
    const wholeRegion = isRegion && feature.start === 0 && (!lengths.has(seqid) || lengths.get(seqid) === feature.end);
    if (wholeRegion && metadata.Is_circular === 'true') {
      circular.add(seqid);
      lengths.set(seqid, feature.end);
    }
    if (wholeRegion && metadata.gbkey === 'Src' && !details[seqid]) {
      const values: SequenceDetails = {};
      for (const [key, qualifier] of Object.entries(DETAIL_QUALIFIER)) {
        const value = key === 'location' ? metadata.geo_loc_name ?? metadata.country
          : key === 'host' ? metadata.host ?? metadata['nat-host']
          : key === 'collectionDate' ? metadata.collection_date ?? metadata['collection-date'] : metadata[qualifier];
        if (value !== undefined) values[key as keyof SequenceDetails] = value;
      }
      details[seqid] = { details: values, start: feature.start, end: feature.end, feature };
      if (metadata.Is_circular === 'true') circular.add(seqid);
      lengths.set(seqid, feature.end);
    } else annotationRows.push(row);
  }

  const byId = new Map<string, BioFeature>();
  for (const { seqid, feature } of annotationRows) {
    const metadata = feature.metadata!;
    if (circular.has(seqid) && feature.end > lengths.get(seqid)!) {
      const length = lengths.get(seqid)!;
      const end = feature.end - length;
      feature.segments = splitWrapAround(feature.start, end, length);
      feature.end = end;
      const framed = { ...feature, metadata: { ...metadata, codon_start: /^[012]$/.test(metadata.phase) ? String(Number(metadata.phase) + 1) : '1' } };
      metadata._gffPhases = JSON.stringify(partPhases(framed, feature.segments));
    }
    metadata._gffPhases ??= JSON.stringify([metadata.phase]);
    const id = metadata.ID;
    const key = id ? JSON.stringify([seqid, id]) : undefined;
    const previous = key ? byId.get(key) : undefined;
    if (previous) {
      const explicit = previous.strand !== feature.strand || previous.segments!.some(part => part.strand !== undefined);
      if (explicit) {
        previous.segments = previous.segments!.map(part => ({ ...part, strand: part.strand ?? previous.strand }));
        feature.segments = feature.segments!.map(part => ({ ...part, strand: part.strand ?? feature.strand }));
        previous.strand = 1;
      }
      previous.segments!.push(...feature.segments!);
      previous.start = Math.min(previous.start, feature.start);
      previous.end = Math.max(previous.end, feature.end);
      const phases: string[] = JSON.parse(previous.metadata!._gffPhases!);
      previous.metadata!._gffPhases = JSON.stringify([...phases, ...JSON.parse(metadata._gffPhases)]);
    } else {
      (features[seqid] ??= []).push(feature);
      if (key) byId.set(key, feature);
    }
  }
  for (const [seqid, values] of Object.entries(features)) {
    for (const feature of values) {
      if (circular.has(seqid)) normalizeCircularParts(feature, lengths.get(seqid)!);
      if (feature.type !== 'CDS' && feature.type !== 'SO:0000316') continue;
      const phases: string[] = JSON.parse(feature.metadata!._gffPhases!);
      const reverse = feature.strand === -1 && !feature.segments?.some(part => part.strand !== undefined);
      const phase = phases[reverse ? phases.length - 1 : 0];
      if (/^[012]$/.test(phase)) feature.metadata!.codon_start = String(Number(phase) + 1);
      feature.metadata!._gffPhaseState = phaseState(feature, feature.segments!);
    }
  }
  return { features, details };
}
