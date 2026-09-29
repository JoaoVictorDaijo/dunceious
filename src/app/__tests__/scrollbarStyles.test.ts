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

/**
 * Guards the one scrollbar failure that ships silently: Chromium drops every
 * `::-webkit-scrollbar` rule for an element that also sets the standard
 * `scrollbar-width`, so the app falls back to native bars with a green build,
 * no failing test and no coverage delta. jsdom does not lay out scrollbars, so
 * this reads the source instead.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (rel: string) => readFileSync(resolve(__dirname, '../../../', rel), 'utf-8');

const SUPPORTS_GUARD = '@supports not selector(::-webkit-scrollbar)';

/** Byte range of the `@supports` guard's body, found by brace matching. */
const supportsRange = (css: string): [number, number] => {
  const start = css.indexOf(SUPPORTS_GUARD);
  expect(start, `${SUPPORTS_GUARD} must exist in themes.css`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return [start, i];
  }
  throw new Error('unterminated @supports block');
};

describe('scrollbar styles', () => {
  it('keeps every standard scrollbar property inside the @supports guard', () => {
    const css = read('src/app/themes.css');
    const [start, end] = supportsRange(css);

    for (const match of css.matchAll(/scrollbar-(?:width|color)\s*:/g)) {
      const at = match.index ?? -1;
      expect(
        at > start && at < end,
        `"${match[0]}" at index ${at} sits outside the @supports guard, which disables ` +
          'every ::-webkit-scrollbar rule for that element in Chromium',
      ).toBe(true);
    }
  });

  it('declares no standard scrollbar property in a component style block', () => {
    for (const file of ['src/app/App.tsx', 'src/app/viewer/GenomeViewer.tsx']) {
      expect(read(file), `${file} must not set scrollbar-width/color`).not.toMatch(
        /scrollbar-(?:width|color)\s*:/,
      );
    }
  });

  it('owns both halves of every styled scrollbar in themes.css', () => {
    const css = read('src/app/themes.css');
    for (const selector of ['.custom-scrollbar-pro', '.scrollbar-on-light', '.seq-scroll']) {
      expect(css, `${selector} must be defined in themes.css`).toContain(selector);
    }
    // .seq-scroll's webkit half lived in App.tsx while its standard half lived
    // here — the split that let the conflict above go unnoticed.
    expect(css).toMatch(/\.seq-scroll::-webkit-scrollbar\s*\{/);
  });

  it('pairs the light-surface class with the base class at every call site', () => {
    const callSites = [
      'src/app/viewer/GenomeViewer.tsx',
      'src/app/components/DatabaseHubPanel.tsx',
      'src/app/components/RecordDetailsModal.tsx',
    ];
    for (const file of callSites) {
      for (const className of read(file).matchAll(/className="([^"]*scrollbar-on-light[^"]*)"/g)) {
        expect(
          className[1],
          `${file}: scrollbar-on-light supplies only colours; geometry needs custom-scrollbar-pro`,
        ).toContain('custom-scrollbar-pro');
      }
    }
  });
});
