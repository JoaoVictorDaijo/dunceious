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

import { type RefObject } from 'react';
import GenomeZoom from './GenomeZoom';
import { BASE_COLORS, CHANGELOG_URL, FEATURES, REPO_URL, seededNoise } from './greeterContent';
import type { SendLink } from './useSendLink';

export const SEND_SECTION_ID = 'send-to-computer';

interface Props {
  link: SendLink;
  tourButtonRef: RefObject<HTMLButtonElement | null>;
  copyButtonRef: RefObject<HTMLButtonElement | null>;
  onTour: () => void;
  onSend: () => void;
  onOpenWorkbench: () => void;
}

const h2 = 'm-0 text-2xl font-extrabold tracking-tight';
const outlineButton = 'flex h-12 flex-1 items-center justify-center rounded-xl border border-slate-700 bg-transparent text-[15px] font-semibold text-slate-200 no-underline';

// A miniature workbench: record list on the left, annotation bars and alignment rows on the right.
const MINI_ROWS = (() => {
  const rnd = seededNoise(7);
  const bases = Object.values(BASE_COLORS);
  return Array.from({ length: 6 }, (_, r) =>
    Array.from({ length: 40 }, () => (r > 0 && rnd() > 0.12 ? '#e2e8f0' : bases[Math.floor(rnd() * 4)])));
})();

