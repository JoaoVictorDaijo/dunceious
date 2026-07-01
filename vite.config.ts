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

import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig(() => {
  return {
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    test: {
      environment: "node",
      exclude: [
        "perf/**",
        "bench/**",
        "**/node_modules/**",
      ],
      coverage: {
        provider: "v8" as const,
        all: true,
        include: [
          "services/**",
          "src/app/recordRemoval.ts",
          "src/app/logic/**",
          "src/domain/**",
        ],
        exclude: [
          "**/__tests__/**",
          "**/*.test.ts",
          "**/index.ts",
          "**/types.ts",
        ],
        reporter: ["text", "text-summary", "json-summary"],
        // Thresholds are a RATCHET: set a few points below achieved (lines
        // 98.3 / branches 89.4 / functions 97.5 / statements 96.5 as of Phase 2A
        // PR2, after the app-state extraction added src/app/logic/** to scope) so
        // normal v8 jitter and hard-to-hit defensive branches don't break CI.
        // Raise (never lower); the ~4pt buffer here already holds for PR2.
        thresholds: {
          lines: 94,
          branches: 85,
          functions: 93,
          statements: 92,
        },
      },
    },
  };
});
