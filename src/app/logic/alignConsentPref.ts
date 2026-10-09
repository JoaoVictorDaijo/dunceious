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

export const ALIGN_CONSENT_VERSION = 1;
export const ALIGN_CONSENT_COPY = {
  title: 'Your sequences will leave this browser',
  bullets: [
    "Everything else in Dunceious runs locally. Alignment is the exception: all loaded sequences, including hidden ones, are uploaded to EMBL-EBI's Job Dispatcher servers in the UK and aligned there.",
    'EMBL-EBI also receives your email and IP address. Per its privacy notice, job logs and your email are deleted after 7 days and web logs after 30 days.',
    "Don't send sequences you are not allowed to share, such as unpublished, confidential or patient-derived data.",
  ],
  acknowledgement: 'I understand that my sequences and email will be sent to EMBL-EBI and handled under its terms of use and privacy notice.',
  privacyUrl: 'https://www.ebi.ac.uk/jdispatcher/assets/html/privacy-notice.pdf',
  termsUrl: 'https://www.ebi.ac.uk/about/terms-of-use/',
};

interface AlignConsent { acceptedAt: string }
const STORAGE_KEY = 'dunceious.alignConsent';
let sessionConsent: AlignConsent | null = null;
let sessionOnly = false;

export function readAlignConsent(): AlignConsent | null {
  if (sessionOnly || typeof window === 'undefined') return sessionConsent;
  let raw: string | null;
  try { raw = window.localStorage.getItem(STORAGE_KEY); }
  catch { return sessionConsent; }

  try {
    const stored = JSON.parse(raw ?? 'null') as { version?: unknown; acceptedAt?: unknown } | null;
    sessionConsent = stored?.version === ALIGN_CONSENT_VERSION && typeof stored.acceptedAt === 'string' && Number.isFinite(Date.parse(stored.acceptedAt))
      ? { acceptedAt: stored.acceptedAt } : null;
  } catch { sessionConsent = null; }

  return sessionConsent;
}

export function writeAlignConsent(now: Date): void {
  sessionConsent = { acceptedAt: now.toISOString() };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: ALIGN_CONSENT_VERSION, ...sessionConsent }));
    sessionOnly = false;
  } catch { sessionOnly = true; }
}

export function clearAlignConsent(): void {
  sessionConsent = null;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    sessionOnly = false;
  } catch {
    // A failed removal must not resurrect the persisted agreement in this session.
    sessionOnly = true;
  }
}
