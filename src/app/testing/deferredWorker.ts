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

export function createDeferredWorker<Request, Response>(respond: (request: Request) => Response) {
  return class DeferredWorker {
    static instances: DeferredWorker[] = [];
    onmessage: ((event: MessageEvent<Response>) => void) | null = null;
    onerror: ((event: ErrorEvent) => void) | null = null;
    requests: Request[] = [];
    terminationCount = 0;

    constructor() { DeferredWorker.instances.push(this); }

    postMessage(request: Request) {
      this.requests.push(structuredClone(request));
    }

    terminate() { this.terminationCount++; }

    /** Capture delivery before cleanup to exercise already queued callbacks. */
    queueResponse(index: number, response?: Response): () => void {
      if (!(index in this.requests)) throw new Error(`No request at index ${index}.`);
      const callback = this.onmessage;
      const data = response ?? respond(this.requests[index]);
      return () => callback?.({ data } as MessageEvent<Response>);
    }

    release(index: number, response?: Response) {
      this.queueResponse(index, response)();
    }
  };
}
