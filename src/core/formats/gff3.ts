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

import { expandedRemoteParts, expandedWrittenOrder, featureEnvelope } from '@/src/domain/bio/featureEnvelope';
import { isCds, malformedCodeBreakMessage } from '@/src/domain/bio/translation';
import { validCodonStart } from '@/src/domain/bio/codonStart';
import type { BioFeature, FeatureSegment, RemotePart, SeqRecord, SequenceDetails } from '@/src/domain/bio/types';
import { parseLocation } from '../genbank/locationParser';
import { guardRemoteSite } from '../genbank/locationValidation';
import { DETAIL_QUALIFIER } from '@/src/domain/bio/details';
import { splitWrapAround } from '@/src/domain/bio/intervals';
import { getFeatureStrand } from '@/src/domain/bio/strand';
import { isBetweenBasesSite, isOrderLocation } from '@/src/domain/bio/locationFlags';
import { isUndrawnProteinBond } from '@/src/domain/bio/proteinBond';
import { projectGffRange, splitFeaturePart, storedLocalParts } from '@/src/domain/bio/featureParts';
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
  if (!isCds(feature)) return segments.map(() => '.');
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

/** Dunceious shares this feature-level fallback with the GenBank reader; local intervals govern sequence orientation. */
function majorityStrand(parts: FeatureSegment[]): 1 | -1 {
  return parts.filter(part => part.strand === -1).length > parts.length / 2 ? -1 : 1;
}

function referenceKey(metadata: Record<string, string>, id: string): string {
  return JSON.stringify([metadata._gffNamespace ?? '', id]);
}

