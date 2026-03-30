import { describe, it, expect } from 'vitest';
import { splitRecords } from '../recordSplitter';

describe('splitRecords', () => {
  it('returns an empty array for empty input', () => {
    expect(splitRecords('')).toHaveLength(0);
  });

  it('returns an empty array for whitespace-only input', () => {
    expect(splitRecords('   \n  ')).toHaveLength(0);
  });

  it('splits a single record terminated by //', () => {
    const input = 'LOCUS TEST\nORIGIN\n        1 atg\n//\n';
    expect(splitRecords(input)).toHaveLength(1);
  });

  it('splits two records', () => {
    const input = 'LOCUS R1\n//\nLOCUS R2\n//\n';
    const parts = splitRecords(input);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain('LOCUS R1');
    expect(parts[1]).toContain('LOCUS R2');
  });

  it('handles Windows-style line endings (CRLF)', () => {
    const input = 'LOCUS R1\r\n//\r\nLOCUS R2\r\n//\r\n';
    expect(splitRecords(input)).toHaveLength(2);
  });

  it('ignores blank-only segments between records', () => {
    const input = '\n\nLOCUS R1\n//\n\n\nLOCUS R2\n//\n';
    expect(splitRecords(input)).toHaveLength(2);
  });
});
