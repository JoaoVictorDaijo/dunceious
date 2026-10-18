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

import React from 'react';
import JobPill from './JobPill';
import { ALIGNMENT_ENGINES } from '@/src/core/alignment';
import { isAlignmentActive, type RemoteAlignmentState } from '@/src/app/logic/remoteAlignment';
import { alignmentStage, elapsedSeconds, useJobClock } from './AlignmentJobMonitor';

export default function AlignmentJobPill({ state, onOpen }: { state: RemoteAlignmentState; onOpen: () => void }) {
  const active = isAlignmentActive(state);
  const now = useJobClock(active);
  const engine = 'engineId' in state ? ALIGNMENT_ENGINES.find(engine => engine.id === state.engineId)?.label : '';
  const label = state.phase === 'done' ? 'Aligned' : `${engine} · ${alignmentStage(state)}`;
  return <JobPill label={label} elapsed={elapsedSeconds(state, now)} active={active}
    done={state.phase === 'done'} failed={state.phase === 'failed'} monitorName="alignment" dataAttribute="data-alignment-job-pill" onOpen={onOpen} />;
}
