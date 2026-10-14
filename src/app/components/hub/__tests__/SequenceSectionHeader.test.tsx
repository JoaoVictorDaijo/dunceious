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

// @vitest-environment jsdom
import { it, expect } from 'vitest';
import { render } from '@/src/app/testing/renderHarness';
import SequenceSectionHeader, { sequenceSectionHeight } from '../SequenceSectionHeader';
import type { SeqRecord } from '@/src/domain/bio/types';

it.each([1, 30])('keeps a %i-type folded composition on one line within its exact header height', count => {
  const record: SeqRecord = { id: 'x', name: 'x', sequence: 'AAAA', features: Array.from({ length: count }, (_, i) => ({ name: `f${i}`, type: `type${i}`, start: 0, end: 2, strand: 1 })) };
  const section = { key: 'x', group: null, record, rows: record.features, total: count };
  const noop = () => {};
  const { container } = render(<SequenceSectionHeader section={section} folded selected={false} onFold={noop} onSelect={noop} onVisibility={noop} onPick={noop} />);
  const composition = container.querySelector<HTMLElement>('[data-section-composition]')!;
  const surface = container.querySelector<HTMLElement>('[data-section-surface]')!;
  // Folded summaries must fit the exact virtual header bounds regardless of type count.
  expect(sequenceSectionHeight(section, true)).toBe(82);
  expect(surface.style.height).toBe('82px');
  expect(composition.textContent).toBe(record.features.map(f => `1 ${f.type}`).join(' · '));
  expect(composition.getAttribute('data-tip')).toBe(record.features.map(f => `1 ${f.type}`).join(' · '));
  expect(composition.style.height).toBe('24px');
  expect(composition.style.marginBottom).toBe('0px');
});
