/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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

import React from 'react';
import { ALIGNMENT_ENGINES } from '@/src/core/alignment';
import { isAlignmentActive, type RemoteAlignmentState } from '@/src/app/logic/remoteAlignment';
import { alignmentStage, elapsedSeconds, useJobClock } from './AlignmentJobMonitor';
import SectionTitle from './SectionTitle';

interface AlignmentSectionProps {
  count: number;
  state?: RemoteAlignmentState;
  onOpen?: () => void;
}

export default function AlignmentSection({ count, state = { phase: 'idle' }, onOpen }: AlignmentSectionProps) {
  const active = isAlignmentActive(state);
  const now = useJobClock(active);
  const engine = 'engineId' in state ? ALIGNMENT_ENGINES.find(engine => engine.id === state.engineId)?.label : '';

  return (
    <section aria-label="Alignment">
      <SectionTitle icon="fa-wand-magic-sparkles">Alignment</SectionTitle>
      <button type="button" onClick={onOpen} disabled={count === 0}
        data-tip={active ? 'Show the running alignment' : "Send the loaded sequences to EMBL-EBI's servers for alignment, then overlay the result"}
        className="flex w-full items-center justify-between gap-3 rounded-xl bg-[var(--env)] px-4 py-3 text-left text-xs font-bold text-slate-950 motion-safe:transition-opacity enabled:hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--env)]">
        <span>{active ? 'Alignment running' : 'Align Sequences'}</span>
        <i aria-hidden="true" className={`fas ${active ? 'fa-circle-notch motion-safe:animate-spin' : 'fa-arrow-right'}`} />
      </button>
      <p className="mt-2 text-[9px] text-slate-400">MAFFT · Kalign · Clustal Ω · MUSCLE via EMBL-EBI</p>
      {active && <p className="mt-2 text-[10px] text-[var(--env)]">
        <span role="status">{engine} · {alignmentStage(state)}</span> · {elapsedSeconds(state, now)} s
      </p>}
    </section>
  );
}
