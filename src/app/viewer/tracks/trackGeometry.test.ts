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
import { displayTracks, pickTrackData } from '@/src/domain/bio/quantitativeTracks';
import { trackGeometry } from './trackGeometry';

function display(data: {start:number;end:number;value:number}[], sequence = 'A'.repeat(100), alignedSequence?: string) {
  return displayTracks({ id:'r', name:'r', sequence, alignedSequence, features:[], tracks:[{id:'q',name:'q',data}] })[0];
}
it('masks only residue columns and keeps omitted support empty', () => {
  const d = display([{start:0,end:4,value:2}], 'ACGT', 'AC--GT');
  expect(trackGeometry(d, x => x, [0,6]).mask).toEqual([{x:0,width:2},{x:4,width:2}]);
  const g = trackGeometry(display([{start:0,end:10,value:2},{start:90,end:100,value:8}]), x=>x, [0,100]);
  expect(g.shapes).toEqual([{x:0,width:10,index:0,value:2},{x:90,width:10,index:1,value:8}]);
});
it('keeps adjacent levels separate and subpixel support exact', () => {
  const data = [{start:0,end:10,value:2},{start:10,end:20,value:5}];
  expect(trackGeometry(display(data),x=>x,[0,100]).shapes).toEqual([{x:0,width:10,index:0,value:2},{x:10,width:10,index:1,value:5}]);
  const shapes=trackGeometry(display([{start:0,end:1,value:2},{start:2,end:3,value:8}]),x=>x*0.1,[0,100]).shapes;
  expect(shapes[0].width).toBeCloseTo(0.1); expect(shapes[1].width).toBeCloseTo(0.1);
  expect(shapes[0].x+shapes[0].width).toBeLessThan(shapes[1].x);
});
it('finds every nested interval in sorted pick order and excludes ends', () => {
  const nested=display([{start:10,end:20,value:2},{start:0,end:100,value:8}]);
  expect(pickTrackData(nested,15).map(p=>p.source.index)).toEqual([1,0]);
  expect(pickTrackData(nested,50).map(p=>p.source.index)).toEqual([1]);
  const adjacent=display([{start:0,end:10,value:2},{start:10,end:20,value:5}]);
  expect(pickTrackData(adjacent,10).map(p=>p.source.index)).toEqual([1]);
  expect(pickTrackData(adjacent,20)).toEqual([]);
  expect(pickTrackData(display([{start:0,end:4,value:2}], 'ACGT','AC--GT'),2)).toEqual([]);
});

it('keeps source interval order when a gap makes picked pieces share their start', () => {
  const aligned = 'A'.repeat(10) + '--' + 'A'.repeat(90);
  const d = display([{start:5,end:15,value:2},{start:0,end:100,value:8}], 'A'.repeat(100), aligned);
  const columns: number[] = [];
  for (let column=0;column<aligned.length;column++) if (aligned[column] !== '-') columns.push(column);
  expect(trackGeometry(d,x=>x,[0,aligned.length]).shapes.map(shape=>shape.index)).toEqual([0,1]);
  const pieces=pickTrackData(d,columns[10]);
  expect(pieces.map(piece=>piece.source.index)).toEqual([1,0]);
  expect(pieces.map(piece=>({start:piece.start,end:piece.end}))).toEqual([
    {start:columns[10],end:columns[99]+1}, {start:columns[10],end:columns[14]+1},
  ]);
});

it('visits only visible residue runs after seeking past an offscreen prefix', () => {
  const d = display([{start:1023,end:1024,value:7}], 'A'.repeat(1024), 'A-'.repeat(1024));
  let visited = 0;
  d.runs = new Proxy(d.runs, { get(target, property, receiver) {
    if (typeof property === 'string' && /^\d+$/.test(property)) visited++;
    return Reflect.get(target, property, receiver);
  } });
  expect(trackGeometry(d,x=>x,[2046,2048]).mask).toEqual([{x:2046,width:1}]);
  expect(visited).toBeLessThan(100);
});
