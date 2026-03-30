
// bioWorker.ts

import { processTransposition, calculateConsensus } from '../domain/bio/index';
import type { SeqRecord, BioFeature, FeatureSegment, QuantitativeTrack } from '../domain/bio/types';

/** Annotation track as returned by BED/BedGraph/GFF3 parsers (extends QuantitativeTrack). */
interface AnnotationTrack extends QuantitativeTrack {
  type: string;
}

/** Parsed location data extracted from a GenBank feature line. */
interface ParsedLocation {
  segments: FeatureSegment[];
  strand: 1 | -1;
  start: number;
  end: number;
}

/** Minimal FASTA record (subset of SeqRecord). */
interface FastaRecord {
  id: string;
  name: string;
  sequence: string;
  features: BioFeature[];
}

/**
 * Parses GenBank content into SeqRecord objects.
 */
const parseGenBank = (content: string): SeqRecord[] => {
  const records: SeqRecord[] = [];
  const recordStrings = content.split(/\r?\n\/\/\s*(?:\r?\n|$)/);

  for (const recordStr of recordStrings) {
    if (!recordStr.trim()) continue;

    const lines = recordStr.split(/\r?\n/);
    let id = 'Unknown';
    let name = 'Unknown';
    let definition = '';
    let sequence = '';
    let isCircular = false;
    const features: BioFeature[] = [];
    let isSequence = false;
    let inFeaturesSection = false;

    const parseLocation = (loc: string): ParsedLocation => {
      const strand: 1 | -1 = loc.includes('complement') ? -1 : 1;
      const segments: FeatureSegment[] = [];
      const cleanLoc = loc.replace(/[<>\s]/g, '');
      const regex = /(\d+)(?:\.\.|\^)(\d+)|(\d+)/g;
      let match;
      while ((match = regex.exec(cleanLoc)) !== null) {
        if (match[1] && match[2]) {
          segments.push({ start: parseInt(match[1]) - 1, end: parseInt(match[2]) });
        } else if (match[3]) {
          const val = parseInt(match[3]);
          segments.push({ start: val - 1, end: val });
        }
      }
      let start = 0;
      let end = 0;
      if (segments.length > 0) {
        const firstStart = segments[0].start;
        const lastEnd = segments[segments.length - 1].end;
        const minStart = Math.min(...segments.map(s => s.start));
        const maxEnd = Math.max(...segments.map(s => s.end));
        if (segments.length > 1 && firstStart > lastEnd) {
          start = firstStart;
          end = lastEnd;
        } else {
          start = minStart;
          end = maxEnd;
        }
      }
      return { segments, strand, start, end };
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      if (line.startsWith('LOCUS')) {
        const parts = line.split(/\s+/);
        id = parts[1] || 'Unknown';
        name = id;
        isCircular = line.toLowerCase().includes('circular');
        continue;
      }
      if (line.startsWith('DEFINITION')) {
        definition = line.substring(12).trim();
        while (i + 1 < lines.length && lines[i+1].startsWith(' '.repeat(12))) {
          definition += ' ' + lines[++i].trim();
        }
        name = definition.length > 30 ? definition.substring(0, 27) + '...' : definition;
        continue;
      }
      if (line.startsWith('SOURCE')) {
        const source = line.substring(12).trim();
        if (!definition) name = source;
        continue;
      }
      if (line.startsWith('FEATURES')) {
        inFeaturesSection = true;
        continue;
      }
      if (line.startsWith('ORIGIN')) {
        inFeaturesSection = false;
        isSequence = true;
        continue;
      }
      if (isSequence) {
        sequence += line.replace(/[\d\s]/g, '').toUpperCase();
        continue;
      }
      if (inFeaturesSection) {
        const featureMatch = line.match(/^ {5}(\w+) +(.+)$/);
        if (featureMatch) {
          const [, type, initialLoc] = featureMatch;
          let fullLocation = initialLoc.trim();
          while (i + 1 < lines.length && lines[i+1].startsWith(' '.repeat(21)) && !lines[i+1].trim().startsWith('/')) {
            fullLocation += lines[++i].trim();
          }
          const { segments, strand, start, end } = parseLocation(fullLocation);
          const currentFeature: BioFeature & { translation?: string } = {
            type,
            name: type,
            start, 
            end,   
            strand,
            segments,
            locationString: fullLocation,
            metadata: {}
          };
          while (i + 1 < lines.length && lines[i+1].startsWith(' '.repeat(21))) {
            i++;
            const qualLine = lines[i].trim();
            if (qualLine.startsWith('/')) {
              const qualMatch = qualLine.match(/^\/(\w+)(?:=(.*))?$/);
              if (qualMatch) {
                const [, key, value] = qualMatch;
                let valContent = value ? value.replace(/^"|"$/g, '') : '';
                while (i + 1 < lines.length && lines[i+1].startsWith(' '.repeat(21)) && !lines[i+1].trim().startsWith('/')) {
                  valContent += lines[++i].trim().replace(/"/g, '');
                }
                if (['gene', 'product', 'label', 'locus_tag'].includes(key)) {
                  currentFeature.name = valContent;
                }
                if (key === 'translation') {
                  currentFeature.translation = valContent;
                }
                currentFeature.metadata![key] = valContent;
              }
            }
          }
          features.push(currentFeature);
        }
      }
    }
    records.push({ id, name, definition, sequence, features, isCircular });
  }
  return records;
};

/**
 * Parses FASTA content into simple record objects.
 */
const parseFasta = (content: string): FastaRecord[] => {
  const lines = content.split('\n');
  const results: FastaRecord[] = [];
  let currentId = '';
  let currentSeq = '';

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('>')) {
      if (currentId) {
        results.push({ id: currentId, name: currentId, sequence: currentSeq, features: [] });
      }
      currentId = trimmed.substring(1).split(/\s+/)[0];
      currentSeq = '';
    } else if (trimmed) {
      currentSeq += trimmed;
    }
  });

  if (currentId) {
    results.push({ id: currentId, name: currentId, sequence: currentSeq, features: [] });
  }
  return results;
};

