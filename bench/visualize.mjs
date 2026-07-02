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

/**
 * Benchmark visualization module.
 *
 * Reads `bench/results/benchmark.json` and writes SVG images to
 * `bench/plots/`:
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

function niceTicks(min, max, count = 5) {
  const step = niceCeil((max - min) / count);
  const ticks = [];
  const start = Math.floor(min / step) * step;
  for (let v = start; v <= max + step / 2; v += step) ticks.push(v);
  return ticks;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stddev(values) {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function formatMeanStd(metric, decimals = 2) {
  return `${metric.mean.toFixed(decimals)} ± ${metric.stderr.toFixed(decimals)}`;
}

// ── SVG primitives ────────────────────────────────────────────────────────────

function lineChart({ title, subtitle, xLabel, yLabel, xLabels, series, legendTitle, formatY }) {
  const width = 1120;
  const height = 680;
  const pad = { l: 110, r: 300, t: 96, b: 116 };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;

  const allY = series.flatMap((s) => s.points.flatMap((p) => [Math.max(0, p.y - (p.sd ?? 0)), p.y + (p.sd ?? 0)]));
  const rawMin = Math.min(...allY, 0);
  const rawMax = Math.max(...allY, 1);
  const span = Math.max(rawMax - rawMin, rawMax || 1);
  const yMin = Math.max(0, rawMin - span * 0.12);
  const yMax = rawMax + span * 0.12;
  const yTicks = niceTicks(yMin, yMax, 6);

  const xn = xLabels.length;
  const xPos = (i) => pad.l + (xn === 1 ? plotW / 2 : (i / (xn - 1)) * plotW);
  const yPos = (y) => pad.t + plotH - ((y - yMin) / (yMax - yMin)) * plotH;
  const fmtY = formatY ?? ((v) => String(v));

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Inter, Avenir Next, Avenir, Helvetica, Arial, sans-serif" font-size="13">`,
  );
  parts.push(`<rect width="${width}" height="${height}" fill="#fbfdff"/>`);
  parts.push(
    `<text x="${width / 2}" y="36" font-size="22" font-weight="700" text-anchor="middle" fill="#111">${svgEscape(title)}</text>`,
  );
  if (subtitle) {
    parts.push(
      `<text x="${width / 2}" y="58" font-size="12" text-anchor="middle" fill="#526071">${svgEscape(subtitle)}</text>`,
    );
  }

  // Horizontal gridlines & Y ticks
  for (const t of yTicks) {
    const y = yPos(t);
    parts.push(`<line x1="${pad.l}" y1="${y}" x2="${pad.l + plotW}" y2="${y}" stroke="#e6edf5"/>`);
    parts.push(
      `<text x="${pad.l - 10}" y="${y + 4}" text-anchor="end" fill="#4b5563">${svgEscape(fmtY(t))}</text>`,
    );
  }

  // X ticks & labels
  for (let i = 0; i < xn; i++) {
    const x = xPos(i);
    parts.push(`<line x1="${x}" y1="${pad.t + plotH}" x2="${x}" y2="${pad.t + plotH + 4}" stroke="#6b7280"/>`);
    parts.push(
      `<text x="${x}" y="${pad.t + plotH + 26}" text-anchor="middle" fill="#4b5563">${svgEscape(xLabels[i])}</text>`,
    );
  }

  // Axes
  parts.push(`<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + plotH}" stroke="#1f2937" stroke-width="1.4"/>`);
  parts.push(`<line x1="${pad.l}" y1="${pad.t + plotH}" x2="${pad.l + plotW}" y2="${pad.t + plotH}" stroke="#1f2937" stroke-width="1.4"/>`);

  // Axis labels
  parts.push(
    `<text x="${pad.l + plotW / 2}" y="${height - 28}" text-anchor="middle" fill="#111827" font-size="14" font-weight="600">${svgEscape(xLabel)}</text>`,
  );
  parts.push(
    `<text transform="translate(34, ${pad.t + plotH / 2}) rotate(-90)" text-anchor="middle" fill="#111827" font-size="14" font-weight="600">${svgEscape(yLabel)}</text>`,
  );

  // Series lines & markers
  series.forEach((s, idx) => {
    const color = s.color || COLORS[idx % COLORS.length];
    const upper = s.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.xi).toFixed(1)} ${yPos(p.y + (p.sd ?? 0)).toFixed(1)}`)
      .join(' ');
    const lower = s.points
      .slice()
      .reverse()
      .map((p) => `L ${xPos(p.xi).toFixed(1)} ${yPos(Math.max(yMin, p.y - (p.sd ?? 0))).toFixed(1)}`)
      .join(' ');
    parts.push(`<path d="${upper} ${lower} Z" fill="${color}" opacity="0.12" stroke="none"/>`);

    const d = s.points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.xi).toFixed(1)} ${yPos(p.y).toFixed(1)}`)
      .join(' ');
    parts.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`);
    for (const p of s.points) {
      const x = xPos(p.xi).toFixed(1);
      const y = yPos(p.y).toFixed(1);
      const low = yPos(Math.max(0, p.y - (p.sd ?? 0))).toFixed(1);
      const high = yPos(p.y + (p.sd ?? 0)).toFixed(1);
      if (Array.isArray(p.samples) && p.samples.length > 0) {
        const jitterSpan = Math.min(18, 6 + p.samples.length * 1.5);
        p.samples.forEach((sample, sampleIndex) => {
          const jitter = (sampleIndex / Math.max(1, p.samples.length - 1) - 0.5) * jitterSpan;
          parts.push(
            `<circle cx="${(Number(x) + jitter).toFixed(1)}" cy="${yPos(sample).toFixed(1)}" r="2.1" fill="${color}" opacity="0.22"/>`,
          );
        });
      }
      if ((p.sd ?? 0) > 0) {
        parts.push(`<line x1="${x}" y1="${high}" x2="${x}" y2="${low}" stroke="${color}" stroke-width="1.5" opacity="0.8"/>`);
        parts.push(`<line x1="${(Number(x) - 6).toFixed(1)}" y1="${high}" x2="${(Number(x) + 6).toFixed(1)}" y2="${high}" stroke="${color}" stroke-width="1.5" opacity="0.8"/>`);
        parts.push(`<line x1="${(Number(x) - 6).toFixed(1)}" y1="${low}" x2="${(Number(x) + 6).toFixed(1)}" y2="${low}" stroke="${color}" stroke-width="1.5" opacity="0.8"/>`);
      }
      parts.push(`<circle cx="${x}" cy="${y}" r="4.6" fill="${color}" stroke="white" stroke-width="1.5"/>`);
    }
  });

  // Legend
  const legX = pad.l + plotW + 24;
  if (legendTitle) {
    parts.push(
      `<text x="${legX}" y="${pad.t + 4}" font-weight="700" fill="#111827">${svgEscape(legendTitle)}</text>`,
    );
  }
  series.forEach((s, i) => {
    const color = s.color || COLORS[i % COLORS.length];
    const y = pad.t + 24 + i * 22;
    parts.push(`<line x1="${legX}" y1="${y}" x2="${legX + 28}" y2="${y}" stroke="${color}" stroke-width="3" stroke-linecap="round"/>`);
    parts.push(`<circle cx="${legX + 14}" cy="${y}" r="4" fill="${color}" stroke="white" stroke-width="1.5"/>`);
    parts.push(`<text x="${legX + 38}" y="${y + 4}" fill="#111827">${svgEscape(s.name)}</text>`);
  });

  if (subtitle) {
    parts.push(
      `<text x="${pad.l}" y="${height - 18}" fill="#526071" font-size="11">${svgEscape(subtitle)}</text>`,
    );
  }

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
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Inter, Avenir Next, Avenir, Helvetica, Arial, sans-serif" font-size="13">`,
  );
  parts.push(`<rect width="${width}" height="${height}" fill="white"/>`);
  parts.push(
    `<text x="${width / 2}" y="28" font-family="Inter, Avenir Next, Avenir, Helvetica, Arial, sans-serif" font-size="18" font-weight="700" text-anchor="middle" fill="#111827">${svgEscape(title)}</text>`,
  );
  if (subtitle) {
    parts.push(
      `<text x="${width / 2}" y="48" font-family="Inter, Avenir Next, Avenir, Helvetica, Arial, sans-serif" font-size="11" text-anchor="middle" fill="#6b7280">${svgEscape(subtitle)}</text>`,
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
      'Sequence length (bp)',
      'Record count',
      'Duration, mean ± sd (ms)',
      'Heap delta, mean ± sd (bytes)',
      'RSS delta, mean ± sd (bytes)',
      'Records parsed, mean ± sd',
      'Features parsed, mean ± sd',
    ];
    const aligns = ['right', 'right', 'right', 'right', 'right', 'right', 'right'];
    const rows = sorted.map((r) => [
      r.seqLength_bp.toLocaleString(),
      r.numRecords.toString(),
      formatMeanStd(r.durationMs),
      formatMeanStd(r.heapDeltaBytes, 0),
      formatMeanStd(r.rssDeltaBytes, 0),
      formatMeanStd(r.recordsParsed, 0),
      formatMeanStd(r.featuresParsed, 0),
    ]);
    writeFileSync(
      join(outDir, 'summary-table.svg'),
      tableSvg({ title: 'Benchmark summary', subtitle, headers, rows, colAligns: aligns }),
    );
  }

  // ── Pivot tables (seqLength × numRecords) ──────────────────────────────────
  const writePivot = (title, field, formatter, outName) => {
    const headers = ['Sequence length (bp)', ...recordCounts.map((n) => `${n} records`)];
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
  writePivot('Mean duration (ms) by sequence length and record count', 'durationMs', (v) => formatMeanStd(v), 'pivot-duration.svg');
  writePivot('Mean heap delta (bytes) by sequence length and record count', 'heapDeltaBytes', (v) => formatMeanStd(v, 0), 'pivot-heap.svg');
  writePivot('Mean RSS delta (bytes) by sequence length and record count', 'rssDeltaBytes', (v) => formatMeanStd(v, 0), 'pivot-rss.svg');

  // ── Line charts ────────────────────────────────────────────────────────────
  // groupBy='seqLength_bp': one line per sequence length, x-axis = numRecords
  // groupBy='numRecords'  : one line per record count,  x-axis = seqLength_bp
  const buildSeries = (groupBy) => {
    const groupVals = groupBy === 'seqLength_bp' ? seqLengths : recordCounts;
    const xVals = groupBy === 'seqLength_bp' ? recordCounts : seqLengths;
    return (yField) =>
      groupVals.map((g, i) => ({
        name: groupBy === 'seqLength_bp' ? `${g.toLocaleString()} base pairs` : `${g} records`,
        color: COLORS[i % COLORS.length],
        points: xVals.map((xv, xi) => {
          const key = groupBy === 'seqLength_bp' ? `${g}|${xv}` : `${xv}|${g}`;
          const r = lookup.get(key);
          const metric = r ? r[yField] : { mean: 0, stderr: 0 };
          return { xi, y: metric.mean, sd: metric.stderr };
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
      title: 'Mean parse duration by record count',
      subtitle: 'Shaded band = mean ± 1 standard error; faint dots = individual replicates.',
      xLabel: 'Record count',
      yLabel: 'Mean duration (ms)',
      xLabels: recordCounts.map(String),
      series: byLen('durationMs'),
      legendTitle: 'Sequence length (base pairs)',
      formatY: fmtMs,
    }),
  );
  writeFileSync(
    join(outDir, 'duration-vs-seqlength.svg'),
    lineChart({
      title: 'Mean parse duration by sequence length',
      subtitle: 'Shaded band = mean ± 1 standard error; faint dots = individual replicates.',
      xLabel: 'Sequence length (base pairs)',
      yLabel: 'Mean duration (ms)',
      xLabels: seqLengths.map((n) => n.toLocaleString()),
      series: byRec('durationMs'),
      legendTitle: 'Record count',
      formatY: fmtMs,
    }),
  );
  writeFileSync(
    join(outDir, 'heap-vs-records.svg'),
    lineChart({
      title: 'Mean heap delta by record count',
      subtitle: 'Shaded band = mean ± 1 standard error; faint dots = individual replicates.',
      xLabel: 'Record count',
      yLabel: 'Mean heap delta (MB)',
      xLabels: recordCounts.map(String),
      series: byLen('heapDeltaBytes'),
      legendTitle: 'Sequence length (base pairs)',
      formatY: fmtMB,
    }),
  );
  writeFileSync(
    join(outDir, 'heap-vs-seqlength.svg'),
    lineChart({
      title: 'Mean heap delta by sequence length',
      subtitle: 'Shaded band = mean ± 1 standard error; faint dots = individual replicates.',
      xLabel: 'Sequence length (base pairs)',
      yLabel: 'Mean heap delta (MB)',
      xLabels: seqLengths.map((n) => n.toLocaleString()),
      series: byRec('heapDeltaBytes'),
      legendTitle: 'Record count',
      formatY: fmtMB,
    }),
  );

  process.stdout.write(`visualize: wrote 8 SVGs to ${outDir}\n`);
}

// CLI entry: `node bench/visualize.mjs`
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  generatePlots();
}
