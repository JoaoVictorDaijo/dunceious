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

import React, { useEffect, useRef, useState } from 'react';
import { ALIGNMENT_ENGINES, GLOBAL_ALIGNMENT_ISSUES, validateEmail, type AlignmentPreflight, type EngineId, type AlignmentMoleculeKind } from '@/src/core/alignment';
import { ALIGN_CONSENT_COPY, readAlignConsent, writeAlignConsent, clearAlignConsent } from '@/src/app/shared/logic/alignConsentPref';
import AlignmentJobMonitor, { elapsedSeconds, useJobClock } from './AlignmentJobMonitor';
import { isAlignmentActive, type RemoteAlignmentState } from '@/src/app/shared/logic/remoteAlignment';

export interface AlignRemoteModalProps {
  state: RemoteAlignmentState;
  count: number;
  bytes: number;
  moleculeKind: AlignmentMoleculeKind;
  hasAlignment: boolean;
  engineId: EngineId | null;
  email: string;
  verifiedEmail: string;
  verdicts: Record<EngineId, AlignmentPreflight>;
  onMinimize: () => void;
  onEngineChange: (engine: EngineId) => void;
  onEmailChange: (email: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  onRetry: () => void;
}

function EnginePicker({ verdicts, engineId, onEngineChange }: Pick<AlignRemoteModalProps, 'verdicts' | 'engineId' | 'onEngineChange'>) {
  return (
    <div role="radiogroup" aria-label="Alignment engine" className="space-y-2">
      {ALIGNMENT_ENGINES.map(engine => {
        const verdict = verdicts[engine.id];
        const reason = verdict.ok ? null : verdict.issues.find(issue => !GLOBAL_ALIGNMENT_ISSUES.has(issue.code))?.message ?? 'Resolve the input issues above.';
        return (
          <label key={engine.id} className={`flex gap-3 rounded-xl border p-3 motion-safe:transition-colors ${reason ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-800/60'} ${engineId === engine.id && !reason ? 'border-[var(--env)] bg-slate-800/70' : 'border-slate-700/70'}`}>
            <input type="radio" name="alignment-engine" value={engine.id} checked={engineId === engine.id && !reason} disabled={!!reason}
              onChange={() => onEngineChange(engine.id)} className="mt-1 accent-[var(--env)] shrink-0" />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                {engine.label}
                {engine.id === 'mafft' && <span className="rounded-full border border-[var(--env)] px-2 py-0.5 text-[9px] font-medium tracking-wide text-[var(--env)]">Default</span>}
              </span>
              <span className="mt-1 block text-xs text-slate-400">{reason ?? engine.subtext}</span>
              <span className="mt-1.5 block text-[10px] font-mono text-slate-500">≤ {engine.maxSequences} seqs · {engine.maxBytes / 1_000_000} MB</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function ConsentStep({ acknowledged, onChange }: { acknowledged: boolean; onChange: (checked: boolean) => void }) {
  return (
    <>
      <ul className="list-disc space-y-3 pl-5 text-sm leading-relaxed text-slate-300">
        {ALIGN_CONSENT_COPY.bullets.map(bullet => <li key={bullet}>{bullet}</li>)}
      </ul>
      <p className="text-xs text-slate-400">
        <a href={ALIGN_CONSENT_COPY.privacyUrl} target="_blank" rel="noreferrer" className="text-[var(--env)] underline">EMBL-EBI privacy notice</a>
        {' · '}
        <a href={ALIGN_CONSENT_COPY.termsUrl} target="_blank" rel="noreferrer" className="text-[var(--env)] underline">Terms of use</a>
      </p>
      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-700 p-3 text-sm leading-relaxed text-slate-200">
        <input type="checkbox" required checked={acknowledged} onChange={event => onChange(event.target.checked)} className="mt-1 shrink-0 accent-[var(--env)]" />
        <span>{ALIGN_CONSENT_COPY.acknowledgement}</span>
      </label>
    </>
  );
}

type ConfigurationProps = Pick<AlignRemoteModalProps, 'state' | 'verdicts' | 'engineId' | 'onEngineChange' | 'email' | 'verifiedEmail' | 'onEmailChange' | 'hasAlignment'> & {
  consent: ReturnType<typeof readAlignConsent>;
  onReview: () => void;
  emailTouched: boolean;
  onEmailBlur: () => void;
};
function AlignmentConfiguration(props: ConfigurationProps) {
  const { state, engineId, email, verifiedEmail, hasAlignment, consent, onReview, emailTouched, onEmailBlur, onEmailChange } = props;
  const validation = validateEmail(email);
  const inlineError = state.phase === 'configuring' && state.emailError ? state.emailError : emailTouched && !validation.ok
    ? validation.reason === 'whitespace' ? 'Remove surrounding spaces from the email.' : validation.reason === 'too-long' ? 'Email must be at most 254 characters.' : 'Enter a structurally valid email address.' : null;
  const commonIssues = props.verdicts.mafft.ok ? [] : props.verdicts.mafft.issues.filter(issue => GLOBAL_ALIGNMENT_ISSUES.has(issue.code));
  const selected = engineId ? props.verdicts[engineId] : null;
  return (
    <>
      {consent && <p className="text-xs text-slate-400">
        Sending to EMBL-EBI · agreed until you leave or reload this page · {' '}
        <button type="button" onClick={onReview} className="text-[var(--env)] underline">Review</button>
      </p>}
      {commonIssues.length > 0 && <ul role="alert" className="space-y-1 text-xs text-rose-300">{commonIssues.map(issue => <li key={issue.code}>{issue.message}</li>)}</ul>}
      <EnginePicker {...props} />
      {selected && !selected.ok && <ul className="space-y-1 text-xs text-rose-300">{selected.issues.filter(issue => !GLOBAL_ALIGNMENT_ISSUES.has(issue.code)).map(issue => <li key={issue.code}>{issue.message}</li>)}</ul>}
      {hasAlignment && <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">This will replace the current alignment.</p>}
      <div>
        <label htmlFor="align-email" className="mb-2 block text-xs font-semibold text-slate-300">Email</label>
        <input id="align-email" type="email" onBlur={onEmailBlur} aria-invalid={!!inlineError} value={email} autoComplete="email" onChange={event => onEmailChange(event.target.value)} aria-describedby="align-email-help align-email-error"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-[var(--env)]" />
        <p id="align-email-error" role={inlineError ? 'alert' : undefined} className="mt-1 text-xs text-rose-300">{inlineError}</p>
        {email && verifiedEmail === email && !inlineError && <p className="mt-1 text-xs text-[var(--env)]">✓ Verified by EBI</p>}
        <p id="align-email-help" className="mt-2 text-xs text-slate-500">EBI requires a contact email for each job. It is stored only in this browser.</p>
      </div>
    </>
  );
}

type FooterProps = Pick<AlignRemoteModalProps, 'state' | 'onMinimize' | 'onCancel' | 'onRetry'> & {
  showConsent: boolean;
  consent: ReturnType<typeof readAlignConsent>;
  acknowledged: boolean;
  canSubmit: boolean;
  onRevoke: () => void;
};
function AlignmentFooter({ state, onMinimize, onCancel, onRetry, showConsent, consent, acknowledged, canSubmit, onRevoke }: FooterProps) {
  const active = isAlignmentActive(state);
  const failed = state.phase === 'failed';
  return (
    <footer className="flex justify-end gap-3 border-t border-slate-700/50 bg-slate-800/40 px-6 py-4">
      {showConsent && consent && <button type="button" onClick={onRevoke} className="mr-auto rounded-lg px-4 py-2 text-sm text-rose-300 hover:bg-slate-800">Revoke</button>}
      {active && <button type="button" onClick={onMinimize} className="mr-auto rounded-lg px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Minimize</button>}
      <button type="button" onClick={onCancel} className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">{failed || state.phase === 'done' ? 'Close' : 'Cancel'}</button>
      {showConsent ? <button type="submit" disabled={!acknowledged} className="rounded-lg bg-[var(--env)] px-5 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-30">Continue</button>
        : failed ? <button type="button" onClick={onRetry} className="rounded-lg border border-[var(--env)] px-4 py-2 text-sm text-[var(--env)]">{state.reason === 'input-invalid' ? 'Edit configuration' : 'Try again'}</button>
        : !active && state.phase !== 'done' && <button type="submit" disabled={!canSubmit} className="rounded-lg bg-[var(--env)] px-5 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-30">Align</button>}
    </footer>
  );
}

function useAlignmentDialogFocus({ active, failed, showConsent, engineId, onMinimize, onCancel }: Pick<AlignRemoteModalProps, 'engineId' | 'onMinimize' | 'onCancel'> & { active: boolean; failed: boolean; showConsent: boolean }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => previous?.focus();
  }, []);
  useEffect(() => {
    const dialog = dialogRef.current;
    const target = dialog?.querySelector<HTMLElement>('input:checked:not(:disabled)')
      ?? dialog?.querySelector<HTMLElement>(':is(input, button):not(:disabled)');
    (target ?? dialog)?.focus();
  }, [active, failed, showConsent]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); if (active) onMinimize(); else onCancel(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...(dialogRef.current?.querySelectorAll<HTMLElement>(':is(input, button, a[href]):not(:disabled)') ?? [])]
      .filter(el => !(el instanceof HTMLInputElement) || el.type !== 'radio' || el.checked || !engineId);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  };

  return { dialogRef, handleKeyDown };
}

const AlignRemoteModal: React.FC<AlignRemoteModalProps> = props => {
  const { state, count, bytes, moleculeKind, email, engineId, onSubmit, onCancel } = props;
  const active = isAlignmentActive(state);
  const now = useJobClock(active);
  const failed = state.phase === 'failed';
  const [consent, setConsent] = useState(readAlignConsent);
  const [reviewConsent, setReviewConsent] = useState(false);
  const [acknowledged, setAcknowledged] = useState(!!consent);
  const showConsent = !active && state.phase !== 'failed' && state.phase !== 'done' && (!consent || reviewConsent);
  const { dialogRef, handleKeyDown } = useAlignmentDialogFocus({ ...props, active, failed, showConsent });
  const continueWithConsent = () => {
    if (!acknowledged) return;
    if (!consent) writeAlignConsent(new Date());
    setConsent(readAlignConsent());
    setReviewConsent(false);
  };
  const revokeConsent = () => {
    clearAlignConsent();
    setConsent(null);
    setAcknowledged(false);
    dialogRef.current?.querySelector<HTMLInputElement>('input[type=checkbox]')?.focus();
  };
  const [emailTouched, setEmailTouched] = useState(false);
  const validation = validateEmail(email);
  const selected = engineId ? props.verdicts[engineId] : null;
  const engine = ALIGNMENT_ENGINES.find(e => e.id === engineId);
  const canSubmit = !!engine && selected?.ok === true && validation.ok && !(state.phase === 'configuring' && state.emailError);

  return (
    <div onClick={event => { if (event.target === event.currentTarget) { if (active) props.onMinimize(); else onCancel(); } }} className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="align-remote-title" tabIndex={-1} onKeyDown={handleKeyDown}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex items-center gap-4 border-b border-slate-700/60 px-6 py-5">
          <i aria-hidden="true" className="fas fa-wand-magic-sparkles text-2xl text-[var(--env)]" />
          <div>
            <h2 id="align-remote-title" className="text-lg font-semibold text-white">{showConsent ? ALIGN_CONSENT_COPY.title : 'Align with EMBL-EBI'}</h2>
            {'steps' in state && <p className="text-xs text-slate-400">Elapsed: {elapsedSeconds(state, now)} s</p>}
            <p className="mt-1 text-xs text-slate-400">{count} sequences · {Math.ceil(bytes / 1000)} KB · {moleculeKind === 'protein' ? 'peptide' : 'nucleotide'}</p>
          </div>
        </header>
        <form noValidate onSubmit={event => {
          event.preventDefault();
          if (showConsent) { continueWithConsent(); return; }
          setEmailTouched(true);
          if (consent && canSubmit && !active && !failed) onSubmit();
        }}>
          <div className="space-y-5 px-6 py-5">
            {showConsent ? (
              <ConsentStep acknowledged={acknowledged} onChange={setAcknowledged} />
            ) : active || failed || state.phase === 'done' ? <AlignmentJobMonitor state={state} now={now} /> : (
              <AlignmentConfiguration {...props} consent={consent} emailTouched={emailTouched} onEmailBlur={() => setEmailTouched(true)}
                onReview={() => { setAcknowledged(true); setReviewConsent(true); }} />
            )}
          </div>
          <AlignmentFooter {...props} showConsent={showConsent} consent={consent} acknowledged={acknowledged} canSubmit={canSubmit} onRevoke={revokeConsent} />
        </form>
      </div>
    </div>
  );
};

export default AlignRemoteModal;
