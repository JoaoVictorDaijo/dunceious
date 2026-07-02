/*
 * Dunceious
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

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getOriginalPos,
  downloadBlob,
} from '../bioUtils';

describe('getOriginalPos', () => {
  it('is the identity for a gap-free sequence', () => {
    expect(getOriginalPos('ACGT', 4)).toBe(4);
    expect(getOriginalPos('ACGT', 0)).toBe(0);
  });

  it('discounts leading and internal gaps before the position', () => {
    // '--AC' up to pos 4 → 2 real bases
    expect(getOriginalPos('--AC', 4)).toBe(2);
    // 'A-C-G' up to pos 5 → A,C,G = 3
    expect(getOriginalPos('A-C-G', 5)).toBe(3);
  });

  it('clamps a position past the end of the aligned sequence', () => {
    expect(getOriginalPos('ACGT', 100)).toBe(4);
  });
});

describe('downloadBlob', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('wires content and mimeType into a Blob, clicks the anchor, and revokes the URL', () => {
    const click = vi.fn();
    const anchor: Record<string, unknown> = { click };
    const createElement = vi.fn(() => anchor);
    const appendChild = vi.fn();
    const removeChild = vi.fn();
    const createObjectURL = vi.fn((_blob: unknown) => 'blob:mock-url');
    const revokeObjectURL = vi.fn();
    const blobs: Array<{ parts: unknown; opts: unknown }> = [];
    class BlobStub {
      parts: unknown;
      opts: unknown;
      constructor(parts: unknown, opts: unknown) {
        this.parts = parts;
        this.opts = opts;
        blobs.push(this);
      }
    }

    vi.stubGlobal('document', { createElement, body: { appendChild, removeChild } });
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    vi.stubGlobal('Blob', BlobStub);

    downloadBlob('hello', 'out.txt', 'text/plain');

    // Blob is built from the content + mimeType and handed to createObjectURL.
    expect(blobs).toHaveLength(1);
    expect(blobs[0].parts).toEqual(['hello']);
    expect(blobs[0].opts).toEqual({ type: 'text/plain' });
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(BlobStub);
    // Anchor wiring + lifecycle.
    expect(createElement).toHaveBeenCalledWith('a');
    expect(anchor.href).toBe('blob:mock-url');
    expect(anchor.download).toBe('out.txt');
    expect(appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledTimes(1);
    expect(removeChild).toHaveBeenCalledWith(anchor);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });
});