/** GFF3 IDs are local to their import. Omitted rows still participate in ambiguity checks. */
function indexReferences(features: BioFeature[], emittedIds: ReadonlyMap<BioFeature, string>): Map<string, string | null> {
  const references = new Map<string, string | null>();
  for (const feature of features) {
    const metadata = feature.metadata;
    if (!metadata?.ID) continue;
    const key = referenceKey(metadata, metadata.ID);
    references.set(key, references.has(key) ? null : emittedIds.get(feature) ?? null);
    if (metadata._gffNamespace) references.set(referenceKey({}, metadata.ID), null);
  }
  return references;
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
      const mapped = items.map(item => oldIds.get(referenceKey(metadata, item))).filter((item): item is string => typeof item === 'string');
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

/** NCBI GFF3 applies ambiguity to the genomic columns independently of strand. */
function addPartialRanges(
  attrs: Record<string, string | string[]>, segment: FeatureSegment, warnings: string[], label: string,
): void {
  if (segment.partialStart || segment.partialEnd) attrs.partial = 'true';
  const boundaries = [
    ['start_range', segment.partialStart, segment.gffStartRange, segment.start, segment.start + 1],
    ['end_range', segment.partialEnd, segment.gffEndRange, segment.end, segment.end],
  ] as const;
  for (const [key, partial, retained, boundary, base] of boundaries) {
    if (!partial) continue;
    const range = projectGffRange(retained, boundary, 0);
    const limit = range?.lostAtOriginSplit ? String(base) : range?.limit ?? String(base);
    attrs[key] = key === 'start_range' ? ['.', limit] : [limit, '.'];
    if (range?.lostAtOriginSplit) {
      const original = key === 'start_range' ? `.,${range.limit}` : `${range.limit},.`;
      warnings.push(`${label}: ${key}=${original} cannot be kept on the GFF3 row that owns the boundary after splitting at the origin.`);
    }
  }
}

interface FeatureRows {
  feature: BioFeature;
  featureId: string;
  stored: FeatureSegment[];
  split: FeatureSegment[][];
  segments: FeatureSegment[];
}

function appendFeatureRows(
  lines: string[],
  { feature, featureId, stored, split, segments }: FeatureRows,
  landmark: { seqid: string; recordId: string },
  oldIds: Map<string, string | null>,
  report: ExportReport,
): void {
  const remote = feature.remoteParts ?? [];
  const phases = partPhases(feature, segments);
  const so = soTypeFor(feature.type);
  const metadata = feature.metadata ?? {};
  const attrs: Record<string, string | string[]> = { ID: featureId, Name: feature.name };
  addQualifiers(attrs, metadata, oldIds, report);
  if (feature.translationExceptions?.length) attrs.transl_except = feature.translationExceptions;
  const searchNote = searchHitNote(feature);
  if (searchNote) attrs.Note = [...(Array.isArray(attrs.Note) ? attrs.Note : attrs.Note ? [attrs.Note] : []), searchNote];
  if (so.original) attrs.insdc_type = so.original;
  if (isOrderLocation(feature)) attrs.insdc_operator = 'order';
  // GFF3 cannot tell join(complement(a),complement(b)) from complement(join(a,b)) (LOC-3).
  if (segments.some(segment => segment.strand !== undefined)) {
    attrs.insdc_interval_strands = 'true';
    // Splitting one interval can change the majority without changing the stored parent orientation.
    if (majorityStrand([...segments, ...remote]) !== feature.strand) attrs.insdc_parent_strand = feature.strand === -1 ? '-' : '+';
  }
  // GFF3 rows have no nesting; the written order of a nested location travels with them (#241).
  const writtenOrder = expandedWrittenOrder(feature.writtenOrder, stored, split);
  if (writtenOrder.some((rank, i) => rank !== i)) attrs.insdc_written_order = writtenOrder.map(String);
  if (remote.length) {
    // GFF3 has no remote reference: each part travels as `<stored index>:<INSDC descriptor>`.
    attrs.insdc_remote = expandedRemoteParts(remote, split).map(part => {
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
    lines.push([landmark.seqid, sourceColumn(metadata.source, feature.hubEdit === 'added'), so.type, String(feature.start), String(feature.start), metadata.score ?? '.', strand, phases[0], attributeText(attrs)].join('\t'));
    return;
  }
  if (segments.some(segment => segment.partialStart || segment.partialEnd)) attrs.partial = 'true';
  segments.forEach((segment, index) => {
    const partAttrs = { ...attrs };
    if (index > 0) delete partAttrs.transl_except;
    const site = segment.start === segment.end;
    if (site) partAttrs.insdc_site = 'true';
    addPartialRanges(partAttrs, segment, report.gff3RangeWarnings, `${landmark.recordId}: ${feature.name}`);
    const direction = segment.strand ?? getFeatureStrand(feature);
    const strand = direction === 1 ? '+' : direction === -1 ? '-' : direction;
    lines.push([landmark.seqid, sourceColumn(metadata.source, feature.hubEdit === 'added'), so.type, String(site ? segment.start : segment.start + 1), String(segment.end), metadata.score ?? '.', strand, phases[index], attributeText(partAttrs)].join('\t'));
  });
}

export function exportToGff3(
  records: SeqRecord[],
  include: (record: SeqRecord, feature: BioFeature, index: number) => boolean = () => true,
): ExportResult {
  const report = emptyReport();
  const lines = ['##gff-version 3'];
  for (const record of records) {
    const id = encodeSeqid(record.id);
    const length = record.sequence.length;
    const landmark = { seqid: id, recordId: record.id, length, isCircular: record.isCircular };
    const sourceId = `${record.id}.0`;
    const sources = record.features.filter(feature => feature.type === 'source');
    const emittedIds = new Map<BioFeature, string>();
    if (sources[0]) emittedIds.set(sources[0], sourceId);

    let number = 0;
    const rows: FeatureRows[] = [];
    for (const [index, feature] of record.features.entries()) {
      if (feature.type !== 'source' && !include(record, feature, index)) continue;
      const codonStart = feature.metadata?.codon_start;
      if (isCds(feature) && !validCodonStart(codonStart)) {
        report.gff3FeaturesOmitted.push({
          reason: `${record.id}: CDS ${feature.name} omitted; invalid /codon_start=${JSON.stringify(codonStart)}`,
          edited: feature.hubEdit === 'edited' || feature.hubEdit === 'added',
        });
        continue;
      }
      if (feature.metadata?._translationSource === 'removed') report.translationWarnings.push(`${feature.name}: ${feature.metadata._translationMessage ?? 'Translation removed'}`);
      if (feature.type === 'source') continue;
      if (isUndrawnProteinBond(feature)) {
        const name = feature.name === feature.type ? feature.type : `${feature.type} ${feature.name}`;
        report.gff3FeaturesOmitted.push({
          reason: `${record.id}: ${name} (${feature.locationString}) omitted because the bond position is unavailable`,
          edited: feature.hubEdit === 'edited' || feature.hubEdit === 'added',
        });
        continue;
      }
      const featureId = `${record.id}.${++number}`;
      if (feature.remoteParts?.length && !feature.segments?.length) {
        report.remoteOnlyOmitted++;
        continue;
      }
      const local = storedLocalParts(feature);
      const stored = local?.length ? local : [{ start: feature.start, end: feature.end }];
      const split = stored.map(segment => splitFeaturePart(segment, landmark));
      const segments = split.flat();
      if (!segments.length && !isBetweenBasesSite(feature)) continue;
      rows.push({ feature, featureId, stored, split, segments });
      emittedIds.set(feature, featureId);
    }
    const referenceIds = indexReferences(record.features, emittedIds);

    lines.push(`##sequence-region ${id} 1 ${length}`);
    const details = detailsForExport(record, report);
    const attributes: Record<string, string | string[]> = { ID: sourceId, gbkey: 'Src' };
    const sourceMetadata = { ...sources[0]?.metadata };
    const sourceParts = sources.flatMap(feature => feature.segments ?? []);
    const sourceStarts = sourceParts.filter(part => part.start === 0 && part.partialStart);
    const sourceEnds = sourceParts.filter(part => part.end === length && part.partialEnd);
    for (const key of [...Object.values(DETAIL_QUALIFIER), 'country', 'nat-host', 'collection-date', 'gbkey', 'Is_circular']) delete sourceMetadata[key];
    addQualifiers(attributes, sourceMetadata, referenceIds, report);
    addPartialRanges(attributes, {
      start: 0, end: length,
      ...(sourceStarts.length > 0 && { partialStart: true as const, gffStartRange: sourceStarts.find(part => part.gffStartRange)?.gffStartRange }),
      ...(sourceEnds.length > 0 && { partialEnd: true as const, gffEndRange: sourceEnds.find(part => part.gffEndRange)?.gffEndRange }),
    }, report.gff3RangeWarnings, `${record.id}: source`);
    if (record.isCircular) attributes.Is_circular = 'true';
    for (const [key, value] of Object.entries(details)) attributes[DETAIL_QUALIFIER[key as keyof SequenceDetails]] = value;
    lines.push([id, sourceColumn(sourceMetadata.source, false), 'region', '1', String(length), '.', '+', '.', attributeText(attributes)].join('\t'));

    for (const row of rows) {
      appendFeatureRows(lines, row, landmark, referenceIds, report);
      report.gff3Written.annotations++;
      if (row.feature.hubEdit === 'edited' || row.feature.hubEdit === 'added') report.gff3Written.edited++;
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
    if (key === 'transl_except') {
      lists[key] = [...(lists[key] ?? []), ...values];
      result[key] = lists[key].join(',');
      continue;
    }
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

/** Reads `insdc_remote` back into remote parts; nonremote values are skipped, but malformed location descriptors reject the file. */
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

function rotateCircularParts(feature: BioFeature, length: number): void {
  const segments = feature.segments!;
  const hasOrigin = segments.some(part => part.start === 0) && segments.some(part => part.end === length);
  if (!hasOrigin || segments.some((part, i) => i > 0 && part.start < segments[i - 1].start)) return;
  let cut = 0;
  let largestGap = 0;
  for (let i = 1; i < segments.length; i++) {
    const gap = segments[i].start - segments[i - 1].end;
    if (gap > largestGap) {
      largestGap = gap;
      cut = i;
    }
  }
  if (cut === 0) return;
  const phases: string[] = JSON.parse(feature.metadata!._gffPhases!);
  feature.metadata!._gffPhases = JSON.stringify([...phases.slice(cut), ...phases.slice(0, cut)]);
  feature.segments = [...segments.slice(cut), ...segments.slice(0, cut)];
}

function readRows(content: string, lengths: Map<string, number>): { seqid: string; feature: BioFeature; rowNumber: number }[] {
  const rows: { seqid: string; feature: BioFeature; rowNumber: number }[] = [];
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    if (line.startsWith('##FASTA')) break;
    const directive = /^##sequence-region\s+(\S+)\s+1\s+([0-9]+)$/.exec(line);
    if (directive) {
      lengths.set(decode(directive[1]), Number(directive[2]));
      continue;
    }
    if (!line.trim() || line.startsWith('#')) continue;
    const cols = line.split('\t');
    const rowNumber = index + 1;
    if (cols.length < 9) {
      if (isCds({ type: cols[2] ?? '' })) {
        throw new Error(`GFF3 row ${rowNumber}, ${cols[2]}: CDS requires 9 columns for phase and attributes (found ${cols.length})`);
      }
      continue;
    }
    const [encodedId, source, type, from, to, score, strand, phase, raw] = cols;
    const seqid = decode(encodedId);
    const metadata = parseAttributes(raw);
    const featureType = metadata.insdc_type || type;
    const label = metadata.Name || metadata.name || metadata.ID || metadata.id;
    const name = label || `${type}_${from}`;
    if ((isCds({ type }) || isCds({ type: featureType })) && !/^[012]$/.test(phase)) {
      throw new Error(`GFF3 row ${rowNumber}, ${featureType} ${name}: CDS phase must be 0, 1 or 2 (found ${JSON.stringify(phase)})`);
    }
    if (metadata.insdc_remote !== undefined) {
      for (const value of attributeValues(metadata, 'insdc_remote')) {
        const descriptor = value.replace(/\s/g, '').match(/^\d+:(.+)$/)?.[1];
        if (descriptor && guardRemoteSite(descriptor)) {
          throw new Error(`GFF3 row ${rowNumber}: unsupported between-base site in remote descriptor ${JSON.stringify(value)}`);
        }
      }
    }
    const bareException = raw.split(';').find(attribute => !attribute.includes('=') && decode(attribute).trim() === 'transl_except');
    if (bareException !== undefined) throw new Error(`${featureType} ${name}, attribute ${JSON.stringify(bareException)} requires transl_except=(pos:<location>,aa:<residue>) syntax`);
    const site = metadata.insdc_site === 'true' && from === to;
    delete metadata.insdc_site;
    const start = site ? Number(from) : Number(from) - 1;
    const end = Number(to);
    if (!Number.isInteger(start) || !Number.isInteger(end) || (site ? start < 1 : start < 0 || end <= start)) continue;
    // NCBI ranges mark genomic columns 4 and 5. Translation interprets them on each part's strand.
    const startLimit = /^\.,(\d+)$/.exec(metadata.start_range ?? '')?.[1];
    const endLimit = /^(\d+),\.$/.exec(metadata.end_range ?? '')?.[1];
    const marks = {
      ...((startLimit || metadata.insdc_partial_start === '<') && { partialStart: true as const }),
      ...((endLimit || metadata.insdc_partial_end === '>') && { partialEnd: true as const }),
      ...(startLimit && startLimit !== String(start + 1) && { gffStartRange: { boundary: start, limit: startLimit } }),
      ...(endLimit && endLimit !== String(end) && { gffEndRange: { boundary: end, limit: endLimit } }),
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
      type: featureType,
      name: label || `${type}_${start + 1}`,
      start, end, strand: strand === '-' ? -1 : 1, segments: [{ start, end, ...marks }], metadata,
      ...(site && { betweenBases: true as const }),
    };
    if (startLimit) takeListAttribute(feature, 'start_range');
    if (endLimit) takeListAttribute(feature, 'end_range');
    if (metadata.transl_except !== undefined) {
      feature.translationExceptions = attributeValues(metadata, 'transl_except');
      takeListAttribute(feature, 'transl_except');
    }
    const malformed = malformedCodeBreakMessage(feature);
    if (malformed) throw new Error(malformed);
    rows.push({ seqid, feature, rowNumber });
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

  const byId = new Map<string, { feature: BioFeature; translationRow?: number }>();
  for (const { seqid, feature, rowNumber } of annotationRows) {
    const metadata = feature.metadata!;
    if (circular.has(seqid) && feature.end > lengths.get(seqid)!) {
      const length = lengths.get(seqid)!;
      const end = feature.end - length;
      const [original] = feature.segments!;
      feature.segments = splitWrapAround(feature.start, end, length);
      feature.end = end;
      const first = feature.segments[0];
      const last = feature.segments[feature.segments.length - 1];
      if (original.partialStart) first.partialStart = true;
      if (original.partialEnd) last.partialEnd = true;
      if (original.gffStartRange) {
        first.gffStartRange = projectGffRange(original.gffStartRange, first.start, 0, first)
          ?? { boundary: first.start, limit: original.gffStartRange.limit, lostAtOriginSplit: true };
      }
      if (original.gffEndRange) {
        last.gffEndRange = projectGffRange(original.gffEndRange, last.end + length, -length, last)
          ?? { boundary: last.end, limit: original.gffEndRange.limit, lostAtOriginSplit: true };
      }
      const framed = { ...feature, metadata: { ...metadata, codon_start: /^[012]$/.test(metadata.phase) ? String(Number(metadata.phase) + 1) : '1' } };
      metadata._gffPhases = JSON.stringify(partPhases(framed, feature.segments));
    }
    metadata._gffPhases ??= JSON.stringify([metadata.phase]);
    if (metadata.translation !== undefined) metadata._translationSource = 'imported';
    const id = metadata.ID;
    const key = id ? JSON.stringify([seqid, id]) : undefined;
    const group = key ? byId.get(key) : undefined;
    if (group) {
      const previous = group.feature;
      const previousMetadata = previous.metadata!;
      if (metadata.translation !== undefined && isCds(previous)) {
        if (previousMetadata.translation !== undefined && previousMetadata.translation !== metadata.translation) {
          throw new Error(`CDS ${previous.name}, conflicting translation: ${JSON.stringify(previousMetadata.translation)} on row ${group.translationRow} and ${JSON.stringify(metadata.translation)} on row ${rowNumber}`);
        }
        previousMetadata.translation = metadata.translation;
        previousMetadata._translationSource = 'imported';
        group.translationRow ??= rowNumber;
      }
      const explicit = previous.strand !== feature.strand || previous.segments!.some(part => part.strand !== undefined);
      if (explicit) {
        previous.segments = previous.segments!.map(part => ({ ...part, strand: part.strand ?? previous.strand }));
        feature.segments = feature.segments!.map(part => ({ ...part, strand: part.strand ?? feature.strand }));
      }
      if (feature.translationExceptions) previous.translationExceptions = [...(previous.translationExceptions ?? []), ...feature.translationExceptions];
      previous.segments!.push(...feature.segments!);
      previous.start = Math.min(previous.start, feature.start);
      previous.end = Math.max(previous.end, feature.end);
      const phases: string[] = JSON.parse(previousMetadata._gffPhases);
      previousMetadata._gffPhases = JSON.stringify([...phases, ...JSON.parse(metadata._gffPhases)]);
    } else {
      (features[seqid] ??= []).push(feature);
      if (key) byId.set(key, { feature, translationRow: metadata.translation === undefined ? undefined : rowNumber });
    }
  }
  for (const [seqid, values] of Object.entries(features)) {
    for (const feature of values) {
      const remoteParts = takeRemoteParts(feature);
      if (remoteParts) feature.remoteParts = remoteParts;
      const intervals = feature.segments!.length + (remoteParts?.length ?? 0);
      if (intervals > 1) delete feature.betweenBases;
      if (feature.metadata!.insdc_operator === 'order') feature.operator = 'order';
      else if (intervals > 1) feature.operator = 'join';
      delete feature.metadata!.insdc_operator;
      const perInterval = feature.metadata!.insdc_interval_strands === 'true';
      delete feature.metadata!.insdc_interval_strands;
      const parentStrand = feature.metadata!.insdc_parent_strand;
      delete feature.metadata!.insdc_parent_strand;
      const writtenOrder = takeWrittenOrder(feature);
      if (writtenOrder) feature.writtenOrder = writtenOrder;
      if (writtenOrder || perInterval || feature.segments!.some(part => part.strand !== undefined)) {
        // The rows are in evaluation order, each read on its own strand, as the parser stores them.
        feature.segments = feature.segments!.map(part => ({ ...part, strand: part.strand ?? feature.strand }));
        feature.strand = parentStrand === '-' ? -1 : parentStrand === '+' ? 1 : majorityStrand([...feature.segments, ...remoteParts ?? []]);
      } else if (circular.has(seqid) && !remoteParts) {
        // Rotating local rows would change their position relative to the remote intervals.
        rotateCircularParts(feature, lengths.get(seqid)!);
      }
      if (circular.has(seqid)) Object.assign(feature, featureEnvelope(feature, { length: lengths.get(seqid)!, isCircular: true }));
      if (!isCds(feature)) continue;
      const phases: string[] = JSON.parse(feature.metadata!._gffPhases!);
      const reverse = feature.strand === -1 && !feature.segments?.some(part => part.strand !== undefined);
      const phase = phases[reverse ? phases.length - 1 : 0];
      if (/^[012]$/.test(phase)) feature.metadata!.codon_start = String(Number(phase) + 1);
      feature.metadata!._gffPhaseState = phaseState(feature, feature.segments!);
    }
  }
  return { features, details };
}
