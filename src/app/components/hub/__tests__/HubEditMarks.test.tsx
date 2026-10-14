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
import { expect, it } from 'vitest';
import { render } from '@/src/app/testing/renderHarness';
import type { BioFeature } from '@/src/domain/bio/types';
import { HubEditCounts } from '../HubEditMarks';

const features = (marks: BioFeature['hubEdit'][]): BioFeature[] => marks.map((hubEdit, index) => ({ name: `row${index}`, type: 'gene', start: index * 10, end: index * 10 + 5, strand: 1, hubEdit }));
it.each([
  { marks: ['edited'] as const, want: '1 edited' },
  { marks: ['added', 'added'] as const, want: '2 added' },
  { marks: ['edited', 'added', 'added'] as const, want: '1 edited · 2 added' },
  { marks: [], want: '' },
])('renders only nonzero counts: "$want"', ({ marks, want }) => {
  const { container } = render(<HubEditCounts features={features([...marks])} />);
  expect(container.textContent).toBe(want);
  if (!want) expect(container.children.length).toBe(0);
});
it('separates nonzero edit counts from the following metric without leaving a separator for none', () => {
  const { container, rerender } = render(<div><HubEditCounts followed features={features(['edited'])} />29,903 bp</div>);
  expect(container.textContent).toBe('1 edited · 29,903 bp');
  rerender(<div><HubEditCounts followed features={features([])} />29,903 bp</div>);
  expect(container.textContent).toBe('29,903 bp');
});
