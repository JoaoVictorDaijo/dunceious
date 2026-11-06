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

import { validCodonStart } from '@/src/domain/bio/codonStart';
import type { BioFeature, FeatureSegment, RemotePart, SeqRecord, SequenceDetails } from '@/src/domain/bio/types';
import { parseLocation } from '../genbank/locationParser';
import { DETAIL_QUALIFIER } from '@/src/domain/bio/details';
import { splitWrapAround } from '@/src/domain/bio/intervals';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { isBetweenBasesSite, isOrderLocation } from '@/src/domain/bio/locationFlags';
import { detailsForExport, emptyReport, type ExportReport, type ExportResult } from '../exportReport';
import { soTypeFor } from './soTypes';
import { searchHitNote } from './searchHitNote';
import { NUCLEOTIDE_QUALIFIERS, PROTEIN_QUALIFIERS } from '../genbank/qualifierRules';

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

/**
 * GFF3 1.26 column 2 names "the algorithm or operating procedure that generated this feature".
 * Exporting does not generate a feature, so an imported source is never replaced; only features
 * added in Dunceious claim it, and an unknown origin is the spec's undefined `.`.
 */
function sourceColumn(source: string | undefined, addedHere: boolean): string {
  // GFF3 1.26 percent-encodes only tab, newline, carriage return, % and control characters.
  if (source) return Array.from(source).map(char => {
    const code = char.charCodeAt(0);
    return code < 0x20 || code === 0x7f || char === '%' ? '%' + code.toString(16).toUpperCase().padStart(2, '0') : char;
  }).join('');
  return addedHere ? 'Dunceious' : '.';
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
  if (!validCodonStart(feature.metadata?.codon_start)) return segments.map(() => '.');
  const imported = feature.metadata?._gffPhases;
  const legacy = !feature.metadata?._gffPhaseState && feature.metadata?.codon_start === undefined;
  if (imported && (legacy || feature.metadata?._gffPhaseState === phaseState(feature, segments))) {
    try {
      const phases: unknown = JSON.parse(imported);
      if (Array.isArray(phases) && phases.length === segments.length && phases.every(p => /^[012]$/.test(String(p)))) {
        return phases.map(String);
      }
    } catch {
      // Invalid imported phase data falls back to the feature's reading frame.
    }
  }

  const initial = legacy && /^[012]$/.test(feature.metadata?.phase ?? '') ? Number(feature.metadata!.phase) : 0;
  let phase = Math.max(0, Math.min(2, Number(feature.metadata?.codon_start ?? initial + 1) - 1));
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

function addQualifiers(
  attrs: Record<string, string | string[]>,
  metadata: Record<string, string>,
  oldIds: Map<string, string | null>,
  report: ExportReport,
): void {
  for (const key of Object.keys(metadata)) {
    if (key.startsWith('_') || ['ID', 'Name', 'phase', 'score', 'source', 'insdc_type'].includes(key)) continue;
    const outputKey = NUCLEOTIDE_QUALIFIERS.has(key) || PROTEIN_QUALIFIERS.has(key) || ['Dbxref', 'Note', 'Alias', 'Ontology_term', 'Parent', 'Target', 'Gap', 'Derives_from', 'Is_circular'].includes(key) ? key : key.toLowerCase();
    const previous = attrs[outputKey];
    const values = previous === undefined ? [] : Array.isArray(previous) ? previous : [previous];
    let items = attributeValues(metadata, key);
    if (key === 'Parent' || key === 'Derives_from') {
      const mapped = items.map(item => oldIds.get(item)).filter((item): item is string => typeof item === 'string');
      if (mapped.length !== items.length) report.droppedAttributes++;
      items = mapped;
      if (!items.length) continue;
    }
    for (const item of items) {
      if (!values.includes(item)) values.push(item);
    }
    attrs[outputKey] = values.length === 1 ? values[0] : values;
  }
}

export function exportToGff3(records: SeqRecord[]): ExportResult {
  const report = emptyReport();
  const lines = ['##gff-version 3'];
  const plans = records.map(record => {
    let number = 0;
    const localIds = new Map<string, string | null>();
    const ids = record.features.map(feature => {
      const id = `${record.id}.${feature.type === 'source' ? 0 : ++number}`;
      const old = feature.metadata?.ID;
      if (old) {
        localIds.set(old, localIds.has(old) && localIds.get(old) !== id ? null : id);
      }
      return id;
    });
    return { record, ids, localIds };
  });
  for (const { record, ids, localIds } of plans) {
    const referenceIds = localIds;
    const id = encodeSeqid(record.id);
    const length = record.sequence.length;
    lines.push(`##sequence-region ${id} 1 ${length}`);
    const details = detailsForExport(record, report);
    const attributes: Record<string, string | string[]> = { ID: `${record.id}.0`, gbkey: 'Src' };
    const sourceMetadata = { ...record.features.find(feature => feature.type === 'source')?.metadata };
    for (const key of [...Object.values(DETAIL_QUALIFIER), 'country', 'nat-host', 'collection-date', 'gbkey', 'Is_circular']) delete sourceMetadata[key];
    addQualifiers(attributes, sourceMetadata, referenceIds, report);
    if (record.isCircular) attributes.Is_circular = 'true';
    for (const [key, value] of Object.entries(details)) attributes[DETAIL_QUALIFIER[key as keyof SequenceDetails]] = value;
    lines.push([id, sourceColumn(sourceMetadata.source, false), 'region', '1', String(length), '.', '+', '.', attributeText(attributes)].join('\t'));

    for (const [featureIndex, feature] of record.features.entries()) {
      if (feature.metadata?._translationSource === 'removed') report.translationWarnings.push(`${feature.name}: ${feature.metadata._translationMessage ?? 'Translation removed'}`);
      if (feature.type === 'source') continue;
      const remote = feature.remoteParts ?? [];
      // GFF3 rows are in this record only; a feature wholly in other entries has none (#245).
      if (remote.length && !feature.segments?.length) {
        report.remoteOnlyOmitted++;
        continue;
      }
      const segments = feature.segments?.length ? feature.segments : splitWrapAround(feature.start, feature.end, length);
      const phases = partPhases(feature, segments);
      const so = soTypeFor(feature.type);
      const metadata = feature.metadata ?? {};
      const attrs: Record<string, string | string[]> = { ID: ids[featureIndex], Name: feature.name };
      addQualifiers(attrs, metadata, referenceIds, report);
      const searchNote = searchHitNote(feature);
      if (searchNote) attrs.Note = [...(Array.isArray(attrs.Note) ? attrs.Note : attrs.Note ? [attrs.Note] : []), searchNote];
      if (so.original) attrs.insdc_type = so.original;
      if (isOrderLocation(feature) && segments.length + remote.length > 1) attrs.insdc_operator = 'order';
      // GFF3 cannot tell join(complement(a),complement(b)) from complement(join(a,b)) (LOC-3).
      if (segments.some(segment => segment.strand !== undefined)) attrs.insdc_interval_strands = 'true';
      // GFF3 rows have no nesting; the written order of a nested location travels with them (#241).
      if (feature.writtenOrder) attrs.insdc_written_order = feature.writtenOrder.map(String);
      if (remote.length) {
        // GFF3 has no remote reference: each part travels as `<stored index>:<INSDC descriptor>`.
        attrs.insdc_remote = remote.map(part => {
          const span = `${part.accession}:${part.partialStart ? '<' : ''}${part.start + 1}..${part.partialEnd ? '>' : ''}${part.end}`;
          return `${part.index}:${part.strand === -1 ? `complement(${span})` : span}`;
        });
        report.remotePartsCarried++;
      }
      if (isBetweenBasesSite(feature)) {
        // GFF3 1.26: a zero-length feature has start equal to end, the site to the right of that base.
        attrs.insdc_site = 'true';
        const direction = getFeatureStrand(feature);
        const strand = direction === 1 ? '+' : direction === -1 ? '-' : direction;
        lines.push([id, sourceColumn(metadata.source, feature.hubEdit === 'added'), so.type, String(feature.start), String(feature.start), metadata.score ?? '.', strand, '.', attributeText(attrs)].join('\t'));
        continue;
      }
      segments.forEach((segment, index) => {
        const partAttrs = { ...attrs };
        if (segment.partialStart) partAttrs.insdc_partial_start = '<';
        if (segment.partialEnd) partAttrs.insdc_partial_end = '>';
        const direction = segment.strand ?? getFeatureStrand(feature);
        const strand = direction === 1 ? '+' : direction === -1 ? '-' : direction;
        lines.push([id, sourceColumn(metadata.source, feature.hubEdit === 'added'), so.type, String(segment.start + 1), String(segment.end), metadata.score ?? '.', strand, phases[index], attributeText(partAttrs)].join('\t'));
      });
    }
  }
  return { text: lines.join('\n') + '\n', report };
}



function decode(value: string): string {
  return decodeURIComponent(value);
}

/** Non-conforming files may hold a literal `%`; such a column is kept as written rather than rejected. */
function decodeSource(value: string): string {
  try {
    return decode(value);
  } catch {
    return value;
  }
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

/** Reads and removes one of Dunceious's own `insdc_*` list attributes. */
function takeListAttribute(feature: BioFeature, key: string): string | undefined {
  const metadata = feature.metadata!;
  const raw = metadata[key];
  delete metadata[key];
  if (metadata._gffLists) {
    const lists = JSON.parse(metadata._gffLists);
    delete lists[key];
    if (Object.keys(lists).length) metadata._gffLists = JSON.stringify(lists);
    else delete metadata._gffLists;
  }
  return raw;
}

/** Reads `insdc_remote` back into remote parts; a value that does not parse as one is dropped. */
function takeRemoteParts(feature: BioFeature): RemotePart[] | undefined {
  const raw = takeListAttribute(feature, 'insdc_remote');
  if (raw === undefined) return undefined;
  const parts = raw.split(',').flatMap(value => {
    const item = value.match(/^(\d+):(.+)$/);
    const [part] = item ? parseLocation(item[2]).remoteParts ?? [] : [];
    return part ? [{ ...part, index: Number(item![1]) }] : [];
  });
  return parts.length ? parts : undefined;
}

/** Reads and removes `insdc_written_order`; a value that is not a permutation of the rows is dropped. */
function takeWrittenOrder(feature: BioFeature): number[] | undefined {
  const raw = takeListAttribute(feature, 'insdc_written_order');
  if (raw === undefined) return undefined;
  const order = raw.split(',').map(Number);
  const length = feature.segments!.length;
  const valid = order.length === length && new Set(order).size === length && order.every(i => Number.isInteger(i) && i >= 0 && i < length);
  return valid ? order : undefined;
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
    const seqid = decode(encodedId);
    const metadata = parseAttributes(raw);
    const site = metadata.insdc_site === 'true' && from === to;
    delete metadata.insdc_site;
    const start = site ? Number(from) : Number(from) - 1;
    const end = Number(to);
    if (!Number.isInteger(start) || !Number.isInteger(end) || (site ? start < 1 : start < 0 || end <= start)) continue;
    // GFF3 has no partial ends; the insdc_partial_* attributes carry INSDC's '<' and '>' per row.
    const marks = {
      ...(metadata.insdc_partial_start === '<' && { partialStart: true as const }),
      ...(metadata.insdc_partial_end === '>' && { partialEnd: true as const }),
    };
    delete metadata.insdc_partial_start;
    delete metadata.insdc_partial_end;
    metadata.source = decodeSource(source);
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
      start, end, strand: strand === '-' ? -1 : 1, segments: [{ start, end, ...marks }], metadata,
      ...(site && { betweenBases: true as const }),
    };
    rows.push({ seqid, feature });
  }

  return rows;
}

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
      const [{ partialStart, partialEnd }] = feature.segments!;
      feature.segments = splitWrapAround(feature.start, end, length);
      feature.end = end;
      if (partialStart) feature.segments[0].partialStart = true;
      if (partialEnd) feature.segments[feature.segments.length - 1].partialEnd = true;
      const framed = { ...feature, metadata: { ...metadata, codon_start: /^[012]$/.test(metadata.phase) ? String(Number(metadata.phase) + 1) : '1' } };
      metadata._gffPhases = JSON.stringify(partPhases(framed, feature.segments));
    }
    metadata._gffPhases ??= JSON.stringify([metadata.phase]);
    if (metadata.translation !== undefined) metadata._translationSource = 'imported';
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
      const remoteParts = takeRemoteParts(feature);
      if (remoteParts) feature.remoteParts = remoteParts;
      const intervals = feature.segments!.length + (remoteParts?.length ?? 0);
      if (intervals > 1) feature.operator = feature.metadata!.insdc_operator === 'order' ? 'order' : 'join';
      delete feature.metadata!.insdc_operator;
      const perInterval = feature.metadata!.insdc_interval_strands === 'true';
      delete feature.metadata!.insdc_interval_strands;
      const writtenOrder = takeWrittenOrder(feature);
      if (writtenOrder) feature.writtenOrder = writtenOrder;
      if (writtenOrder || perInterval) {
        // The rows are in evaluation order, each read on its own strand, as the parser stores them.
        feature.segments = feature.segments!.map(part => ({ ...part, strand: part.strand ?? feature.strand }));
      } else if (circular.has(seqid) && !remoteParts) normalizeCircularParts(feature, lengths.get(seqid)!);
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
