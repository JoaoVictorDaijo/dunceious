/**
 * Benchmark visualization module.
 *
 * Reads `benchmark/results/benchmark.json` and writes SVG images to
 * `benchmark/plots/`:
 *   - summary-table.svg      flat table of every benchmark entry
 *   - pivot-duration.svg     seqLength × numRecords pivot of durationMs
 *   - pivot-heap.svg         seqLength × numRecords pivot of heapDeltaBytes
 *   - pivot-rss.svg          seqLength × numRecords pivot of rssDeltaBytes
 *   - duration-vs-records.svg     duration scaling with record count
 *   - duration-vs-seqlength.svg   duration scaling with sequence length
 *   - heap-vs-records.svg         peak heap vs record count
 *   - heap-vs-seqlength.svg       peak heap vs sequence length
 *
 * Invoked automatically from the bench suite's afterAll hook and also
 * runnable standalone via `npm run plot`.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_RESULTS = join(__dirname, 'results', 'benchmark.json');
const DEFAULT_OUT = join(__dirname, 'plots');

const COLORS = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2'];

function svgEscape(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;',
  }[c]));
}

function niceCeil(n) {
  if (n <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const frac = n / pow;
  let nice;
  if (frac <= 1) nice = 1;
  else if (frac <= 2) nice = 2;
  else if (frac <= 5) nice = 5;
  else nice = 10;
  return nice * pow;
}

function niceTicks(max, count = 5) {
  const step = niceCeil(max / count);
  const ticks = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(v);
  return ticks;
}

// ── SVG primitives ────────────────────────────────────────────────────────────

function lineChart({ title, xLabel, yLabel, xLabels, series, legendTitle, formatY }) {
  const width = 960;
  const height = 540;
  const pad = { l: 96, r: 220, t: 60, b: 84 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;

  const allY = series.flatMap((s) => s.points.map((p) => p.y));
  const yMax = niceCeil(Math.max(...allY, 1));
  const yTicks = niceTicks(yMax, 5);

  const xn = xLabels.length;
  const xPos = (i) => pad.l + (xn === 1 ? plotW / 2 : (i / (xn - 1)) * plotW);
  const yPos = (y) => pad.t + plotH - (y / yMax) * plotH;
  const fmtY = formatY ?? ((v) => String(v));

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, -apple-system, sans-serif" font-size="12">`,
  );
  parts.push(`<rect width="${width}" height="${height}" fill="white"/>`);
  parts.push(
    `<text x="${width / 2}" y="30" font-size="16" font-weight="600" text-anchor="middle" fill="#222">${svgEscape(title)}</text>`,
  );

  // Horizontal gridlines & Y ticks
  for (const t of yTicks) {
    const y = yPos(t);
    parts.push(`<line x1="${pad.l}" y1="${y}" x2="${pad.l + plotW}" y2="${y}" stroke="#eee"/>`);
    parts.push(
      `<text x="${pad.l - 8}" y="${y + 4}" text-anchor="end" fill="#555">${svgEscape(fmtY(t))}</text>`,
    );
  }

  // X ticks & labels
  for (let i = 0; i < xn; i++) {
    const x = xPos(i);
    parts.push(`<line x1="${x}" y1="${pad.t + plotH}" x2="${x}" y2="${pad.t + plotH + 4}" stroke="#555"/>`);
    parts.push(
      `<text x="${x}" y="${pad.t + plotH + 22}" text-anchor="middle" fill="#555">${svgEscape(xLabels[i])}</text>`,
    );
  }

  // Axes
  parts.push(`<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + plotH}" stroke="#333"/>`);
  parts.push(`<line x1="${pad.l}" y1="${pad.t + plotH}" x2="${pad.l + plotW}" y2="${pad.t + plotH}" stroke="#333"/>`);

  // Axis labels
  parts.push(
    `<text x="${pad.l + plotW / 2}" y="${height - 26}" text-anchor="middle" fill="#333">${svgEscape(xLabel)}</text>`,
  );
  parts.push(
    `<text transform="translate(26, ${pad.t + plotH / 2}) rotate(-90)" text-anchor="middle" fill="#333">${svgEscape(yLabel)}</text>`,
  );

  // Series lines & markers
  series.forEach((s, idx) => {
    const color = s.color || COLORS[idx % COLORS.length];
    const d = s.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.xi).toFixed(1)} ${yPos(p.y).toFixed(1)}`)
      .join(' ');
    parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2"/>`);
    for (const p of s.points) {
      parts.push(`<circle cx="${xPos(p.xi).toFixed(1)}" cy="${yPos(p.y).toFixed(1)}" r="3.5" fill="${color}"/>`);
    }
  });

  // Legend
  const legX = pad.l + plotW + 24;
  if (legendTitle) {
    parts.push(
      `<text x="${legX}" y="${pad.t + 4}" font-weight="600" fill="#333">${svgEscape(legendTitle)}</text>`,
    );
  }
  series.forEach((s, i) => {
    const color = s.color || COLORS[i % COLORS.length];
    const y = pad.t + 24 + i * 22;
    parts.push(`<line x1="${legX}" y1="${y}" x2="${legX + 26}" y2="${y}" stroke="${color}" stroke-width="2"/>`);
    parts.push(`<circle cx="${legX + 13}" cy="${y}" r="3.5" fill="${color}"/>`);
    parts.push(`<text x="${legX + 34}" y="${y + 4}" fill="#333">${svgEscape(s.name)}</text>`);
  });

  parts.push(`</svg>`);
  return parts.join('');
}

function tableSvg({ title, subtitle, headers, rows, colAligns }) {
  const rowH = 26;
  const headerH = 30;
  const titleH = subtitle ? 58 : 44;
  const padX = 24;
  const padY = 20;

  const charW = 7.5; // rough monospace width
  const widths = headers.map((h, i) => {
    const lens = [h.length, ...rows.map((r) => String(r[i]).length)];
    const maxChars = Math.max(...lens);
    return Math.max(56, Math.ceil(maxChars * charW) + 24);
  });
  const totalW = widths.reduce((a, b) => a + b, 0);
  const width = totalW + padX * 2;
  const height = titleH + headerH + rows.length * rowH + padY;

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="12">`,
  );
  parts.push(`<rect width="${width}" height="${height}" fill="white"/>`);
  parts.push(
    `<text x="${width / 2}" y="26" font-family="system-ui, sans-serif" font-size="16" font-weight="600" text-anchor="middle" fill="#222">${svgEscape(title)}</text>`,
  );
  if (subtitle) {
    parts.push(
      `<text x="${width / 2}" y="46" font-family="system-ui, sans-serif" font-size="11" text-anchor="middle" fill="#666">${svgEscape(subtitle)}</text>`,
    );
  }

  let y = titleH;
  parts.push(`<rect x="${padX}" y="${y}" width="${totalW}" height="${headerH}" fill="#f4f4f6"/>`);
  let x = padX;
  headers.forEach((h, i) => {
    const align = colAligns?.[i] ?? 'left';
    const tx = align === 'right' ? x + widths[i] - 10 : align === 'center' ? x + widths[i] / 2 : x + 10;
    const anchor = align === 'right' ? 'end' : align === 'center' ? 'middle' : 'start';
    parts.push(
      `<text x="${tx}" y="${y + headerH - 10}" text-anchor="${anchor}" font-weight="600" fill="#222">${svgEscape(h)}</text>`,
    );
    x += widths[i];
  });

  y += headerH;
  rows.forEach((row, ri) => {
    if (ri % 2 === 1) {
      parts.push(`<rect x="${padX}" y="${y}" width="${totalW}" height="${rowH}" fill="#fafafa"/>`);
    }
    x = padX;
    row.forEach((cell, ci) => {
      const align = colAligns?.[ci] ?? 'left';
      const tx = align === 'right' ? x + widths[ci] - 10 : align === 'center' ? x + widths[ci] / 2 : x + 10;
      const anchor = align === 'right' ? 'end' : align === 'center' ? 'middle' : 'start';
      parts.push(
        `<text x="${tx}" y="${y + rowH - 8}" text-anchor="${anchor}" fill="#222">${svgEscape(cell)}</text>`,
      );
      x += widths[ci];
    });
    y += rowH;
  });

  parts.push(
    `<rect x="${padX}" y="${titleH}" width="${totalW}" height="${headerH + rows.length * rowH}" fill="none" stroke="#ddd"/>`,
  );
  parts.push(`</svg>`);
  return parts.join('');
}

// ── Entry ─────────────────────────────────────────────────────────────────────

export function generatePlots({ resultsPath = DEFAULT_RESULTS, outDir = DEFAULT_OUT } = {}) {
  if (!existsSync(resultsPath)) {
    process.stderr.write(`visualize: no results file at ${resultsPath}\n`);
    return;
  }
  const data = JSON.parse(readFileSync(resultsPath, 'utf8'));
  const results = Array.isArray(data.results) ? data.results : [];
  if (results.length === 0) {
    process.stderr.write(`visualize: results array is empty\n`);
    return;
  }
  mkdirSync(outDir, { recursive: true });

  const seqLengths = [...new Set(results.map((r) => r.seqLength_bp))].sort((a, b) => a - b);
  const recordCounts = [...new Set(results.map((r) => r.numRecords))].sort((a, b) => a - b);
  const lookup = new Map(results.map((r) => [`${r.seqLength_bp}|${r.numRecords}`, r]));

  const generatedAt = data.generatedAt ?? new Date().toISOString();
  const envLine = data.environment
    ? `${data.environment.platform}/${data.environment.arch} · node ${data.environment.nodeVersion}`
    : '';
  const subtitle = envLine ? `${generatedAt} · ${envLine}` : generatedAt;

  // ── Flat summary table ─────────────────────────────────────────────────────
  {
    const sorted = [...results].sort(
      (a, b) => a.seqLength_bp - b.seqLength_bp || a.numRecords - b.numRecords,
    );
    const headers = [
      'seqLength (bp)',
      'numRecords',
      'duration (ms)',
      'heap (bytes)',
      'rss (bytes)',
      'records',
      'features',
    ];
    const aligns = ['right', 'right', 'right', 'right', 'right', 'right', 'right'];
    const rows = sorted.map((r) => [
      r.seqLength_bp.toLocaleString(),
      r.numRecords.toString(),
      r.durationMs.toFixed(3),
      r.heapDeltaBytes.toLocaleString(),
      r.rssDeltaBytes.toLocaleString(),
      r.recordsParsed.toString(),
      r.featuresParsed.toString(),
    ]);
    writeFileSync(
      join(outDir, 'summary-table.svg'),
      tableSvg({ title: 'Benchmark summary', subtitle, headers, rows, colAligns: aligns }),
    );
  }

  // ── Pivot tables (seqLength × numRecords) ──────────────────────────────────
  const writePivot = (title, field, formatter, outName) => {
    const headers = ['seqLength (bp)', ...recordCounts.map((n) => `${n} rec`)];
    const aligns = headers.map(() => 'right');
    const rows = seqLengths.map((sl) => [
      sl.toLocaleString(),
      ...recordCounts.map((nr) => {
        const r = lookup.get(`${sl}|${nr}`);
        return r ? formatter(r[field]) : '—';
      }),
    ]);
    writeFileSync(
      join(outDir, outName),
      tableSvg({ title, subtitle, headers, rows, colAligns: aligns }),
    );
  };
  writePivot('Duration (ms) — seqLength × numRecords', 'durationMs', (v) => v.toFixed(3), 'pivot-duration.svg');
  writePivot('Peak heap (bytes) — seqLength × numRecords', 'heapDeltaBytes', (v) => v.toLocaleString(), 'pivot-heap.svg');
  writePivot('RSS delta (bytes) — seqLength × numRecords', 'rssDeltaBytes', (v) => v.toLocaleString(), 'pivot-rss.svg');

  // ── Line charts ────────────────────────────────────────────────────────────
  // groupBy='seqLength_bp': one line per sequence length, x-axis = numRecords
  // groupBy='numRecords'  : one line per record count,  x-axis = seqLength_bp
  const buildSeries = (groupBy) => {
    const groupVals = groupBy === 'seqLength_bp' ? seqLengths : recordCounts;
    const xVals = groupBy === 'seqLength_bp' ? recordCounts : seqLengths;
    return (yField) =>
      groupVals.map((g, i) => ({
        name: groupBy === 'seqLength_bp' ? `${g.toLocaleString()} bp` : `${g} record${g === 1 ? '' : 's'}`,
        color: COLORS[i % COLORS.length],
        points: xVals.map((xv, xi) => {
          const key = groupBy === 'seqLength_bp' ? `${g}|${xv}` : `${xv}|${g}`;
          const r = lookup.get(key);
          return { xi, y: r ? r[yField] : 0 };
        }),
      }));
  };

  const byLen = buildSeries('seqLength_bp');
  const byRec = buildSeries('numRecords');
  const fmtMs = (v) => v.toFixed(v < 10 ? 2 : 0);
  const fmtMB = (v) => (v / 1e6).toFixed(v >= 1e7 ? 0 : 1);

  writeFileSync(
    join(outDir, 'duration-vs-records.svg'),
    lineChart({
      title: 'Parse duration vs number of records',
      xLabel: 'numRecords',
      yLabel: 'Duration (ms)',
      xLabels: recordCounts.map(String),
      series: byLen('durationMs'),
      legendTitle: 'seqLength',
      formatY: fmtMs,
    }),
  );
  writeFileSync(
    join(outDir, 'duration-vs-seqlength.svg'),
    lineChart({
      title: 'Parse duration vs sequence length',
      xLabel: 'seqLength (bp)',
      yLabel: 'Duration (ms)',
      xLabels: seqLengths.map((n) => n.toLocaleString()),
      series: byRec('durationMs'),
      legendTitle: 'numRecords',
      formatY: fmtMs,
    }),
  );
  writeFileSync(
    join(outDir, 'heap-vs-records.svg'),
    lineChart({
      title: 'Peak heap vs number of records',
      xLabel: 'numRecords',
      yLabel: 'Heap (MB)',
      xLabels: recordCounts.map(String),
      series: byLen('heapDeltaBytes'),
      legendTitle: 'seqLength',
      formatY: fmtMB,
    }),
  );
  writeFileSync(
    join(outDir, 'heap-vs-seqlength.svg'),
    lineChart({
      title: 'Peak heap vs sequence length',
      xLabel: 'seqLength (bp)',
      yLabel: 'Heap (MB)',
      xLabels: seqLengths.map((n) => n.toLocaleString()),
      series: byRec('heapDeltaBytes'),
      legendTitle: 'numRecords',
      formatY: fmtMB,
    }),
  );

  process.stdout.write(`visualize: wrote 8 SVGs to ${outDir}\n`);
}

// CLI entry: `node benchmark/visualize.mjs`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generatePlots();
}
