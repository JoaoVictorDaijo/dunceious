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


// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { scaleLinear } from 'd3';
import { render, installCanvasRecorder } from '@/src/app/testing/renderHarness';
import { displayTracks } from '@/src/domain/bio/quantitativeTracks';
import { QuantitativeTrack } from './QuantitativeTrack';
import { Row } from '../Row';
import { computeRecordLayouts } from '../layout';

it('keeps the empty-track message', () => {
  const recorder=installCanvasRecorder();
  const display=displayTracks({id:'r',name:'r',sequence:'ACGT',features:[],tracks:[{id:'q',name:'q',data:[]}]})[0];
  render(<QuantitativeTrack display={display} viewportWidth={100} height={80} xScale={scaleLinear().domain([0,4]).range([0,100])} scrollX={0} minVal={0} maxVal={1} />);
  expect(recorder.texts()).toContain('No track data available');
});
it('shows the unplaced count and explains reasons in the track header', () => {
  installCanvasRecorder();
  const record={id:'r',name:'r',sequence:'ACGT',features:[],tracks:[{id:'q',name:'Coverage',data:[{start:0,end:1,value:2},{start:1,end:2,value:3},{start:2,end:99,value:7}]}]};
  const layout=computeRecordLayouts([record],{showAnnotations:false,translationVisible:false,showTracks:true})[0];
  const view=render(<Row index={0} style={{}} data={{recordLayouts:[layout],alignmentLength:4,scrollX:0,zoomLevel:8,viewportWidth:100,persistentSelection:null,showAnnotations:false,showTranslation:false,searchResultsByRecord:{},searchResults:[],currentSearchIdx:-1,onSelectionChange:()=>{},onContextMenu:()=>{},onViewDetails:()=>{},setTooltip:()=>{},showConservation:false,conservationScores:[],quantValueRanges:{q:{min:0,max:3}},showTracks:true,basesOpenness:0,focusedRegion:null,comparison:null}} />);
  expect(view.getByText(/1 of 3 intervals not drawn/).getAttribute('data-tip')).toBe('3: out-of-range');
});

it('clips each top stroke to its own half-open envelope with no vertical connector', () => {
  const calls: { method: string; args: number[] }[] = [];
  const ctx = new Proxy({}, { get: (_target, method: string) => (...args: number[]) => calls.push({ method, args }), set: () => true });
  const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as CanvasRenderingContext2D);
  const display=displayTracks({id:'r',name:'r',sequence:'A'.repeat(20),features:[],tracks:[{id:'q',name:'q',data:[{start:0,end:10,value:2},{start:10,end:20,value:5}]}]})[0];
  render(<QuantitativeTrack display={display} viewportWidth={20} height={80} xScale={scaleLinear().domain([0,20]).range([0,20])} scrollX={0} minVal={0} maxVal={5} />);
  const clips = calls.flatMap((call,i) => call.method === 'clip' ? [calls[i-1]] : []);
  expect(clips).toEqual([{method:'rect',args:[0,0,20,80]},{method:'rect',args:[0,0,10,80]},{method:'rect',args:[10,0,10,80]}]);
  const levels = calls.filter(call=>call.method === 'lineTo').slice(-2);
  expect(levels).toEqual([{method:'lineTo',args:[10,47]},{method:'lineTo',args:[20,5]}]);
  spy.mockRestore();
});
