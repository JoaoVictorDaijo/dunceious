
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

/**
 * Extracts the coding sequence for a feature from the full genome sequence,
 * respecting multi-part (join) and circular wrap-around locations.
 *
 * For reverse-strand features the nucleotide string is reverse-complemented
 * and `alignedIndices` is reversed so that codon position `i` maps to the
 * correct genomic coordinate.
 *
 * @param feature  A BioFeature-like object with strand, start, end, and optional segments.
 * @param seq      The raw genome sequence (no gap characters expected, but '-' is tolerated).
 * @returns        `{ codingSeq, alignedIndices }` ready for codon-by-codon rendering.
 */
export function extractCodingSequence(
  feature: {
    strand: 1 | -1;
    start: number;
    end: number;
    segments?: { start: number; end: number }[];
  },
  seq: string
): { codingSeq: string; alignedIndices: number[] } {
  const seqLen = seq.length;
  let segments: { start: number; end: number }[];

  if (feature.segments && feature.segments.length > 0) {
    segments = feature.segments;
  } else if (feature.start > feature.end) {
    // Circular wrap-around without explicit segments: split at origin
    segments = [
      { start: feature.start, end: seqLen },
      { start: 0, end: feature.end },
    ];
  } else {
    segments = [{ start: feature.start, end: feature.end }];
  }

  let codingSeq = '';
  const alignedIndices: number[] = [];

  segments.forEach(seg => {
    for (let j = seg.start; j < seg.end; j++) {
      const char = seq[j];
      if (char && char !== '-') {
        codingSeq += char;
        alignedIndices.push(j);
      }
    }
  });

  if (feature.strand === -1) {
    codingSeq = reverseComplement(codingSeq);
    alignedIndices.reverse();
  }

  return { codingSeq, alignedIndices };
}

/**
 * Returns `true` when the coding sequence contains an in-frame stop codon
 * before the final codon – indicating a "broken" (truncated) protein.
 *
 * A CDS that ends normally with a stop codon is NOT considered broken;
 * only an internal stop codon before the last position is flagged.
 *
 * @param codingSeq  Nucleotide string in translation-ready order (already
 *                   reverse-complemented for minus-strand features).
 */
export function detectEarlyStop(codingSeq: string): boolean {
  const fullCodons = Math.floor(codingSeq.length / 3);
  // Examine every codon except the last one
  for (let i = 0; i < fullCodons - 1; i++) {
    if (translateSequence(codingSeq.substring(i * 3, i * 3 + 3)) === '_') {
      return true;
    }
  }
  return false;
}

export const getNucleotideColor = (char: string): string => {
  const c = char.toUpperCase();
  if (c === 'A') return '#22c55e'; // Emerald
  if (c === 'T') return '#f43f5e'; // Rose
  if (c === 'C') return '#3b82f6'; // Blue
  if (c === 'G') return '#eab308'; // Amber
  if (c === '-') return '#64748b'; // Slate (Gap)
  return '#94a3b8';
};

/**
 * Returns a display colour for a single-letter amino-acid code.
 *
 * Colour groupings follow chemical/biochemical property conventions
 * (similar to ClustalX / RasMol):
 *
 * - Hydrophobic non-polar (A V I L M P G):  amber tones
 * - Aromatic            (F W Y):            purple tones
 * - Positively charged  (K R):              blue
 * - Histidine           (H):                sky-blue (partly positive)
 * - Negatively charged  (D E):              red tones
 * - Polar uncharged     (S T N Q):          green tones
 * - Cysteine            (C):                yellow (unique reactivity)
 * - Stop / unknown      (* _):              red
 * - Gap                 (-):                slate
 */
