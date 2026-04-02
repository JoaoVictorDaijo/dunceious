/**
 * Reads benchmark/results/benchmark.json and appends a markdown summary
 * table to $GITHUB_STEP_SUMMARY so the results are visible directly in the
 * GitHub Actions check view.
 *
 * Called by the "Summarise benchmark results" step in .github/workflows/ci.yml.
 * Safe to run outside CI: exits 0 without writing anything when the results
 * file or GITHUB_STEP_SUMMARY env var is absent.
 */

import { readFileSync, appendFileSync, existsSync } from 'fs';

const RESULTS_PATH = 'benchmark/results/benchmark.json';
const SUMMARY_PATH = process.env.GITHUB_STEP_SUMMARY;

if (!existsSync(RESULTS_PATH) || !SUMMARY_PATH) process.exit(0);

let data;
try {
  data = JSON.parse(readFileSync(RESULTS_PATH, 'utf8'));
} catch (err) {
  process.stderr.write(`summarize.mjs: failed to parse ${RESULTS_PATH}: ${err.message}\n`);
  process.exit(1);
}
const rows = data.results ?? [];

const header = [
  '## 📊 Benchmark Results',
  '',
  `_Generated at: ${data.generatedAt}_`,
  '',
  '| seqLength_bp | numRecords | durationMs | heapΔ bytes | rssΔ bytes | records | features |',
  '|---:|---:|---:|---:|---:|---:|---:|',
];

const tableRows = rows.map(
  (r) =>
    `| ${r.seqLength_bp.toLocaleString()} | ${r.numRecords} | ${r.durationMs.toFixed(2)} | ${r.heapDeltaBytes.toLocaleString()} | ${r.rssDeltaBytes.toLocaleString()} | ${r.recordsParsed} | ${r.featuresParsed} |`,
);

appendFileSync(SUMMARY_PATH, [...header, ...tableRows, ''].join('\n'));
