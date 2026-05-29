import { afterAll, describe, expect, it, vi } from 'vitest';

type WorkerMessage = { data: { type: 'PARSE_FASTA'; content: string } };

const postMessage = vi.fn();
const workerScope: { onmessage: ((event: WorkerMessage) => void) | null; postMessage: typeof postMessage } = {
  onmessage: null,
  postMessage,
};

(globalThis as unknown as { self?: typeof workerScope }).self = workerScope;
await import('../bioWorker');

afterAll(() => {
  delete (globalThis as unknown as { self?: typeof workerScope }).self;
});

describe('bioWorker FASTA molecule type detection', () => {
  it('classifies aligned IUPAC nucleotide FASTA as dna', () => {
    postMessage.mockClear();
    workerScope.onmessage?.({ data: { type: 'PARSE_FASTA', content: '>seq1\nATGCDHVN--A\n' } });
    expect(postMessage).toHaveBeenCalledTimes(1);
    const payload = postMessage.mock.calls[0]?.[0];
    expect(payload.type).toBe('FASTA_SUCCESS');
    expect(payload.alignedData[0]?.moleculeType).toBe('dna');
  });

  it('classifies amino-acid FASTA as protein', () => {
    postMessage.mockClear();
    workerScope.onmessage?.({ data: { type: 'PARSE_FASTA', content: '>pep\nMTEYKLVVVG\n' } });
    const payload = postMessage.mock.calls[0]?.[0];
    expect(payload.type).toBe('FASTA_SUCCESS');
    expect(payload.alignedData[0]?.moleculeType).toBe('protein');
  });
});
