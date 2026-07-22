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
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, stubResizeObserver } from '@/src/app/testing/renderHarness';
import DatabaseHubPanel, { type DatabaseHubPanelProps } from '@/src/app/components/DatabaseHubPanel';
import { buildFlattenedFeatures } from '@/src/app/logic/featureManager';
import type { SeqRecord, BioFeature } from '@/src/domain/bio/types';

function rec(over: Partial<SeqRecord> & Pick<SeqRecord, 'id'>, features: BioFeature[]): SeqRecord {
  return { name: over.id, sequence: 'A'.repeat(50), features, ...over } as SeqRecord;
}

// The full flattened list (~330px) fits react-window's 600px default viewport, so every row
// mounts — including the circular record's header (with its CIRCULAR badge), regardless of order.
const records: SeqRecord[] = [
  rec({ id: 'circ', name: 'Circular One', isCircular: true },
    [{ type: 'gene', name: 'g1', start: 0, end: 10, strand: 1 }]),
  rec({ id: 'lin', name: 'Linear Two' },
    [{ type: 'gene', name: 'g2', start: 0, end: 10, strand: 1 },
     { type: 'gene', name: 'g3', start: 20, end: 30, strand: 1 }]),
];
const allFeaturesCount = records.reduce((a, r) => a + r.features.length, 0); // 3

const noop = () => {};
function panelProps(): DatabaseHubPanelProps {
  return {
    records,
    flattenedFeatures: buildFlattenedFeatures(records, ''),
    allFeaturesCount,
    featureSearch: '',
    onFeatureSearchChange: noop,
    featureColors: {},
    activeSelection: null,
    onStartNewFeature: noop,
    onToggleRecordVisibility: noop,
    onRemoveRecord: noop,
    onViewFeatureDetails: noop,
    onEditFeature: noop,
    onRemoveFeature: noop,
    onFocusItem: noop,
    onExportAllFasta: noop,
    onExportGenBank: noop,
    onExportGff: noop,
    onExportProjectJson: noop,
    onClearAll: noop,
    addLog: noop,
  };
}

describe('DatabaseHubPanel', () => {
  beforeEach(() => { stubResizeObserver(); });

  it('renders the header as "{n} Sequences • {m} Annotations"', () => {
    render(<DatabaseHubPanel {...panelProps()} />);
    // Regex tolerates testing-library's whitespace normalization across the interpolated text nodes.
    expect(screen.getByText(/2\s+Sequences\s+•\s+3\s+Annotations/)).toBeTruthy();
  });

  it('renders a CIRCULAR badge for a circular record', () => {
    render(<DatabaseHubPanel {...panelProps()} />);
    expect(screen.getByText('CIRCULAR')).toBeTruthy();
  });
});