function DesktopMock() {
  return (
    <div aria-hidden="true" className="flex flex-col overflow-hidden rounded-xl border-[6px] border-slate-800 bg-slate-900">
      <div className="flex h-4 items-center gap-1.5 bg-[#111a2e] px-1.5">
        <span className="h-1.5 w-[34px] rounded-sm bg-slate-200" />
        <span className="h-2 w-[30px] rounded-sm bg-sky-600" />
        <span className="h-2 w-[30px] rounded-sm bg-slate-800" />
      </div>
      <div className="flex h-[180px]">
        <div className="flex w-[70px] flex-col gap-1 bg-slate-950 p-1.5">
          {['bg-sky-700', 'bg-slate-800', 'bg-slate-800', 'bg-slate-800', 'bg-slate-800'].map((c, i) => (
            <span key={i} className={`h-3 rounded-sm ${c}`} />
          ))}
        </div>
        <div className="m-1 flex flex-1 flex-col gap-[5px] rounded-md bg-slate-50 p-1.5">
          <div className="h-1.5 w-[70%] rounded-sm bg-sky-200" />
          <div className="ml-[20%] h-1.5 w-[40%] rounded-sm bg-violet-200" />
          {MINI_ROWS.map((row, r) => (
            <div key={r} className="flex h-3.5">
              {row.map((c, i) => <span key={i} className="flex-1" style={{ background: c }} />)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AboutSections() {
  return (
    <>
      <section className="mt-10 flex flex-col gap-2.5 px-6">
        <h2 className={`${h2} mb-1`}>What it does</h2>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex flex-col gap-1.5 rounded-2xl border border-slate-800 bg-[#111a2e] p-4">
              <div className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: f.color }} aria-hidden="true" />
                <span className="text-base font-bold">{f.title}</span>
              </div>
              <div className="text-sm leading-[1.45] text-slate-400">{f.body}</div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-6 mt-10 flex flex-col gap-2 rounded-[20px] border border-green-900 bg-[#0f2a1d] p-6">
        <h2 className="m-0 flex flex-col gap-2">
          <span className="font-mono text-[44px] font-extrabold tracking-[-0.04em] text-green-400">0 bytes</span>
          <span className="text-lg font-bold text-green-100">uploaded. Ever.</span>
        </h2>
        <p className="m-0 text-sm leading-normal text-green-200">
          There is no backend. Your sequences are parsed and searched inside your own browser. The one exception, remote
          alignment through EMBL-EBI, is opt-in and asks you first.
        </p>
      </section>

      <section className="mx-6 mt-7 flex flex-col gap-2.5">
        <h2 className={h2}>Free and open source</h2>
        <p className="m-0 text-[15px] leading-normal text-slate-400">AGPL-3.0-or-later. Read the code, run it locally, or send a pull request.</p>
        <div className="flex gap-2">
          <a href={REPO_URL} className={outlineButton}>Source code</a>
          <a href={CHANGELOG_URL} className={outlineButton}>Changelog</a>
        </div>
      </section>
    </>
  );
}

function SendCard({ link, copyButtonRef }: Pick<Props, 'link' | 'copyButtonRef'>) {
  const copyLabel = link.copyState === 'copied' ? 'Copied' : 'Copy';
  return (
    <section id={SEND_SECTION_ID} className="mx-6 mt-10 flex scroll-mt-6 flex-col gap-3 rounded-[20px] border border-slate-800 bg-[#111a2e] p-6">
      <h2 className="m-0 text-xl font-extrabold">Open it on your computer</h2>
      <div className="flex h-[52px] items-center gap-2 rounded-xl border border-[#263450] bg-slate-950 pl-3.5 pr-1.5">
        <input
          readOnly
          value={link.label}
          aria-label="Dunceious address"
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 bg-transparent font-mono text-[15px] font-semibold text-slate-200 outline-none"
        />
        <button ref={copyButtonRef} type="button" onClick={link.copy} className="h-10 rounded-[10px] bg-sky-700 px-3.5 text-sm font-bold text-white">
          {copyLabel}
        </button>
      </div>
      <p className="m-0 text-xs text-slate-400" role="status">
        {link.copyState === 'failed' ? 'Couldn’t copy. Press and hold the address to copy it.' : ''}
      </p>
      <div className="flex gap-2">
        {link.canShare && (
          <button type="button" onClick={link.share} className={outlineButton}>Share…</button>
        )}
        <a href={link.mailto} className={outlineButton}>Email it to me</a>
      </div>
    </section>
  );
}

export default function GreeterHome({ link, tourButtonRef, copyButtonRef, onTour, onSend, onOpenWorkbench }: Props) {
  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-xl flex-col bg-slate-950 text-slate-200">
      <header className="flex items-start justify-between px-6 pt-[18px]">
        <div>
          <div className="text-xl font-black italic tracking-tight">DUNCEIOUS</div>
          <div className="text-xs italic text-slate-400">Because geniality is overpriced.</div>
        </div>
        <a href={REPO_URL} className="px-1 py-3 text-sm font-semibold text-sky-400 no-underline">GitHub</a>
      </header>

      <main className="flex flex-col">
        <section className="flex flex-col gap-5 px-6 pt-8">
          <div className="flex flex-col gap-3">
            <h1 className="m-0 text-[34px] font-extrabold leading-[1.08] tracking-[-0.025em]">A genome workbench that lives in your browser.</h1>
            <p className="m-0 max-w-[34ch] text-base leading-normal text-slate-300">
              Drag along SARS-CoV-2 to zoom from the whole genome down to single bases and the protein they encode.
            </p>
          </div>
          <GenomeZoom />
        </section>

        <section className="flex flex-col gap-2.5 px-6 pt-4">
          <button ref={tourButtonRef} type="button" onClick={onTour} className="flex h-[54px] items-center justify-center gap-2.5 rounded-[14px] bg-sky-700 text-base font-bold text-white">
            <i className="fa-solid fa-play" aria-hidden="true" />
            Take the 60-second tour
          </button>
          <button type="button" onClick={onSend} className="h-[54px] rounded-[14px] border border-slate-700 text-base font-semibold text-slate-200">
            Send to my computer
          </button>
        </section>

        <section className="mt-10 flex flex-col gap-3.5 px-6">
          <h2 className={h2}>Made for a big screen</h2>
          <p className="m-0 text-[15px] leading-normal text-slate-400">
            Open it on a computer and you get this: records on the left, every base on the right, zoom from whole genome to amino acids.
          </p>
          <DesktopMock />
          <div className="flex flex-col items-center gap-1">
            <button type="button" onClick={onOpenWorkbench} className="p-3 text-sm font-semibold text-sky-400">
              Open the workbench anyway
            </button>
            <span className="text-center text-xs text-slate-400">Works best sideways or on a tablet. Some panels won’t fit.</span>
          </div>
        </section>

        <AboutSections />
        <SendCard link={link} copyButtonRef={copyButtonRef} />
      </main>

      <footer className="mt-10 flex justify-between border-t border-slate-800 p-6 font-mono text-xs font-medium text-slate-400">
        <span>v{__APP_VERSION__}</span>
        <span>Built for science</span>
      </footer>
    </div>
  );
}