export const getAminoAcidColor = (char: string): string => {
  const c = char.toUpperCase();
  switch (c) {
    // Hydrophobic non-polar
    case 'A': case 'V': case 'I': case 'L': case 'M':
      return '#f59e0b'; // Amber
    case 'G':
      return '#94a3b8'; // Slate – smallest / most flexible
    case 'P':
      return '#d97706'; // Dark amber – rigid ring
    // Aromatic
    case 'F': case 'W':
      return '#a855f7'; // Purple
    case 'Y':
      return '#8b5cf6'; // Violet – aromatic + hydroxyl
    // Positively charged
    case 'K': case 'R':
      return '#3b82f6'; // Blue
    case 'H':
      return '#60a5fa'; // Sky blue – weakly basic
    // Negatively charged
    case 'D':
      return '#ef4444'; // Red
    case 'E':
      return '#f97316'; // Orange-red
    // Polar uncharged
    case 'S': case 'T':
      return '#22c55e'; // Green
    case 'N': case 'Q':
      return '#10b981'; // Emerald
    // Unique
    case 'C':
      return '#eab308'; // Yellow – disulfide bridges
    // Stop codon
    case '*': case '_':
      return '#ef4444'; // Red
    // Gap
    case '-':
      return '#64748b'; // Slate
    default:
      return '#94a3b8'; // Unknown
  }
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
    const escapeQualifierValue = (value: string) => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const date = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase().replace(/ /g, '-');
    const seq = r.sequence;
    const length = seq.length;
    const topology = r.isCircular ? 'circular' : 'linear  ';
    const isProtein = r.moleculeType === 'protein';

    let gb = '';

    // LOCUS – protein records use "aa" as the unit and omit the molecule type
    if (isProtein) {
      gb += `LOCUS       ${r.id.padEnd(12)} ${length.toString().padStart(7)} aa            ${topology}   UNK ${date}\n`;
    } else {
      gb += `LOCUS       ${r.id.padEnd(12)} ${length.toString().padStart(7)} bp    DNA     ${topology}   UNK ${date}\n`;
    }

    // DEFINITION – always stamped with the Dunceious exporter marker.
    // Strip any existing marker first so repeated exports don't accumulate duplicates.
    const DUNCEIOUS_MARKER = ' Exported by Dunceious.';
    const rawDefinition = (r.definition || r.name || r.id).replace(DUNCEIOUS_MARKER, '');
    gb += `DEFINITION  ${rawDefinition}${DUNCEIOUS_MARKER}\n`;

    // ACCESSION / VERSION
    gb += `ACCESSION   ${r.id}\n`;
    gb += `VERSION     ${r.id}\n`;
    gb += `KEYWORDS    .\n`;

    // SOURCE / ORGANISM from source feature when available
    const sourceFeature = r.features.find(f => f.type === 'source');
    const organism = sourceFeature?.metadata?.['organism'] ?? '.';
    gb += `SOURCE      ${organism}\n`;
    gb += `  ORGANISM  ${organism}\n`;

    // FEATURES
    gb += `FEATURES             Location/Qualifiers\n`;
    r.features.forEach(f => {
      // Prefer the original location string (preserves partial/join syntax);
      // fall back to reconstructing a simple 1-based location.
      const location = f.locationString ?? (
        f.strand === 1
          ? `${f.start + 1}..${f.end}`
          : `complement(${f.start + 1}..${f.end})`
      );
      gb += `     ${f.type.padEnd(15)} ${location}\n`;
      if (f.metadata) {
        Object.entries(f.metadata).forEach(([k, v]) => {
          // Keys prefixed with '_' are internal Dunceious fields, not GenBank qualifiers
          if (k.startsWith('_')) return;
          if (v !== undefined && v !== null && v !== '') {
            gb += `                     /${k}="${escapeQualifierValue(String(v))}"\n`;
          }
        });
      }
    });

    // ORIGIN
    gb += `ORIGIN\n`;
    const originSeq = seq.toLowerCase();
    for (let i = 0; i < originSeq.length; i += 60) {
      const lineSeq = originSeq.substring(i, i + 60);
      const groups: string[] = [];
      for (let j = 0; j < lineSeq.length; j += 10) {
        groups.push(lineSeq.substring(j, j + 10));
      }
      gb += `${(i + 1).toString().padStart(9)} ${groups.join(' ')}\n`;
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
