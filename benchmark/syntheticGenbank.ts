/**
 * Synthetic GenBank content generators for benchmarking.
 *
 * Functions here produce syntactically-valid GenBank strings whose size is
 * fully controlled so that the benchmark grid can vary both sequence length
 * and record count independently.
 */

/** Wrap a sequence into 60-char GenBank ORIGIN lines with position labels. */
function formatOriginLines(seq: string): string[] {
  const lines: string[] = [];
  for (let i = 0; i < seq.length; i += 60) {
    const lineNum = String(i + 1).padStart(9, ' ');
    lines.push(
      `${lineNum} ${seq.slice(i, i + 60).replace(/(.{10})/g, '$1 ').trim()}`,
    );
  }
  return lines;
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function randomChoice<T>(rng: () => number, values: T[]): T {
  return values[randomInt(rng, 0, values.length - 1)] as T;
}

function randomDna(rng: () => number, length: number): string {
  const bases = ['A', 'C', 'G', 'T'];
  return Array.from({ length }, () => randomChoice(rng, bases)).join('');
}

function randomProtein(rng: () => number, length: number): string {
  const residues = 'ACDEFGHIKLMNPQRSTVWY';
  return Array.from({ length }, () => residues[randomInt(rng, 0, residues.length - 1)]).join('');
}

function randomWord(rng: () => number, prefix: string): string {
  return `${prefix}${randomInt(rng, 1000, 9999)}`;
}

function chooseFeatureSpan(rng: () => number, seqLength: number): { start: number; end: number } {
  const minLength = Math.max(24, Math.floor(seqLength * 0.02));
  const maxLength = Math.max(minLength + 3, Math.floor(seqLength * 0.18));
  const spanLength = Math.min(seqLength, randomInt(rng, minLength, maxLength));
  const start = randomInt(rng, 1, Math.max(1, seqLength - spanLength + 1));
  const end = Math.min(seqLength, start + spanLength - 1);
  return { start, end };
}

function formatFeatureLines(
  type: string,
  location: string,
  qualifiers: Array<[string, string]>,
): string[] {
  const lines = [`     ${type.padEnd(16)}${location}`];
  for (const [key, value] of qualifiers) {
    lines.push(`                     /${key}=${value}`);
  }
  return lines;
}

/**
 * Build a single syntactically-valid GenBank record.
 *
 * @param id        Accession used in LOCUS / ACCESSION / VERSION lines.
 * @param seqLength Length of the synthetic DNA sequence (base pairs).
 */
export function makeRecord({
  id,
  seqLength,
  seed,
}: {
  id: string;
  seqLength: number;
  seed: number;
}): string {
  const rng = createRng(seed);
  const seq = randomDna(rng, seqLength);
  const proteinName = randomWord(rng, 'protein_');
  const geneName = randomWord(rng, 'gene_');
  const note = randomWord(rng, 'note_');
  const sourceOrganism = `${randomWord(rng, 'Synthus')} ${randomWord(rng, 'benchmarkii')}`;

  const geneSpan = chooseFeatureSpan(rng, seqLength);
  const cdsSpan = chooseFeatureSpan(rng, seqLength);
  const miscSpan = chooseFeatureSpan(rng, seqLength);
  const proteinLength = Math.max(8, Math.floor((cdsSpan.end - cdsSpan.start + 1) / 3));
  const translation = randomProtein(rng, proteinLength);
  const geneStrand = randomChoice(rng, [1, -1] as const);
  const cdsStrand = randomChoice(rng, [1, -1] as const);
  const miscStrand = randomChoice(rng, [1, -1] as const);
  const extraFeatureTypes = ['repeat_region', 'mobile_element', 'regulatory', 'misc_difference'];
  const extraFeatureCount = randomInt(rng, 2, 5);
  const extraFeatures = Array.from({ length: extraFeatureCount }, (_, idx) => {
    const span = chooseFeatureSpan(rng, seqLength);
    const strand = randomChoice(rng, [1, -1] as const);
    const type = randomChoice(rng, extraFeatureTypes);
    return formatFeatureLines(
      type,
      strand === 1 ? `${span.start}..${span.end}` : `complement(${span.start}..${span.end})`,
      [
        ['note', `"${randomWord(rng, `${type}_${idx}_`)}"`],
        ['locus_tag', `"${id}_${idx + 1}"`],
      ],
    );
  });

  const featureBlock = [
    ...formatFeatureLines('source', `1..${seqLength}`, [
      ['organism', `"${sourceOrganism}"`],
      ['mol_type', '"genomic DNA"'],
    ]),
    ...formatFeatureLines(
      'gene',
      geneStrand === 1 ? `${geneSpan.start}..${geneSpan.end}` : `complement(${geneSpan.start}..${geneSpan.end})`,
      [
        ['gene', `"${geneName}"`],
        ['note', `"${note} gene"`],
      ],
    ),
    ...formatFeatureLines(
      'CDS',
      cdsStrand === 1 ? `${cdsSpan.start}..${cdsSpan.end}` : `complement(${cdsSpan.start}..${cdsSpan.end})`,
      [
        ['gene', `"${geneName}"`],
        ['product', `"${proteinName}"`],
        ['protein_id', `"${id}_PROT"`],
        ['translation', `"${translation}"`],
      ],
    ),
    ...formatFeatureLines(
      'misc_feature',
      miscStrand === 1 ? `${miscSpan.start}..${miscSpan.end}` : `complement(${miscSpan.start}..${miscSpan.end})`,
      [
        ['note', `"${note} ${randomWord(rng, 'feature_')}"`],
      ],
    ),
    ...extraFeatures.flat(),
  ];

  return [
    `LOCUS       ${id.padEnd(12)} ${String(seqLength).padStart(7, ' ')} bp    DNA             PLN       01-JAN-2024`,
    `DEFINITION  Synthetic benchmark record (${seqLength} bp; ${note}).`,
    `ACCESSION   ${id}`,
    `VERSION     ${id}.1`,
    `FEATURES             Location/Qualifiers`,
    ...featureBlock,
    `ORIGIN`,
    ...formatOriginLines(seq),
    '//',
  ].join('\n');
}

/**
 * Build a GenBank string containing `numRecords` records, each with a sequence
 * of exactly `seqLength` base pairs.  Records are separated by `//` as in a
 * real multi-record file.
 *
 * @param numRecords Number of GenBank records to include.
 * @param seqLength  Sequence length in base pairs for every record.
 */
export function makeMultiRecord(numRecords: number, seqLength: number, replicateIndex = 0): string {
  return Array.from({ length: numRecords }, (_, i) => {
    const id = `SYN${String(i + 1).padStart(5, '0')}`;
    return makeRecord({
      id,
      seqLength,
      seed: (seqLength * 73856093) ^ (numRecords * 19349663) ^ (replicateIndex * 83492791) ^ (i * 2654435761),
    });
  }).join('\n');
}
