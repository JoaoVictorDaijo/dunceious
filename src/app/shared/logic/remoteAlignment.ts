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

import {
  preflightAlignment, validateEmail, parseJobStatus, parseResultTypes, pickResultTypes, remapAlignment,
  type AlignmentEngine, type AlignmentInput, type AlignmentMoleculeKind, type AlignmentSubmission, type EngineId, type JobStatus,
} from '@/src/core/alignment';
import { describeEbiBody, type EbiClient, type EbiResponse } from '@/src/app/shared/lib/ebiClient';
import type { FastaAlignedRecord } from '@/src/workers/protocol';

export const ALIGNMENT_LOCK_TIP = 'Locked while the EBI alignment runs';

export type AlignmentFailure = 'input-invalid' | 'email-invalid' | 'rejected' | 'job-error' | 'job-lost' |
  'no-alignment' | 'invalid-result' | 'stale' | 'network' | 'http';
export const ALIGNMENT_STEPS = ['validated', 'submitted', 'queued', 'running', 'fetching', 'applied'] as const;
export type StepId = typeof ALIGNMENT_STEPS[number];
export interface AlignmentStep { status: 'pending' | 'active' | 'done' | 'failed' | 'skipped'; enteredAt?: number; leftAt?: number }
export interface AlignmentProgress {
  steps: Record<StepId, AlignmentStep>;
  startedAt: number;
  engineId: EngineId;
  sequenceCount: number;
  bytes: number;
  retryCount: number;
  lastCheckedAt?: number;
  nextCheckAt?: number;
  resultType?: string;
  alignedLength?: number;
}
type JobPhase =
  | { phase: 'submitting'; jobId?: string }
  | { phase: 'queued' | 'running'; jobId: string; since: number }
  | { phase: 'fetching' | 'applying'; jobId: string }
  | { phase: 'done'; jobId: string; elapsed: number }
  | { phase: 'failed'; reason: AlignmentFailure; detail: string; jobId?: string }
  | { phase: 'cancelled'; jobId?: string };
export type RemoteAlignmentState = { phase: 'idle' | 'configuring'; emailError?: string } | (JobPhase & AlignmentProgress);

export function isAlignmentActive(state: RemoteAlignmentState): boolean {
  return ['submitting', 'queued', 'running', 'fetching', 'applying'].includes(state.phase);
}

export function createAlignmentProgress(engineId: EngineId, sequenceCount: number, bytes: number, startedAt: number): AlignmentProgress {
  return { engineId, sequenceCount, bytes, startedAt, retryCount: 0, steps: Object.fromEntries(ALIGNMENT_STEPS.map(id => [id, { status: 'pending' }])) as Record<StepId, AlignmentStep> };
}

export interface RemoteAlignmentInput { engine: AlignmentEngine; moleculeKind: AlignmentMoleculeKind; email: string; records: readonly AlignmentInput[] }
export interface RemoteAlignmentDeps {
  client: EbiClient;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
  now: () => number;
  signal: AbortSignal;
  onState: (state: RemoteAlignmentState) => void;
  isCurrent: () => boolean;
  apply: (records: FastaAlignedRecord[]) => number;
}

function createMonitor(input: RemoteAlignmentInput, deps: RemoteAlignmentDeps) {
  let progress = createAlignmentProgress(input.engine.id, input.records.length, 0, deps.now());
  let phase: JobPhase = { phase: 'submitting' };
  return {
    get progress() { return progress; },
    emit(next: JobPhase) { phase = next; deps.onState({ ...progress, ...phase }); },
    update(patch: Partial<AlignmentProgress>) { progress = { ...progress, ...patch }; deps.onState({ ...progress, ...phase }); },
    enter(id: StepId) {
      const index = ALIGNMENT_STEPS.indexOf(id);
      const now = deps.now();
      progress = { ...progress, steps: Object.fromEntries(ALIGNMENT_STEPS.map((key, i) => {
        const step = progress.steps[key];
        if (i < index && step.status === 'pending') return [key, { status: 'skipped' }];
        if (i < index && step.status === 'active') return [key, { ...step, status: 'done', leftAt: now }];
        if (key === id && step.status === 'pending') return [key, { status: 'active', enteredAt: now }];
        return [key, step];
      })) as Record<StepId, AlignmentStep> };
    },
    finish(id: StepId, status: 'done' | 'failed' = 'done') {
      progress = { ...progress, steps: { ...progress.steps, [id]: { ...progress.steps[id], status, leftAt: deps.now() } } };
    },
  };
}
type JobMonitor = ReturnType<typeof createMonitor>;
class AlignmentError extends Error {
  constructor(public reason: AlignmentFailure, detail: string) { super(detail); }
}

const RETRY_BUDGET = 5;
const MIN_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60_000;
const SUBMIT_MAY_HAVE_LANDED = 'A job may already have been created at EBI, so trying again could start a second one.';

