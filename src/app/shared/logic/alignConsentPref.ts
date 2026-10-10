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

// Consent lives only in this module's memory so that it ends with the page load:
// a refresh, a reopened page or a new tab asks again. sessionStorage would survive
// a refresh, so it is deliberately not used.
let consent: AlignConsent | null = null;

// Earlier versions kept the agreement in localStorage; drop it so it is neither
// honoured nor left behind.
const LEGACY_STORAGE_KEY = 'dunceious.alignConsent';
try { window.localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* storage blocked or absent */ }

export function readAlignConsent(): AlignConsent | null {
  return consent;
}

export function writeAlignConsent(now: Date): void {
  consent = { acceptedAt: now.toISOString() };
}

export function clearAlignConsent(): void {
  consent = null;
}
