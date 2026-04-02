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

/**
 * Build a single syntactically-valid GenBank record.
 *
 * @param id        Accession used in LOCUS / ACCESSION / VERSION lines.
 * @param seqLength Length of the synthetic DNA sequence (base pairs).
 */
export function makeRecord({
  id,
  seqLength,
}: {
  id: string;
  seqLength: number;
}): string {
  const seq = 'ATCG'.repeat(Math.ceil(seqLength / 4)).slice(0, seqLength);
  const cdsEnd = Math.min(seqLength, 99);
  const geneEnd = Math.min(seqLength, 100);

  return [
    `LOCUS       ${id.padEnd(12)} ${String(seqLength).padStart(7, ' ')} bp    DNA             PLN       01-JAN-2024`,
    `DEFINITION  Synthetic benchmark record (${seqLength} bp).`,
    `ACCESSION   ${id}`,
    `VERSION     ${id}.1`,
    `FEATURES             Location/Qualifiers`,
    `     source          1..${seqLength}`,
    `                     /organism="Testus benchmarkii"`,
    `     gene            1..${geneEnd}`,
    `                     /gene="benchGene"`,
    `     CDS             1..${cdsEnd}`,
    `                     /gene="benchGene"`,
    `                     /product="benchmark protein"`,
    `                     /codon_start=1`,
    `                     /translation="MKVL"`,
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
export function makeMultiRecord(numRecords: number, seqLength: number): string {
  return Array.from({ length: numRecords }, (_, i) => {
    const id = `SYN${String(i + 1).padStart(5, '0')}`;
    return makeRecord({ id, seqLength });
  }).join('\n');
}