type Failure = Exclude<EbiResponse, { kind: 'ok' }> | { kind: 'unrecognized'; detail: string };
type Attempt<T> = { kind: 'ok'; data: T } | Failure;

function isTransient(failure: Failure): boolean {
  return failure.kind === 'network' || failure.kind === 'unrecognized' || (failure.kind === 'http' && failure.transient);
}

function failureError(failure: Failure): AlignmentError {
  if (failure.kind === 'network') return new AlignmentError('network', failure.detail);
  if (failure.kind === 'unrecognized') return new AlignmentError('invalid-result', failure.detail);
  return new AlignmentError('http', `EBI HTTP ${failure.status}: ${failure.detail}`);
}

function submitError(response: Exclude<EbiResponse, { kind: 'ok' }>): AlignmentError {
  // A failed or timed-out connection does not prove the upload never reached EBI.
  if (response.kind === 'network') return new AlignmentError('network', `${response.detail} ${SUBMIT_MAY_HAVE_LANDED}`);
  if (response.kind === 'http') return failureError(response);
  const reason = /email/i.test(response.detail) ? 'email-invalid'
    : /minimum of .*sequences|maximum .*sequences|input is too big|does not contain a sequence/i.test(response.detail) ? 'input-invalid' : 'rejected';
  return new AlignmentError(reason, response.detail);
}

/** Backoff unless EBI said when to come back; the floor keeps `Retry-After: 0` from becoming a hot retry loop. */
function retryDelay(failure: Failure, failures: number): number {
  const wait = failure.kind === 'http' && failure.retryAfterMs !== undefined ? failure.retryAfterMs : 3000 * 2 ** failures;
  return Math.min(Math.max(wait, MIN_RETRY_DELAY_MS), MAX_RETRY_DELAY_MS);
}

/**
 * Retries transient failures and resolves with the first answer EBI meant: a success, or a
 * non-transient error for the caller to interpret. Throws after RETRY_BUDGET consecutive
 * transient failures.
 */
async function attemptWithRetry<T>(operation: () => Promise<Attempt<T>>, deps: RemoteAlignmentDeps, monitor: JobMonitor, polling = false): Promise<Attempt<T>> {
  for (let failures = 0; ; failures++) {
    deps.signal.throwIfAborted();
    const attempt = await operation();
    deps.signal.throwIfAborted();
    if (polling) monitor.update({ lastCheckedAt: deps.now() });
    if (attempt.kind === 'ok' || !isTransient(attempt)) { monitor.update({ retryCount: 0, nextCheckAt: undefined }); return attempt; }
    if (failures === RETRY_BUDGET - 1) {
      monitor.update({ retryCount: RETRY_BUDGET, nextCheckAt: undefined });
      throw failureError(attempt);
    }
    const delay = retryDelay(attempt, failures);
    monitor.update({ retryCount: failures + 1, nextCheckAt: deps.now() + delay });
    await deps.sleep(delay, deps.signal);
  }
}

async function readWithRetry<T>(operation: () => Promise<Attempt<T>>, deps: RemoteAlignmentDeps, monitor: JobMonitor, polling = false): Promise<T> {
  const attempt = await attemptWithRetry(operation, deps, monitor, polling);
  if (attempt.kind !== 'ok') throw failureError(attempt);
  return attempt.data;
}

/** A 200 body that is not a job status is usually a proxy or captive-portal page, so it counts as transient. */
async function readStatus(input: RemoteAlignmentInput, jobId: string, deps: RemoteAlignmentDeps): Promise<Attempt<JobStatus>> {
  const response = await deps.client.status(input.engine.id, jobId, deps.signal);
  if (response.kind !== 'ok') return response;
  const status = parseJobStatus(response.data);
  if (status) return { kind: 'ok', data: status };
  return { kind: 'unrecognized', detail: `EBI's status check kept returning something other than a job status: ${describeEbiBody(response.data)}` };
}

/** A single best-effort attempt: the job has already failed, so its log may neither delay that verdict nor leave retry counters behind. */
async function readErrorLog(input: RemoteAlignmentInput, jobId: string, deps: RemoteAlignmentDeps): Promise<string> {
  const response = await deps.client.result(input.engine.id, jobId, 'error', deps.signal);
  deps.signal.throwIfAborted();
  if (response.kind !== 'ok') return '';
  return response.data.trim().split('\n').slice(-8).join('\n').slice(-2000);
}

