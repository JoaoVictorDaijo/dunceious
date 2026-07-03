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

import * as d3 from 'd3';
import React, { useEffect, useRef } from 'react';

export const Ruler: React.FC<{ width: number; height: number; xScale: d3.ScaleLinear<number, number>; scrollX: number; sidebarWidth: number; onJump: (pos: number) => void }> = ({ width, height, xScale, scrollX, sidebarWidth, onJump }) => {
  const gRef = useRef<SVGGElement>(null);
  
  const handleClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - sidebarWidth;
    if (x >= 0) {
      const pos = Math.floor(xScale.invert(x + scrollX));
      onJump(pos);
    }
  };

  useEffect(() => {
    if (gRef.current) {
      const axisTop = d3.axisBottom(xScale)
        .ticks(Math.max(5, Math.floor((width - sidebarWidth) / 120)))
        .tickFormat(d => d.toLocaleString())
        .tickSize(8);
      
      const g = d3.select(gRef.current);
      g.call(axisTop);
      
      // Add minor ticks
      const [min, max] = xScale.domain();
      const tickValues = xScale.ticks(Math.max(5, Math.floor((width - sidebarWidth) / 120)));
      
      g.selectAll('.minor-tick').remove();
      if (tickValues.length > 1) {
        const step = tickValues[1] - tickValues[0];
        const minorTicks: number[] = [];
        for (let i = 0; i < tickValues.length; i++) {
          for (let j = 1; j < 5; j++) {
            const val = tickValues[i] + (step / 5) * j;
            if (val <= max) minorTicks.push(val);
          }
        }
        
        g.selectAll('.minor-tick')
          .data(minorTicks)
          .enter()
          .append('line')
          .attr('class', 'minor-tick')
          .attr('x1', d => xScale(d))
          .attr('x2', d => xScale(d))
          .attr('y1', 0)
          .attr('y2', 4)
          .attr('stroke', '#cbd5e1')
          .attr('stroke-width', 1);
      }

      g.selectAll('text')
        .attr('fill', '#475569')
        .style('font-size', '9px')
        .style('font-weight', '900')
        .style('font-family', 'JetBrains Mono, monospace');
      
      g.selectAll('.domain').attr('stroke', '#94a3b8').attr('stroke-width', 1.5);
      g.selectAll('.tick line').attr('stroke', '#94a3b8').attr('stroke-width', 1.5);
    }
  }, [xScale, width, sidebarWidth]);

  return (
    <svg width={width} height={height} className="overflow-visible cursor-pointer" onClick={handleClick}>
      <g ref={gRef} transform={`translate(${sidebarWidth - scrollX}, 0)`} />
    </svg>
  );
};
