
import { SeqRecord } from '../types';

const GENETIC_CODE: Record<string, string> = {
  'ATA':'I', 'ATC':'I', 'ATT':'I', 'ATG':'M', 'ACA':'T', 'ACC':'T', 'ACG':'T', 'ACT':'T',
  'AAC':'N', 'AAT':'N', 'AAA':'K', 'AAG':'K', 'AGC':'S', 'AGT':'S', 'AGA':'R', 'AGG':'R',
  'CTA':'L', 'CTC':'L', 'CTG':'L', 'CTT':'L', 'CCA':'P', 'CCC':'P', 'CCG':'P', 'CCT':'P',
  'CAC':'H', 'CAT':'H', 'CAA':'Q', 'CAG':'Q', 'CGA':'R', 'CGC':'R', 'CGG':'R', 'CGT':'R',
  'GTA':'V', 'GTC':'V', 'GTG':'V', 'GTT':'V', 'GCA':'A', 'GCC':'A', 'GCG':'A', 'GCT':'A',
  'GAC':'D', 'GAT':'D', 'GAA':'E', 'GAG':'E', 'GGA':'G', 'GGC':'G', 'GGG':'G', 'GGT':'G',
  'TCA':'S', 'TCC':'S', 'TCG':'S', 'TCT':'S', 'TTC':'F', 'TTT':'F', 'TTA':'L', 'TTG':'L',
  'TAC':'Y', 'TAT':'Y', 'TAA':'_', 'TAG':'_', 'TGC':'C', 'TGT':'C', 'TGA':'_', 'TGG':'W',
};

export const translateSequence = (seq: string): string => {
  let protein = "";
  for (let i = 0; i < seq.length - 2; i += 3) {
    const tCodon = seq.substring(i, i + 3).toUpperCase();
    protein += GENETIC_CODE[tCodon] || '?';
  }
  return protein;
};

export const getNucleotideColor = (char: string): string => {
  const c = char.toUpperCase();
  if (c === 'A') return '#22c55e'; // Emerald
  if (c === 'T') return '#f43f5e'; // Rose
  if (c === 'C') return '#3b82f6'; // Blue
  if (c === 'G') return '#eab308'; // Amber
  if (c === '-') return '#64748b'; // Slate (Gap)
  return '#94a3b8';
};

export const getFeatureColor = (type: string, customColors?: Record<string, string>): string => {
  if (customColors && customColors[type]) return customColors[type];
  
  const colors: Record<string, string> = {
    'gene': '#0ea5e9',      // Sky
    'CDS': '#8b5cf6',       // Violet
    'mRNA': '#10b981',      // Emerald
    'tRNA': '#ec4899',      // Pink
    'rRNA': '#f97316',      // Orange
    'exon': '#14b8a6',      // Teal
    'intron': '#475569',    // Slate Dark
    'promoter': '#fbbf24',  // Amber
    'regulatory': '#f43f5e',// Rose
    'misc_feature': '#a855f7', // Purple
    'primer': '#ef4444',    // Red
    'origin': '#84cc16',    // Lime
    'quantitative_data': '#6366f1' // Indigo
  };
  return colors[type] || '#94a3b8';
};

export const exportToFasta = (records: SeqRecord[], start?: number, end?: number): string => {
  return records.map(r => {
    const seq = r.alignedSequence || r.sequence;
    const finalSeq = (start !== undefined && end !== undefined) 
      ? seq.substring(Math.max(0, start), Math.min(seq.length, end)) 
      : seq;
    const formattedSeq = finalSeq.match(/.{1,60}/g)?.join('\n') || '';
    return `>${r.id}${start !== undefined ? ` [Slice: ${start}-${end}]` : ''}\n${formattedSeq}`;
  }).join('\n\n');
};