async function pollJob(input: RemoteAlignmentInput, jobId: string, deps: RemoteAlignmentDeps, monitor: JobMonitor): Promise<void> {
  for (;;) {
    const status = await readWithRetry(() => readStatus(input, jobId, deps), deps, monitor, true);
    if (status === 'FINISHED') return;
    if (status === 'NOT_FOUND') throw new AlignmentError('job-lost', 'EBI no longer has this job.');
    if (status === 'ERROR' || status === 'FAILURE') {
      const log = await readErrorLog(input, jobId, deps);
      throw new AlignmentError('job-error', log ? `The aligner failed.\n${log}` : 'The aligner failed.');
    }
    const phase = status === 'QUEUED' ? 'queued' : 'running';
    monitor.enter(phase);
    monitor.emit({ phase, jobId, since: monitor.progress.steps[phase].enteredAt ?? deps.now() });
    const elapsed = deps.now() - monitor.progress.startedAt;
    const delay = elapsed < 30_000 ? 3000 : elapsed < 120_000 ? 5000 : 10_000;
    monitor.update({ nextCheckAt: deps.now() + delay });
    await deps.sleep(delay, deps.signal);
  }
}

async function fetchAlignment(input: RemoteAlignmentInput, submission: AlignmentSubmission, jobId: string, deps: RemoteAlignmentDeps, monitor: JobMonitor): Promise<FastaAlignedRecord[]> {
  const xml = await readWithRetry(() => deps.client.resultTypes(input.engine.id, jobId, deps.signal), deps, monitor);
  const misses: string[] = [];
  for (const type of pickResultTypes(parseResultTypes(xml))) {
    monitor.update({ resultType: type });
    const response = await attemptWithRetry(() => deps.client.result(input.engine.id, jobId, type, deps.signal), deps, monitor);
    // EBI answers 400 for a listed renderer it cannot produce ("Requested renderer … not available").
    if (response.kind === 'rejected') { misses.push(`${type}: ${response.detail}`); continue; }
    if (response.kind !== 'ok') throw failureError(response);
    if (!response.data.trimStart().startsWith('>')) { misses.push(`${type}: no FASTA in the response`); continue; }
    const result = remapAlignment(response.data, submission);
    if (!result.ok) throw new AlignmentError('invalid-result', result.reason);
    return result.records;
  }
  throw new AlignmentError('no-alignment', ['EBI returned no alignment.', ...misses].join('\n'));
}

export async function runRemoteAlignment(input: RemoteAlignmentInput, deps: RemoteAlignmentDeps): Promise<void> {
  const monitor = createMonitor(input, deps);
  let jobId: string | undefined;
  try {
    deps.signal.throwIfAborted();
    monitor.enter('validated');
    const preflight = preflightAlignment(input.records, input.engine.id);
    if (!preflight.ok) throw new AlignmentError('input-invalid', preflight.issues.map(issue => issue.message).join('\n'));
    const email = validateEmail(input.email);
    if (!email.ok) throw new AlignmentError('email-invalid', 'EBI needs a valid email.');
    monitor.finish('validated');
    monitor.enter('submitted');
    monitor.update({ bytes: preflight.submission.bytes });
    const response = await deps.client.submit(input.engine.id, {
      email: email.value, title: 'dunceious', sequence: preflight.submission.fasta, ...input.engine.buildParams(input.moleculeKind),
    }, deps.signal);
    if (response.kind === 'ok') jobId = response.data.trim() || undefined;
    deps.signal.throwIfAborted();
    if (response.kind !== 'ok') throw submitError(response);
    if (!jobId) throw new AlignmentError('invalid-result', 'EBI returned an empty job ID.');
    monitor.finish('submitted');
    monitor.emit({ phase: 'submitting', jobId });
    await pollJob(input, jobId, deps, monitor);
    monitor.enter('fetching');
    monitor.emit({ phase: 'fetching', jobId });
    const records = await fetchAlignment(input, preflight.submission, jobId, deps, monitor);
    deps.signal.throwIfAborted();
    if (!deps.isCurrent()) throw new AlignmentError('stale', 'Records changed during alignment; result discarded.');
    monitor.enter('applied');
    monitor.emit({ phase: 'applying', jobId });
    deps.signal.throwIfAborted();
    const alignedLength = deps.apply(records);
    monitor.finish('applied');
    monitor.update({ alignedLength });
    monitor.emit({ phase: 'done', jobId, elapsed: deps.now() - monitor.progress.startedAt });
  } catch (error) {
    if (deps.signal.aborted) { monitor.emit({ phase: 'cancelled', jobId }); return; }
    const failure = error instanceof AlignmentError ? error : new AlignmentError('invalid-result', error instanceof Error ? error.message : String(error));
    const failedStep = ALIGNMENT_STEPS.find(id => monitor.progress.steps[id].status === 'active')
      ?? ALIGNMENT_STEPS.find(id => monitor.progress.steps[id].status === 'pending') ?? 'applied';
    monitor.finish(failedStep, 'failed');
    monitor.emit({ phase: 'failed', reason: failure.reason, detail: failure.message, jobId });
  }
}

export function sleepUntilPoll(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const cancel = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(); }, ms);
    signal.addEventListener('abort', cancel, { once: true });
  });
}
