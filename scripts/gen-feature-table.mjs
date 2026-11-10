/*
 * Dunceious
 * Copyright (C) 2026 João Victor Daijo and Murilo Cassiano
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

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** Offline generation from checksummed INSDC 11.4 and NCBI Toolkit 2b8ccee sources. */
export function generateFeatureTable() {
  const registry = JSON.parse(readFileSync('docs/standards/sources.json', 'utf8')).documents;
  const sources = {};
  const load = file => {
    const bytes = readFileSync(`.cache/standards/${file}`);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (registry.find(doc => doc.file === file)?.sha256 !== digest) throw new Error(`Checksum mismatch: ${file}`);
    sources[file] = digest;
    return bytes.toString('utf8');
  };
  const ft = load('insdc-ft-11.4.html').replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const cpp = load('SeqFeatData.cpp').replace(/\/\/[^\n]*/g, '');
  const emitter = load('feature_item.cpp').replace(/\/\/[^\n]*/g, '');
  load('seqfeat.asn');
  const nucleotide = {};
  for (const match of ft.matchAll(/^Feature Key +([^\s]+)[ \t]*\r?\n([\s\S]*?)(?=^Feature Key |^7\.3 Appendix III)/gm)) {
    const section = match[2];
    const qualifiers = heading => {
      const body = section.match(new RegExp(`^${heading} qualifiers +([\\s\\S]*?)(?=^[A-Z][a-z]|(?![\\s\\S]))`, 'mi'))?.[1] ?? '';
      return [...new Set([...body.matchAll(/\/([a-zA-Z_][a-zA-Z_0-9]*)/g)].map(m => m[1]))].sort();
    };
    nucleotide[match[1]] = { mandatory: qualifiers('Mandatory'), optional: qualifiers('Optional') };
  }
  const nucleotideQualifiers = [...new Set([...ft.matchAll(/^Qualifier[ \t]+\/([\w]+)/gm)].map(m => m[1]))].sort();
  const qualifierNames = Object.fromEntries([...cpp.matchAll(/eQual_(\w+),\s*"([^"\n]+)"/g)].map(m => [m[1], m[2]]));
  const mandatorySection = cpp.slice(cpp.indexOf('MAKE_CONST_MAP(sx_MandatoryQuals'), cpp.indexOf('auto iter = sx_MandatoryQuals'));
  const mandatory = Object.fromEntries([...mandatorySection.matchAll(/\{eSubtype_(\w+),\s*\{([^}]+)\}/g)].map(m => [m[1], [...m[2].matchAll(/eQual_(\w+)/g)].map(q => qualifierNames[q[1]])]));
  const maps = Object.fromEntries([...cpp.matchAll(/\{ eSubtype_(\w+), \{([^}]+)\}/g)].map(m => [m[1], [...m[2].matchAll(/eQual_(\w+)/g)].map(q => qualifierNames[q[1]]).filter(Boolean).sort()]));
  const protein = {};
  for (const m of cpp.matchAll(/\{\s*"([^"\n]+)",\s*CSeqFeatData::eSubtype_(\w+)\s*\}/g)) {
    if (maps[m[2]]) protein[m[1]] = { mandatory: mandatory[m[2]] ?? [], optional: maps[m[2]] };
  }
  // The formatter names mapped protein precursors independently of the subtype name table.
  if (!emitter.includes('return "Precursor"')) throw new Error('Missing protein precursor key');
  protein.Precursor = { mandatory: mandatory.preprotein ?? [], optional: maps.preprotein };
  const mapped = new Set(Object.values(maps).flat());
  const emitted = [...emitter.matchAll(/x_FormatQual\(\s*eFQ_\w+,\s*"(\w+)"/g)].map(m => m[1]);
  emitted.push(...[...emitter.matchAll(/(?:DO_QUAL|ADD_QUAL)\(\s*(\w+)/g)].map(m => m[1]));
  const flatFileOnly = [...new Set(emitted.filter(q => q !== 'x' && !mapped.has(q)))].sort();
  const proteinQualifiers = [...new Set([...Object.values(qualifierNames), ...flatFileOnly])].sort();
  const data = { sources, nucleotide, nucleotideQualifiers, protein, proteinQualifiers, flatFileOnly };
  const header = readFileSync('src/domain/bio/types.ts', 'utf8').split('*/')[0] + '*/\n\n';
  return header + '/** INSDC 11.4; NCBI C++ Toolkit 2b8ccee. Regenerate with scripts/gen-feature-table.mjs. */\n'
    + 'export const FEATURE_TABLE = {\n' + Object.entries(data).map(([key, value]) => `  ${key}: ${JSON.stringify(value)},`).join('\n') + '\n} as const;\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const output = generateFeatureTable();
  if (process.argv.includes('--check')) {
    if (readFileSync('src/domain/bio/insdcFeatureTable.ts', 'utf8') !== output) throw new Error('Feature vocabulary differs from offline regeneration');
    console.log('Feature vocabulary matches offline regeneration');
  } else writeFileSync('src/domain/bio/insdcFeatureTable.ts', output);
}
