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

// Bundles the design prototypes in ./prototypes into one standalone, offline HTML
// page for sharing with people who have no access to this repo or its tooling.
//
// Each prototype is embedded in its own iframe via srcdoc: they were authored
// independently and reuse class names like .app and .nav, so an iframe is what
// keeps one prototype's CSS from bleeding into another's.
//
//   node docs/design/build-bundle.mjs

import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'environment-accent-prototypes.html');

const PROTOTYPES = [
  {
    id: 'frame-styles',
    file: join(HERE, 'prototypes/gradient-frame-styles.html'),
    tab: 'Header + Footer Styles',
    blurb:
      'The current direction. Three session types (no file / nucleotide / protein) x two modes x nine header-and-footer treatments. The gradient is confined to the header and footer bars; the toolbar and every data surface stay flat.',
  },
  {
    id: 'in-context',
    file: join(HERE, 'prototypes/gradient-incontext.html'),
    tab: 'Frame vs Data (A/B/C)',
    blurb:
      'The round that established the governing rule: three chrome-confined treatments (Clean Instrument, Lit Chrome, Atmospheric) on both the Viewport and the Database Hub.',
  },
  {
    id: 'gallery',
    file: join(HERE, 'prototypes/gradient-gallery.html'),
    tab: 'Technique Reference',
    blurb:
      'The vocabulary: seven gradient techniques recreated live, each with the products that use it (Arc, Stripe, Linear, Vercel, Apple). Not the Dunceious layout — the reference library behind it.',
  },
];

const escAttr = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** Wraps an artifact-style fragment (no doctype/html/head/body) into a real document. */
const standalone = (raw) => {
  const m = raw.match(/<title>([\s\S]*?)<\/title>/i);
  const title = m ? m[1].trim() : 'Dunceious prototype';
  const body = raw.replace(/<title>[\s\S]*?<\/title>/i, '');
  return (
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${title}</title>` +
    `<style>*{box-sizing:border-box}body{margin:0}</style></head><body>${body}</body></html>`
  );
};

const frames = PROTOTYPES.filter((p) => {
  if (existsSync(p.file)) return true;
  console.warn(`SKIP (missing): ${p.file}`);
  return false;
}).map((p) => {
  const raw = readFileSync(p.file, 'utf8');
  return { ...p, srcdoc: escAttr(standalone(raw)), bytes: Buffer.byteLength(raw) };
});

if (!frames.length) throw new Error('No prototype files found under ./prototypes.');

const LICENSE = `<!--
  Dunceious

  This file is part of Dunceious.

  Dunceious is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  Dunceious is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with Dunceious.  If not, see <https://www.gnu.org/licenses/>.
-->`;

const html = `<!DOCTYPE html>
${LICENSE}
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Dunceious — Environment Accent Prototypes</title>
<style>
  *{box-sizing:border-box}
  :root{
    --bg:#070b14;--panel:#0e1626;--ink:#e6edf6;--muted:#93a2b8;--faint:#5b6b83;
    --line:rgba(148,163,184,.16);--accent:#0ea5e9;
    --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
    --mono:ui-monospace,"SF Mono","JetBrains Mono",Menlo,Consolas,monospace;
  }
  @media (prefers-color-scheme: light){
    :root{--bg:#eef2f8;--panel:#fff;--ink:#16202f;--muted:#536178;--faint:#8391a8;--line:rgba(30,41,59,.14)}
  }
  html,body{height:100%}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);
       display:flex;flex-direction:column;overflow:hidden}
  header{border-bottom:1px solid var(--line);padding:14px 20px 0;flex:none}
  .titlerow{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;margin-bottom:12px}
  h1{margin:0;font-size:1.05rem;font-weight:650;letter-spacing:-.01em}
  h1 b{color:var(--accent)}
  .meta{font-family:var(--mono);font-size:.64rem;letter-spacing:.14em;text-transform:uppercase;color:var(--faint)}
  .tabs{display:flex;gap:6px;flex-wrap:wrap}
  .tabs button{font-family:var(--mono);font-size:.72rem;color:var(--muted);background:transparent;
    border:1px solid var(--line);border-bottom:none;cursor:pointer;padding:9px 14px;
    border-radius:9px 9px 0 0;transition:.18s;position:relative;top:1px}
  .tabs button:hover{color:var(--ink)}
  .tabs button.on{color:var(--ink);background:var(--panel);border-color:var(--line);
    box-shadow:inset 0 2px 0 var(--accent)}
  .tabs button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .blurb{padding:11px 20px;font-size:.84rem;color:var(--muted);border-bottom:1px solid var(--line);
    background:var(--panel);flex:none;line-height:1.5}
  .stage{flex:1;min-height:0;position:relative;background:var(--panel)}
  .stage iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:none;background:transparent}
  .stage iframe.on{display:block}
  footer{flex:none;padding:8px 20px;border-top:1px solid var(--line);font-family:var(--mono);
    font-size:.6rem;letter-spacing:.1em;color:var(--faint);display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
</style>
</head>
<body>

<header>
  <div class="titlerow">
    <h1><b>Dunceious</b> — Environment Accent Prototypes</h1>
    <span class="meta">Interactive · offline · no account required</span>
  </div>
  <div class="tabs" id="tabs" role="tablist">
${frames.map((f, i) => `    <button type="button" role="tab" data-target="${f.id}"${i === 0 ? ' class="on" aria-selected="true"' : ' aria-selected="false"'}>${f.tab}</button>`).join('\n')}
  </div>
</header>

<div class="blurb" id="blurb">${frames[0].blurb}</div>

<div class="stage" id="stage">
${frames.map((f, i) => `  <iframe id="${f.id}" title="${escAttr(f.tab)}"${i === 0 ? ' class="on"' : ''} srcdoc="${f.srcdoc}"></iframe>`).join('\n')}
</div>

<footer>
  <span>Design prototypes · draft fidelity · AGPL-3.0-or-later</span>
  <span>Each panel is live HTML/CSS — every control works</span>
</footer>

<script>
  var BLURBS = ${JSON.stringify(Object.fromEntries(frames.map((f) => [f.id, f.blurb])))};
  var tabs = document.getElementById('tabs');
  var blurb = document.getElementById('blurb');
  tabs.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var id = b.dataset.target;
    tabs.querySelectorAll('button').forEach(function (x) {
      var on = x === b;
      x.classList.toggle('on', on);
      x.setAttribute('aria-selected', String(on));
    });
    document.querySelectorAll('.stage iframe').forEach(function (f) {
      f.classList.toggle('on', f.id === id);
    });
    blurb.textContent = BLURBS[id];
  });
</script>

</body>
</html>
`;

writeFileSync(OUT, html, 'utf8');
console.log('Wrote :', OUT);
console.log('Size  :', (statSync(OUT).size / 1024).toFixed(1) + ' KB');
frames.forEach((f) => console.log('  panel:', f.tab, '(' + (f.bytes / 1024).toFixed(1) + ' KB source)'));