/**
 * Parses BED content.
 */
const parseBED = (content: string, filename: string): Record<string, AnnotationTrack[]> => {
  const lines = content.split('\n');
  const results: Record<string, AnnotationTrack[]> = {};

  lines.forEach(line => {
    if (!line.trim() || line.startsWith('#') || line.startsWith('track') || line.startsWith('browser')) return;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) return;

    const chrom = parts[0];
    const start = parseInt(parts[1]);
    const end = parseInt(parts[2]);
    const scoreVal = parseFloat(parts[4]);

    if (isNaN(start) || isNaN(end)) return;

    if (!results[chrom]) results[chrom] = [];

    // Treat all BED lines as track points if they are from a BED file
    // Default score to 0 if missing or invalid
    const finalScore = isNaN(scoreVal) ? 0 : scoreVal;

    let track = results[chrom].find(t => t.type === 'track' && t.name === filename);
    if (!track) {
      track = {
        type: 'track',
        kind: 'interval',
        id: `${filename}_${chrom}`,
        name: filename,
        data: []
      };
      results[chrom].push(track);
    }
    track.data.push({ start, end, value: finalScore });
  });

  return results;
};

/**
 * Parses GFF3 content.
 */
const parseGFF3 = (content: string): Record<string, BioFeature[]> => {
  const lines = content.split('\n');
  const results: Record<string, BioFeature[]> = {};

  lines.forEach(line => {
    if (!line.trim() || line.startsWith('#')) return;

    const parts = line.trim().split('\t');
    if (parts.length < 9) return;

    const seqid = parts[0];
    const source = parts[1];
    const type = parts[2];
    const start = parseInt(parts[3]) - 1;
    const end = parseInt(parts[4]);
    const score = parts[5];
    const strandChar = parts[6];
    const phase = parts[7];
    const attributesStr = parts[8];

    if (isNaN(start) || isNaN(end)) return;

    const strand: 1 | -1 = strandChar === '-' ? -1 : 1;
    const metadata: Record<string, string> = { source, phase };
    if (score !== '.') metadata.score = score;

    const attrParts = attributesStr.split(';');
    let name = '';
    attrParts.forEach(attr => {
      const [key, value] = attr.split('=');
      if (key && value) {
        metadata[key] = decodeURIComponent(value);
        if (key.toLowerCase() === 'id' && !name) name = value;
        if (key.toLowerCase() === 'name') name = value;
      }
    });

    if (!name) name = `${type}_${start + 1}`;

    const feature: BioFeature = {
      type,
      name,
      start,
      end,
      strand,
      metadata
    };

    if (!results[seqid]) results[seqid] = [];
    results[seqid].push(feature);
  });

  return results;
};

