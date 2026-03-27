
// bioWorker.ts - Self-contained worker to avoid import resolution issues in some environments

/**
 * Transposes coordinates from raw sequence to aligned sequence containing gaps.
 */
const transposeCoordinates = (
  originalPos: number,
  alignedSeq: string
): number => {
  let ungappedCount = 0;
  for (let i = 0; i < alignedSeq.length; i++) {
    if (ungappedCount === originalPos) {
      return i;
    }
    if (alignedSeq[i] !== '-') {
      ungappedCount++;
    }
  }
  return alignedSeq.length;
};

/**
 * Processes a list of SeqRecords, transposing all their features 
 * based on their provided alignedSequence.
 */
const processTransposition = (records: any[]): any[] => {
  return records.map(record => {
    if (!record.alignedSequence) return record;

    const transposedFeatures = record.features.map((feat: any) => {
      const originalSegments = feat.segments && feat.segments.length > 0 
        ? feat.segments 
        : [{ start: feat.start, end: feat.end }];

      const newSegments: { start: number, end: number }[] = [];

      originalSegments.forEach((seg: any) => {
        const isWrap = seg.start > seg.end;
        const parts = isWrap 
          ? [{ s: seg.start, e: record.sequence.length }, { s: 0, e: seg.end }]
          : [{ s: seg.start, e: seg.end }];

        parts.forEach(part => {
          const alignedStart = transposeCoordinates(part.s, record.alignedSequence!);
          const alignedEnd = transposeCoordinates(part.e, record.alignedSequence!);
          
          let currentStart: number | null = null;
          for (let i = alignedStart; i < alignedEnd; i++) {
            const char = record.alignedSequence![i];
            if (char !== '-') {
              if (currentStart === null) {
                currentStart = i;
              }
            } else {
              if (currentStart !== null) {
                newSegments.push({ start: currentStart, end: i });
                currentStart = null;
              }
            }
          }
          if (currentStart !== null) {
            newSegments.push({ start: currentStart, end: alignedEnd });
          }
        });
      });

      const newStart = transposeCoordinates(feat.start, record.alignedSequence!);
      const newEnd = transposeCoordinates(feat.end, record.alignedSequence!);

      return {
        ...feat,
        start: newStart,
        end: newEnd,
        segments: newSegments
      };
    });

    return {
      ...record,
      features: transposedFeatures
    };
  });
};

/**
 * Calculates a consensus sequence from aligned records.
 */
const calculateConsensus = (records: any[]): string => {
  if (records.length === 0) return "";
  const alignedRecords = records.filter(r => r.alignedSequence);
  if (alignedRecords.length === 0) return "";
  
  const length = Math.max(...alignedRecords.map(r => r.alignedSequence!.length));
  let consensus = "";

  for (let i = 0; i < length; i++) {
    const counts: Record<string, number> = {};
    alignedRecords.forEach(r => {
      const char = r.alignedSequence![i];
      if (char) {
        counts[char] = (counts[char] || 0) + 1;
      }
    });

    let maxChar = "-";
    let maxCount = 0;
    Object.entries(counts).forEach(([char, count]) => {
      if (count > maxCount) {
        maxCount = count;
        maxChar = char;
      }
    });
    consensus += maxChar;
  }
  return consensus;
};

/**
 * Parses GenBank content into SeqRecord objects.
 */
const parseGenBank = (content: string): any[] => {
  const records: any[] = [];
  const recordStrings = content.split(/\r?\n\/\/\s*(?:\r?\n|$)/);

  for (const recordStr of recordStrings) {
    if (!recordStr.trim()) continue;

    const lines = recordStr.split(/\r?\n/);
    let id = 'Unknown';
    let name = 'Unknown';
    let definition = '';
    let sequence = '';
    let isCircular = false;
    const features: any[] = [];
    let isSequence = false;
    let inFeaturesSection = false;

    const parseLocation = (loc: string): { segments: any[], strand: 1 | -1, start: number, end: number } => {
      const strand: 1 | -1 = loc.includes('complement') ? -1 : 1;
      const segments: any[] = [];
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
          const currentFeature: any = {
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
 * Parses FASTA content into simple objects.
 */
const parseFasta = (content: string): any[] => {
  const lines = content.split('\n');
  const results: any[] = [];
  let currentId = '';
  let currentSeq = '';

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('>')) {
      if (currentId) {
        results.push({ id: currentId, sequence: currentSeq });
      }
      currentId = trimmed.substring(1).split(/\s+/)[0];
      currentSeq = '';
    } else if (trimmed) {
      currentSeq += trimmed;
    }
  });

  if (currentId) {
    results.push({ id: currentId, sequence: currentSeq });
  }
  return results;
};

/**
 * Parses BED content.
 */
const parseBED = (content: string, filename: string): Record<string, any[]> => {
  const lines = content.split('\n');
  const results: Record<string, any[]> = {};

  lines.forEach(line => {
    if (!line.trim() || line.startsWith('#') || line.startsWith('track') || line.startsWith('browser')) return;

    const parts = line.trim().split(/\s+/);
    if (parts.length < 3) return;

    const chrom = parts[0];
    const start = parseInt(parts[1]);
    const end = parseInt(parts[2]);
    const _name = parts[3] || `feature_${start}_${end}`;
    const scoreVal = parseFloat(parts[4]);
    const strandChar = parts[5];
    const _strand = strandChar === '-' ? -1 : 1;

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
const parseGFF3 = (content: string): Record<string, any[]> => {
  const lines = content.split('\n');
  const results: Record<string, any[]> = {};

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

    const strand = strandChar === '-' ? -1 : 1;
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

    const feature: any = {
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
const parseBedGraph = (content: string, filename: string): Record<string, any[]> => {
  const lines = content.split('\n');
  const results: Record<string, any[]> = {};

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
      const transposed = processTransposition(records);
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
      const { filename, content } = e.data;
      const ext = filename.split('.').pop()?.toLowerCase();
      let parsed: Record<string, any[]>;
      
      if (ext === 'bed') parsed = parseBED(content, filename);
      else if (ext === 'gff' || ext === 'gff3') parsed = parseGFF3(content);
      else if (ext === 'bedgraph') parsed = parseBedGraph(content, filename);
      else {
        // Fallback detection
        if (content.includes('\t') && content.split('\n')[0].split('\t').length === 9) {
          parsed = parseGFF3(content);
        } else {
          parsed = parseBED(content, filename);
        }
      }
      
      self.postMessage({ type: 'ANNOTATIONS_SUCCESS', annotations: parsed });
    } catch (error) {
      self.postMessage({ type: 'ERROR', error: (error as Error).message });
    }
  }
};