export const parseFasta = (content: string): { id: string, sequence: string }[] => {
  const lines = content.split('\n');
  const results: { id: string, sequence: string }[] = [];
  let currentId = '';
  let currentSeq = '';

  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith('>')) {
      if (currentId) {
        results.push({ id: currentId, sequence: currentSeq });
      }
      currentId = trimmed.substring(1).split(/\s+/)[0]; // Get first word as ID
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

export const exportToGff = (records: SeqRecord[]): string => {
  let gff = "##gff-version 3\n";
  records.forEach(r => {
    r.features.forEach(f => {
      const strand = f.strand === 1 ? '+' : '-';
      const attributes = `ID=${f.name.replace(/\s+/g, '_')};Name=${f.name}`;
      gff += `${r.id}\tDunceious\t${f.type}\t${f.start + 1}\t${f.end}\t.\t${strand}\t0\t${attributes}\n`;
    });
  });
  return gff;
};

export const exportToGenBank = (records: SeqRecord[]): string => {
  return records.map(r => {
    const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase().replace(/ /g, '-');
    const seq = r.sequence;
    const length = seq.length;
    
    let gb = `LOCUS       ${r.id.padEnd(12)} ${length.toString().padStart(7)} bp    DNA     linear   UNK ${date}\n`;
    gb += `DEFINITION  ${r.name || r.id} exported from Dunceious.\n`;
    gb += `ACCESSION   ${r.id}\n`;
    gb += `VERSION     ${r.id}\n`;
    gb += `KEYWORDS    .\n`;
    gb += `SOURCE      .\n`;
    gb += `  ORGANISM  .\n`;
    gb += `FEATURES             Location/Qualifiers\n`;
    gb += `     source          1..${length}\n`;
    gb += `                     /organism="."\n`;
    gb += `                     /mol_type="genomic DNA"\n`;

    r.features.forEach(f => {
      const location = f.strand === 1 ? `${f.start + 1}..${f.end}` : `complement(${f.start + 1}..${f.end})`;
      gb += `     ${f.type.padEnd(15)} ${location}\n`;
      gb += `                     /label="${f.name}"\n`;
      if (f.metadata) {
        Object.entries(f.metadata).forEach(([k, v]) => {
          if (v) gb += `                     /${k}="${v}"\n`;
        });
      }
    });

    gb += `ORIGIN\n`;
    for (let i = 0; i < seq.length; i += 60) {
      const line = seq.substring(i, i + 60);
      gb += `${(i + 1).toString().padStart(9)} `;
      for (let j = 0; j < line.length; j += 10) {
        gb += line.substring(j, j + 10) + ' ';
      }
      gb += `\n`;
    }
    gb += `//\n`;
    return gb;
  }).join('\n');
};

export const downloadBlob = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const IUPAC_MAP: Record<string, string> = {
  'A': 'A', 'C': 'C', 'G': 'G', 'T': 'T', 'U': 'U',
  'R': '[AG]', 'Y': '[CT]', 'S': '[GC]', 'W': '[AT]',
  'K': '[GT]', 'M': '[AC]', 'B': '[CGT]', 'D': '[AGT]',
  'H': '[ACT]', 'V': '[ACG]', 'N': '[ACGT]',
};

export const degenerateToRegex = (query: string): RegExp => {
  if (!query) return /$.^/;
  // Escape special regex characters in query if any (though IUPAC usually doesn't have them)
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Allow optional gaps between bases for searching in aligned sequences
  const pattern = escaped.toUpperCase().split('').map(char => IUPAC_MAP[char] || char).join('-*');
  return new RegExp(pattern, 'gi');
};

export const reverseComplement = (seq: string): string => {
  const complement: Record<string, string> = {
    'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C', 'N': 'N',
    'R': 'Y', 'Y': 'R', 'S': 'S', 'W': 'W', 'K': 'M',
    'M': 'K', 'B': 'V', 'D': 'H', 'H': 'D', 'V': 'B',
    'a': 't', 't': 'a', 'c': 'g', 'g': 'c', 'n': 'n',
    '-': '-'
  };
  return seq.split('').reverse().map(base => complement[base] || base).join('');
};

// ---------------------------------------------------------------------------
// Selection-export helpers
// ---------------------------------------------------------------------------

export type Interval = { start: number; end: number };
type TrackDataItem = { start: number; end: number; value: number };

/**
 * Clips a single half-open `[start, end)` interval to the selection window
 * `[selStart, selEnd)` and rebases the result to selection-local coordinates.
 * Returns `null` when there is no overlap or the clipped interval is zero-length.
 */
export function clipInterval(
  start: number,
  end: number,
  selStart: number,
  selEnd: number
): Interval | null {
  if (!(start < selEnd && end > selStart)) return null;
  const length = Math.max(0, selEnd - selStart);
  const out: Interval = {
    start: Math.max(0, start - selStart),
    end: Math.min(length, end - selStart),
  };
  return out.end > out.start ? out : null;
}

/**
 * Clips a `BioFeature` (including its `segments` array) to the selection window
 * and rebases all coordinates to be selection-local.
 * Returns `null` when the feature does not overlap the selection at all.
 */
function clipFeature(
  feature: import('../types').BioFeature,
  selStart: number,
  selEnd: number
): import('../types').BioFeature | null {
  const clipped = clipInterval(feature.start, feature.end, selStart, selEnd);
  if (!clipped) return null;
  const newSegments = feature.segments
    ?.map(s => clipInterval(s.start, s.end, selStart, selEnd))
    .filter((s): s is Interval => s !== null);
  return {
    ...feature,
    ...clipped,
    segments: newSegments?.length ? newSegments : undefined,
  };
}

/**
 * Slices all records to the selection window `[selStart, selEnd)`, rebasing
 * feature/segment coordinates and filtering zero-length track intervals.
 */
export function sliceRecordsBySelection(
  records: import('../types').SeqRecord[],
  selStart: number,
  selEnd: number
): import('../types').SeqRecord[] {
  return records.map(record => {
    const seq = record.alignedSequence || record.sequence;
    const slicedSeq = seq.substring(Math.max(0, selStart), Math.min(seq.length, selEnd));

    const slicedFeatures = record.features
      .map(f => clipFeature(f, selStart, selEnd))
      .filter((f): f is import('../types').BioFeature => f !== null);

    const slicedTracks = record.tracks?.map(track => ({
      ...track,
      data: track.data
        .map(d => {
          const clippedInterval = clipInterval(d.start, d.end, selStart, selEnd);
          return clippedInterval ? { ...d, ...clippedInterval } : null;
        })
        .filter((d): d is TrackDataItem => d !== null),
    }));

    return {
      ...record,
      sequence: slicedSeq,
      alignedSequence: undefined,
      features: slicedFeatures,
      tracks: slicedTracks,
    };
  });
}

/**
 * Maps a position in an aligned sequence (with gaps) back to the original sequence index.
 */
export const getOriginalPos = (alignedSeq: string, alignedPos: number): number => {
  let originalPos = 0;
  const limit = Math.min(alignedPos, alignedSeq.length);
  for (let i = 0; i < limit; i++) {
    if (alignedSeq[i] !== '-') {
      originalPos++;
    }
  }
  return originalPos;
};

/**
 * Maps a position in the original sequence to its index in the aligned sequence (with gaps).
 */
export const getAlignedPos = (alignedSeq: string, originalPos: number): number => {
  let currentOriginal = 0;
  for (let i = 0; i < alignedSeq.length; i++) {
    if (alignedSeq[i] !== '-') {
      if (currentOriginal === originalPos) return i;
      currentOriginal++;
    }
  }
  return alignedSeq.length;
};
