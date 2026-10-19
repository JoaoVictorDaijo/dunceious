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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@/src/app/testing/renderHarness';
import type { BioFeature, SeqRecord } from '@/src/domain/bio/types';
import { DEFAULT_ALIGNMENT_COMPARISON } from '@/src/app/logic/alignmentComparison';
import RecordDetailsModal from '../RecordDetailsModal';
import ComparisonMenu from '../ComparisonMenu';
import { DEFAULT_UI_EFFECTS, UiEffectsContext } from '../uiEffects';

const note = 'n'.repeat(300);
const feature: BioFeature = {
  type: 'CDS', name: 'capsid', start: 0, end: 6, strand: 1,
  translation: 'MK', metadata: { note },
};
const record: SeqRecord = { id: 'record-1', name: 'Record 1', sequence: 'ATGAAA', features: [feature] };
const writeText = vi.fn().mockResolvedValue(undefined);
const props = () => ({ record, feature, onClose: vi.fn(), onFocusFeature: vi.fn(), onExportRecord: vi.fn(), onCopyLog: vi.fn() });

beforeEach(() => {
  writeText.mockClear();
  vi.stubGlobal('navigator', { clipboard: { writeText } });
});
afterEach(() => vi.unstubAllGlobals());

describe('details UI effects', () => {
  it('copy buttons use copyText; declined copies log nothing', async () => {
    const copyText = vi.fn().mockResolvedValue(false);
    const modalProps = props();
    render(<UiEffectsContext.Provider value={{ ...DEFAULT_UI_EFFECTS, copyText }}>
      <RecordDetailsModal {...modalProps} />
    </UiEffectsContext.Provider>);
    const buttons = screen.getAllByRole('button', { name: /^Copy/ });
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      await act(async () => { fireEvent.click(button); });
    }
    expect(copyText.mock.calls).toEqual([['ATGAAA'], ['MK'], ['ATGAAA']]);
    expect(modalProps.onCopyLog).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('with hoverTips false, a long qualifier renders in full', () => {
    render(<UiEffectsContext.Provider value={{ ...DEFAULT_UI_EFFECTS, hoverTips: false }}>
      <RecordDetailsModal {...props()} />
    </UiEffectsContext.Provider>);
    const value = screen.getByText(note);
    expect(value.textContent).toBe(note);
    expect(value.classList.contains('truncate')).toBe(false);
    expect(value.classList.contains('break-words')).toBe(true);
    expect(value.classList.contains('whitespace-normal')).toBe(true);
    expect(value.hasAttribute('data-tip')).toBe(false);
  });

  it('default renders exactly as before', async () => {
    const modalProps = props();
    const { container } = render(<RecordDetailsModal {...modalProps} />);
    expect(container.contains(screen.getByText('Annotation Details'))).toBe(true);
    const value = screen.getByText(note);
    expect(value.classList.contains('truncate')).toBe(true);
    expect(value.getAttribute('data-tip')).toBe(note);
    for (const button of screen.getAllByRole('button', { name: /^Copy/ })) {
      await act(async () => { fireEvent.click(button); });
    }
    expect(writeText.mock.calls).toEqual([['ATGAAA'], ['MK'], ['ATGAAA']]);
    expect(modalProps.onCopyLog.mock.calls).toEqual([
      ['Sequence for capsid in record-1 copied to clipboard.'],
      ['Translation for capsid copied.'],
      ['Sequence for capsid in record-1 copied to clipboard.'],
    ]);
  });

  it('logs only after the host accepts a copy', async () => {
    let accept!: (copied: boolean) => void;
    const copyText = vi.fn(() => new Promise<boolean>(resolve => { accept = resolve; }));
    const modalProps = props();
    render(<UiEffectsContext.Provider value={{ ...DEFAULT_UI_EFFECTS, copyText }}>
      <RecordDetailsModal {...modalProps} />
    </UiEffectsContext.Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Copy AA' }));
    expect(modalProps.onCopyLog).not.toHaveBeenCalled();
    await act(async () => { accept(true); });
    expect(modalProps.onCopyLog).toHaveBeenCalledExactlyOnceWith('Translation for capsid copied.');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('portals details and exposes the card and scrolling body hooks', () => {
    const target = document.createElement('div');
    const { container } = render(<UiEffectsContext.Provider value={{ ...DEFAULT_UI_EFFECTS, portalTarget: target }}>
      <RecordDetailsModal {...props()} />
    </UiEffectsContext.Provider>);
    expect(container.contains(within(target).getByText('Annotation Details'))).toBe(false);
    const card = target.querySelector('[data-record-details]');
    const body = card?.querySelector('[data-record-details-body]');
    expect(body?.contains(within(target).getByText(note))).toBe(true);
    expect(body?.classList.contains('overflow-y-auto')).toBe(true);
  });

  it('ComparisonMenu portals into portalTarget', () => {
    const target = document.createElement('div');
    const { container } = render(<UiEffectsContext.Provider value={{ ...DEFAULT_UI_EFFECTS, portalTarget: target }}>
      <ComparisonMenu settings={DEFAULT_ALIGNMENT_COMPARISON} onChange={vi.fn()} reference={record} candidates={[record]} />
    </UiEffectsContext.Provider>);
    fireEvent.click(screen.getByRole('button', { name: 'Compare to reference' }));
    const panel = within(target).getByRole('group', { name: 'Reference comparison' });
    expect(container.contains(panel)).toBe(false);
    expect(document.body.contains(panel)).toBe(false);
  });
});

describe('a copy that fails', () => {
  it('reports the failure through onCopyLog for the sequence and the translation', async () => {
    const copyText = vi.fn().mockRejectedValue(new DOMException('Write permission denied.', 'NotAllowedError'));
    const modalProps = props();
    render(<UiEffectsContext.Provider value={{ ...DEFAULT_UI_EFFECTS, copyText }}>
      <RecordDetailsModal {...modalProps} />
    </UiEffectsContext.Provider>);
    for (const button of screen.getAllByRole('button', { name: /^Copy/ })) {
      await act(async () => { fireEvent.click(button); });
    }
    expect(modalProps.onCopyLog.mock.calls).toEqual([
      ['Copy failed for capsid in record-1.'],
      ['Copy failed for the translation of capsid.'],
      ['Copy failed for capsid in record-1.'],
    ]);
  });

  it('stays silent when the default clipboard itself rejects, apart from the log', async () => {
    writeText.mockRejectedValueOnce(new DOMException('Document is not focused.', 'NotAllowedError'));
    const modalProps = props();
    render(<RecordDetailsModal {...modalProps} />);
    await act(async () => { fireEvent.click(screen.getAllByRole('button', { name: /^Copy/ })[0]); });
    expect(modalProps.onCopyLog).toHaveBeenCalledExactlyOnceWith('Copy failed for capsid in record-1.');
  });

  // A host that answers `false` declined on purpose; that is not a failure to report.
  it('logs nothing when the host declines', async () => {
    const copyText = vi.fn().mockResolvedValue(false);
    const modalProps = props();
    render(<UiEffectsContext.Provider value={{ ...DEFAULT_UI_EFFECTS, copyText }}>
      <RecordDetailsModal {...modalProps} />
    </UiEffectsContext.Provider>);
    for (const button of screen.getAllByRole('button', { name: /^Copy/ })) {
      await act(async () => { fireEvent.click(button); });
    }
    expect(modalProps.onCopyLog).not.toHaveBeenCalled();
    expect(writeText).not.toHaveBeenCalled();
  });
});
