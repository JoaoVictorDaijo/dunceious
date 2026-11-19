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

import { expect, it } from 'vitest';
import { exportToGenBank } from '@/src/core/genbank';
import { exportToGff3 } from '@/src/core/formats/gff3';
import { describeSelectionLoss } from '@/src/core/exportReport';
import { featureParts } from '@/src/domain/bio/featureParts';
import { sliceRecordsBySelection } from '@/src/domain/bio/intervals';
import { handleBioMessage } from '@/src/workers/handlers/bio';
import { computeRecordLayouts } from '@/src/app/viewer/layout';
import { parseProject, serializeProject } from '../projectFile';
import { featureFocusTarget } from '../focusTarget';

function genPept(name: string, bonds: string): string {
  return `LOCUS       ${name} 6 aa linear
FEATURES             Location/Qualifiers
${bonds}ORIGIN
        1 mcaavc
//
`;
}

function openGenPept(content: string) {
  return handleBioMessage({ type: 'PARSE_GENBANK', filename: 'bonds.gp', content });
}

it.each([
  'bond(<2,6)',
  'bond(<2,>6)',
  'bond(2,ABC123.1:6)',
  'bond(ABC123.1:2,6)',
  'join(bond(2,6),3)',
  'order(bond(2,6),3)',
])('keeps %s verbatim through GenPept and project reopen without placing it', location => {
  const line = `     Bond            ${location}\n`;
  const imported = openGenPept(genPept('PROT', line + '                     /label="Cross-link"\n'));
  const accepted = {
    type: 'PARSE_SUCCESS',
    findings: [{ tier: 'warning', record: { name: 'PROT', index: 1 },
      message: `Protein bonds kept without drawing: Bond Cross-link (${location}).` }],
  };
  expect(imported).toMatchObject(accepted);
  if (imported.type !== 'PARSE_SUCCESS') throw new Error('Expected the protein to open');
  const serialized = serializeProject({ records: imported.records, featureColors: {}, showAnnotations: true,
    showTranslation: true, showConservation: false });
  expect(JSON.parse(serialized).records[0].features[0].locationString).toBe(location);
  const project = parseProject(serialized, () => {});
  if (!project.ok) throw new Error(project.message);
  const { text } = exportToGenBank(imported.records);
  expect(text).toContain(line);
  const reopened = openGenPept(text);
  expect(reopened).toMatchObject(accepted);
  if (reopened.type !== 'PARSE_SUCCESS') throw new Error('Expected the GenPept export to reopen');

  for (const [record] of [imported.records, project.project.records, reopened.records]) {
    expect(record.features).toMatchObject([{ locationString: location, segments: [] }]);
    const [bond] = record.features;
    expect(featureParts(bond, { length: 6 })).toEqual([]);
    expect(computeRecordLayouts([record], { showAnnotations: true, translationVisible: false, showTracks: false })[0].placements).toEqual([]);
    expect(featureFocusTarget(record, bond)).toBeNull();
  }
  const { records, losses } = sliceRecordsBySelection(imported.records, 0, 6);
  expect(records[0].features).toEqual([]);
  expect(losses.map(describeSelectionLoss)).toEqual([
    `PROT: Bond Cross-link: Bond ${location} omitted because every endpoint must be selected`,
  ]);
});

it('names every undrawn bond in one import notice per record', () => {
  const content = genPept('FIRST', '     Bond            bond(<2,6)\n     Bond            bond(ABC123.1:2,6)\n')
    + genPept('SECOND', '     Bond            order(bond(2,6),3)\n');
  expect(openGenPept(content)).toMatchObject({
    type: 'PARSE_SUCCESS',
    findings: [
      { tier: 'warning', record: { name: 'FIRST', index: 1 },
        message: 'Protein bonds kept without drawing: Bond (bond(<2,6)), Bond (bond(ABC123.1:2,6)).' },
      { tier: 'warning', record: { name: 'SECOND', index: 2 },
        message: 'Protein bonds kept without drawing: Bond (order(bond(2,6),3)).' },
    ],
  });
});

it('reports the omitted bond in GFF3 without exporting a site at coordinate zero', () => {
  const imported = openGenPept(genPept('PROT', '     Bond            bond(ABC123.1:2,6)\n                     /label="Cross-link"\n'));
  if (imported.type !== 'PARSE_SUCCESS') throw new Error('Expected the protein to open');
  const { text, report } = exportToGff3(imported.records);
  expect(text.split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split('\t').slice(0, 5)))
    .toEqual([['PROT', '.', 'region', '1', '6']]);
  expect(report.gff3FeaturesOmitted).toEqual([
    { reason: 'PROT: Bond Cross-link (bond(ABC123.1:2,6)) omitted because the bond position is unavailable', edited: false },
  ]);
});

it('names the geometry conflict when reopening a legacy project with a fabricated bond anchor', () => {
  const saved = serializeProject({ records: [{ id: 'PROT', name: 'PROT', moleculeType: 'protein', sequence: 'MCAAVC',
    features: [{ type: 'Bond', name: 'Bond', locationString: 'bond(ABC123.1:2,6)', strand: 1,
      start: 122, end: 123, segments: [{ start: 122, end: 123 }] }] }],
    featureColors: {}, showAnnotations: true, showTranslation: true, showConservation: false });
  expect(parseProject(saved, () => {})).toEqual({
    ok: false, message: 'Feature Bond location "bond(ABC123.1:2,6)" disagrees with its stored geometry.',
  });
});
