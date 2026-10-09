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

import { useEffect, useMemo, useRef, useState } from 'react';
import type { SeqRecord } from '@/src/domain/bio/types';
import { isProteinSession } from '@/src/domain/bio';
import { ALIGNMENT_ENGINES, DEFAULT_ENGINE, preflightAlignment, measureAlignmentBytes, validateEmail, type EngineId } from '@/src/core/alignment';
import { createEbiClient, type EbiClient } from '@/src/app/lib/ebiClient';
import { readAlignConsent } from '@/src/app/logic/alignConsentPref';
import { readAlignEmail, readVerifiedAlignEmail, writeAlignEmail } from '@/src/app/logic/alignEmailPref';
import { isAlignmentActive, runRemoteAlignment, sleepUntilPoll, type RemoteAlignmentState } from '@/src/app/logic/remoteAlignment';
import type { FastaAlignedRecord } from '@/src/workers/protocol';

function useAlignmentUnloadWarning(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
}

export function useRemoteAlignment(records: SeqRecord[], apply: (records: FastaAlignedRecord[]) => number, addLog: (message: string) => void, injectedClient?: EbiClient) {
  const [state, setState] = useState<RemoteAlignmentState>({ phase: 'idle' });
  const [presentation, setPresentation] = useState<'closed' | 'dialog' | 'pill'>('closed');
  const presentationRef = useRef(presentation);
  const present = (value: typeof presentation) => { presentationRef.current = value; setPresentation(value); };
  const [engineId, setEngineId] = useState<EngineId | null>(DEFAULT_ENGINE);
  const [email, setEmailValue] = useState(readAlignEmail);
  const [verifiedEmail, setVerifiedEmail] = useState(readVerifiedAlignEmail);
  const activeJob = useRef<{ controller: AbortController; jobId?: string } | null>(null);
  const currentRecords = useRef(records);
  currentRecords.current = records;
  const client = useMemo(() => injectedClient ?? createEbiClient(), [injectedClient]);
  const verdicts = useMemo(() => Object.fromEntries(ALIGNMENT_ENGINES.map(engine => [engine.id, preflightAlignment(records, engine.id)])) as Record<EngineId, ReturnType<typeof preflightAlignment>>, [records]);
  const bytes = useMemo(() => measureAlignmentBytes(records), [records]);
  const isAlignmentLocked = isAlignmentActive(state);
  useAlignmentUnloadWarning(isAlignmentLocked);
  useEffect(() => () => { activeJob.current?.controller.abort(); activeJob.current = null; }, []);
  useEffect(() => {
    if (state.phase !== 'done' || presentation !== 'pill') return;
    const timer = setTimeout(() => present('closed'), 4000);
    return () => clearTimeout(timer);
  }, [state.phase, presentation]);

  const open = () => {
    if (activeJob.current || presentation === 'pill') { present('dialog'); return; }
    if (!records.length) return;
    setEngineId(verdicts[DEFAULT_ENGINE].ok ? DEFAULT_ENGINE : null);
    setState({ phase: 'configuring' }); present('dialog');
  };
  const cancel = () => {
    const job = activeJob.current;
    if (job) {
      job.controller.abort(); activeJob.current = null;
      addLog(job.jobId ? `Remote alignment cancelled (job ${job.jobId} keeps running at EBI).` : 'Remote alignment cancelled (a submitted job may keep running at EBI).');
      setState(current => 'steps' in current ? { ...current, phase: 'cancelled', jobId: job.jobId } : { phase: 'idle' });
    } else setState({ phase: 'idle' });
    present('closed');
  };
  const submit = async () => {
    const engine = ALIGNMENT_ENGINES.find(candidate => candidate.id === engineId);
    if (!readAlignConsent() || !engine || activeJob.current || !verdicts[engine.id].ok || !validateEmail(email).ok) return;
    const snapshot = records.map(({ id, sequence, moleculeType }) => ({ id, sequence, moleculeType }));
    const job = { controller: new AbortController(), jobId: undefined as string | undefined };
    activeJob.current = job;
    await runRemoteAlignment({ engine, email, records: snapshot, moleculeKind: isProteinSession(records) ? 'protein' : 'dna' }, {
      client, signal: job.controller.signal, now: Date.now, sleep: sleepUntilPoll, apply,
      isCurrent: () => snapshot.length === currentRecords.current.length && snapshot.every((record, index) => {
        const current = currentRecords.current[index];
        return current.id === record.id && current.sequence === record.sequence;
      }),
      onState: next => {
        if (activeJob.current !== job) return;
        if ('jobId' in next && next.jobId && !job.jobId) {
          job.jobId = next.jobId;
          writeAlignEmail(email, true); setVerifiedEmail(email);
          addLog(`Remote alignment: submitted to EBI ${engine.label} (job ${job.jobId}).`);
        }
        if (next.phase === 'failed') addLog(`Remote alignment failed (${next.reason}${next.jobId ? `, job ${next.jobId}` : ''}): ${next.detail}`);
        if (next.phase === 'done') {
          addLog(`Remote alignment: finished in ${Math.round(next.elapsed / 1000)} s.`);
          if (presentationRef.current === 'dialog') present('closed');
        }
        if (next.phase === 'failed' && next.reason === 'email-invalid') present('dialog');
        setState(next.phase === 'failed' && next.reason === 'email-invalid' ? { phase: 'configuring', emailError: "EBI could not verify this address's domain" } : next);
      },
    });
    if (activeJob.current === job) activeJob.current = null;
  };

  return {
    state, presentation, isAlignmentLocked, isLocked: () => activeJob.current !== null,
    engineId, setEngineId, email, verifiedEmail, verdicts, bytes,
    setEmail: (value: string) => { setEmailValue(value); setState(current => current.phase === 'configuring' ? { phase: 'configuring' } : current); },
    moleculeKind: isProteinSession(records) ? 'protein' as const : 'dna' as const,
    open, cancel, submit, minimize: () => present('pill'), retry: () => { setState({ phase: 'configuring' }); present('dialog'); },
  };
}
