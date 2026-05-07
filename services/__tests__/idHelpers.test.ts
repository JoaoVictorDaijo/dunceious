import { describe, it, expect } from 'vitest';
import { makeUniqueId } from '../bioUtils';

describe('makeUniqueId', () => {
  it('returns the baseId if it is unique (case-insensitive)', () => {
    const existing = ['seq1', 'seq2', 'seq3'];
    const result = makeUniqueId('seq4', existing);
    expect(result).toBe('seq4');
  });

  it('appends (1) if the baseId already exists', () => {
    const existing = ['seq1', 'seq2', 'seq1'];
    const result = makeUniqueId('seq1', existing);
    expect(result).toBe('seq1 (1)');
  });

  it('uses case-insensitive collision detection', () => {
    const existing = ['SEQ1', 'seq2'];
    const result = makeUniqueId('seq1', existing);
    expect(result).toBe('seq1 (1)');
  });

  it('increments the suffix until finding an available name', () => {
    const existing = ['seq1', 'seq1 (1)', 'seq1 (2)', 'seq1 (3)'];
    const result = makeUniqueId('seq1', existing);
    expect(result).toBe('seq1 (4)');
  });

  it('handles empty existing ID list', () => {
    const result = makeUniqueId('seq1', []);
    expect(result).toBe('seq1');
  });

  it('preserves the original case of the baseId', () => {
    const existing = ['Seq1', 'Seq2'];
    const result = makeUniqueId('Seq1', existing);
    expect(result).toBe('Seq1 (1)');
  });

  it('handles mixed case in existing IDs', () => {
    const existing = ['SeQ1', 'SEQ2', 'seq1 (1)'];
    const result = makeUniqueId('seq1', existing);
    expect(result).toBe('seq1 (2)');
  });
});
