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

import { parseEbiError, type EngineId } from '@/src/core/alignment';

export type EbiResponse =
  | { kind: 'ok'; data: string }
  | { kind: 'rejected'; status: 400; detail: string }
  | { kind: 'http'; status: number; detail: string; transient: boolean; retryAfterMs?: number }
  | { kind: 'network'; detail: string };

export interface EbiClient {
  submit(engine: EngineId, params: Record<string, string>, signal: AbortSignal): Promise<EbiResponse>;
  status(engine: EngineId, jobId: string, signal: AbortSignal): Promise<EbiResponse>;
  resultTypes(engine: EngineId, jobId: string, signal: AbortSignal): Promise<EbiResponse>;
  result(engine: EngineId, jobId: string, type: string, signal: AbortSignal): Promise<EbiResponse>;
}

const REQUEST_TIMEOUT_MS = 30_000;
const SUBMIT_TIMEOUT_MS = 120_000;
const HTML_SUMMARY_LENGTH = 120;

/**
 * User-facing text for a body EBI did not mean as data. EBI's own errors are XML with a
 * `<description>`; a proxy, gateway or captive portal answers with an HTML page instead,
 * which is cut down to its title or visible text so markup never reaches the user.
 */
export function describeEbiBody(body: string): string {
  if (!/<(?:!doctype\s+html|html|head|body)\b/i.test(body) || /<description\b/i.test(body)) return parseEbiError(body);
  const title = body.match(/<title\b[^>]*>([^<]*)</i)?.[1].trim();
  const text = title || body.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]*>/g, ' ');
  return text.replace(/\s+/g, ' ').trim().slice(0, HTML_SUMMARY_LENGTH) || 'an HTML page with no message';
}

export function createEbiClient(fetcher: typeof fetch = fetch): EbiClient {
  async function request(engine: EngineId, path: string, signal: AbortSignal, params?: Record<string, string>): Promise<EbiResponse> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) controller.abort();
    // A submit that times out may still have created the job, and the user's retry
    // would then duplicate it, so the upload gets far longer than a poll.
    const timeout = setTimeout(abort, params ? SUBMIT_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
    try {
      const response = await fetcher(`https://www.ebi.ac.uk/Tools/services/rest/${engine}/${path}`, {
        method: params ? 'POST' : 'GET',
        ...(params ? { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() } : {}),
        signal: controller.signal,
      });
      const data = await response.text();
      if (response.ok) return { kind: 'ok', data };
      const detail = describeEbiBody(data);
      if (response.status === 400) return { kind: 'rejected', status: 400, detail };
      const retryAfter = response.headers.get('Retry-After');
      const seconds = retryAfter !== null && /^\d+(?:\.\d+)?$/.test(retryAfter.trim()) ? Number(retryAfter) : undefined;
      const retryAfterMs = (response.status === 429 || response.status === 503) && seconds !== undefined
        ? Math.min(seconds * 1000, 60_000) : undefined;
      return { kind: 'http', status: response.status, detail, transient: response.status === 429 || response.status >= 500, retryAfterMs };
    } catch {
      return { kind: 'network', detail: "Can't reach EBI. Check your connection and try again." };
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
    }
  }

  return {
    submit: (engine, params, signal) => request(engine, 'run', signal, params),
    status: (engine, id, signal) => request(engine, `status/${encodeURIComponent(id)}`, signal),
    resultTypes: (engine, id, signal) => request(engine, `resulttypes/${encodeURIComponent(id)}`, signal),
    result: (engine, id, type, signal) => request(engine, `result/${encodeURIComponent(id)}/${encodeURIComponent(type)}`, signal),
  };
}
