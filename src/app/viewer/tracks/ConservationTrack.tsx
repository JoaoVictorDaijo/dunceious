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
import React, { memo, useEffect, useRef } from 'react';

export const ConservationTrack: React.FC<{
  scores: number[];
  viewportWidth: number;
  height: number;
  xScale: d3.ScaleLinear<number, number>;
  scrollX: number;
}> = memo(({ scores, viewportWidth, height, xScale, scrollX }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = viewportWidth * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, viewportWidth, height);

    const [minBP, maxBP] = xScale.domain();
    const vStart = Math.max(0, Math.floor(xScale.invert(scrollX)) - 5);
    const vEnd = Math.min(scores.length, Math.ceil(xScale.invert(scrollX + viewportWidth)) + 5);

    ctx.beginPath();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    let first = true;
    for (let j = vStart; j < vEnd; j++) {
      const score = scores[j] || 0;
      const x = xScale(j) - scrollX;
      const y = height - (score * (height - 10)) - 5;

      if (x > viewportWidth) break;
      if (x < 0 && !first) {
        ctx.lineTo(x, y);
        continue;
      }

      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    // Fill area under the line
    ctx.lineTo(xScale(vEnd - 1) - scrollX, height);
    ctx.lineTo(xScale(vStart) - scrollX, height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
    ctx.fill();

  }, [scores, viewportWidth, height, xScale, scrollX]);

  return <canvas ref={canvasRef} style={{ width: viewportWidth, height: height }} />;
});