/**
 * Parses BedGraph content.
 */
const parseBedGraph = (content: string, filename: string): Record<string, AnnotationTrack[]> => {
  const lines = content.split('\n');
  const results: Record<string, AnnotationTrack[]> = {};

  lines.forEach(line => {
    if (!line.trim() || line.startsWith('#') || line.startsWith('track') || line.startsWith('browser')) return;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) return;

    const chrom = parts[0];
    const start = parseInt(parts[1]);
    const end = parseInt(parts[2]);
    const value = parseFloat(parts[3]);

    if (isNaN(start) || isNaN(end) || isNaN(value)) return;

    if (!results[chrom]) results[chrom] = [];
    
    // Find or create track for this file in this chromosome
    let track = results[chrom].find(t => t.type === 'track' && t.name === filename);
    if (!track) {
      track = {
        type: 'track',
        kind: 'line',
        id: `${filename}_${chrom}`,
        name: filename,
        data: []
      };
      results[chrom].push(track);
    }
    
    track.data.push({ start, end, value });
  });

  return results;
};

self.onmessage = (e) => {
  const { type, records, content } = e.data;

  if (type === 'PROCESS_RECORDS') {
    try {
      const transposed = processTransposition(records as SeqRecord[]);
      const consensus = calculateConsensus(transposed);
      self.postMessage({ type: 'SUCCESS', records: transposed, consensus });
    } catch (error) {
      self.postMessage({ type: 'ERROR', error: (error as Error).message });
    }
  } else if (type === 'PARSE_GENBANK') {
    try {
      const parsed = parseGenBank(content);
      self.postMessage({ type: 'PARSE_SUCCESS', records: parsed });
    } catch (error) {
      self.postMessage({ type: 'ERROR', error: (error as Error).message });
    }
  } else if (type === 'PARSE_FASTA') {
    try {
      const parsed = parseFasta(content);
      self.postMessage({ type: 'FASTA_SUCCESS', alignedData: parsed });
    } catch (error) {
      self.postMessage({ type: 'ERROR', error: (error as Error).message });
    }
  } else if (type === 'PARSE_ANNOTATIONS') {
    try {
      const { filename, content: annotContent } = e.data as { filename: string; content: string };
      const ext = filename.split('.').pop()?.toLowerCase();
      let parsed: Record<string, AnnotationTrack[] | BioFeature[]>;
      
      if (ext === 'bed') parsed = parseBED(annotContent, filename);
      else if (ext === 'gff' || ext === 'gff3') parsed = parseGFF3(annotContent);
      else if (ext === 'bedgraph') parsed = parseBedGraph(annotContent, filename);
      else {
        // Fallback detection
        if (annotContent.includes('\t') && annotContent.split('\n')[0].split('\t').length === 9) {
          parsed = parseGFF3(annotContent);
        } else {
          parsed = parseBED(annotContent, filename);
        }
      }
      
      self.postMessage({ type: 'ANNOTATIONS_SUCCESS', annotations: parsed });
    } catch (error) {
      self.postMessage({ type: 'ERROR', error: (error as Error).message });
    }
  }
};
