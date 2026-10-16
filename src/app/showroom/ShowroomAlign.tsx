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

import { useMemo, useState } from 'react';
import AlignRemoteModal from '@/src/app/components/AlignRemoteModal';
import { ALIGNMENT_ENGINES, DEFAULT_ENGINE, measureAlignmentBytes, preflightAlignment, type AlignmentPreflight, type EngineId } from '@/src/core/alignment';
import type { RemoteAlignmentState } from '@/src/app/logic/remoteAlignment';
import type { SeqRecord } from '@/src/domain/bio/types';

/** Pre-filled so Align is reachable; the address never leaves the page. */
const SAMPLE_EMAIL = 'you@example.org';

/**
 * The dialog half of `useRemoteAlignment`: the same preflight verdicts, size and
 * configuring state, with no client. Consent stays in `alignConsentPref`'s
 * module memory, as in the workbench.
 */
export function useShowroomAlignment(records: SeqRecord[]) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<RemoteAlignmentState>({ phase: 'idle' });
  const [engineId, setEngineId] = useState<EngineId | null>(DEFAULT_ENGINE);
  const [email, setEmailValue] = useState(SAMPLE_EMAIL);
  const verdicts = useMemo(() => Object.fromEntries(ALIGNMENT_ENGINES.map(engine => [engine.id, preflightAlignment(records, engine.id)])) as Record<EngineId, AlignmentPreflight>, [records]);
  const bytes = useMemo(() => measureAlignmentBytes(records), [records]);
  return {
    open, state, engineId, setEngineId, email, verdicts, bytes, count: records.length,
    show: () => {
      if (!records.length) return;
      setEngineId(verdicts[DEFAULT_ENGINE].ok ? DEFAULT_ENGINE : null);
      setState({ phase: 'configuring' });
      setOpen(true);
    },
    close: () => { setState({ phase: 'idle' }); setOpen(false); },
    retry: () => setState({ phase: 'configuring' }),
    setEmail: (value: string) => { setEmailValue(value); setState(current => current.phase === 'configuring' ? { phase: 'configuring' } : current); },
  };
}

export type ShowroomAlignment = ReturnType<typeof useShowroomAlignment>;

/**
 * The real `AlignRemoteModal` below a fixed test-drive banner. The wrapper's
 * transform makes it the containing block of the modal's fixed backdrop, so the
 * dialog sits under the banner, and showroom.css caps the dialog at the wrapper's
 * height so it scrolls on a 360 px tall screen.
 */
export function ShowroomAlignDialog({ alignment, onSubmit }: { alignment: ShowroomAlignment; onSubmit: () => void }) {
  if (!alignment.open) return null;
  return <>
    <div role="status" className="fixed inset-x-0 top-0 z-[101] flex h-11 items-center justify-center border-b border-sky-400/50 bg-slate-950/95 px-4">
      <span className="rounded-md border border-sky-400/70 px-2 py-0.5 text-xs font-semibold text-sky-300">Test drive: nothing will be sent</span>
    </div>
    <div data-showroom-align="" className="fixed inset-x-0 bottom-0 top-11 z-[100] [transform:translateZ(0)]">
      <AlignRemoteModal
        state={alignment.state}
        count={alignment.count}
        bytes={alignment.bytes}
        moleculeKind="dna"
        hasAlignment={false}
        engineId={alignment.engineId}
        email={alignment.email}
        verifiedEmail=""
        verdicts={alignment.verdicts}
        onMinimize={alignment.close}
        onEngineChange={alignment.setEngineId}
        onEmailChange={alignment.setEmail}
        onSubmit={onSubmit}
        onCancel={alignment.close}
        onRetry={alignment.retry}
      />
    </div>
  </>;
}
