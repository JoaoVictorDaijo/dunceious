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

import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig(() => {
  // Single source of truth for the app version: read from package.json and
  // injected as the `__APP_VERSION__` global so every UI/provenance string reads
  // one value. Applies to the build and (via this shared config) the tests.
  // Bump with `npm version`.
  const pkg = JSON.parse(
    readFileSync(path.resolve(__dirname, "package.json"), "utf-8"),
  ) as { version: string };
  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
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
          "src/core/**",
          "src/workers/handlers/**",
          "src/app/recordRemoval.ts",
          "src/app/viewer/layout.ts",
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
        // 98.3 / branches 90.0 / functions 97.6 / statements 96.6 as of Phase C
        // PR1, after relocating the genbank read+write parsers into src/core) so
        // normal v8 jitter and hard-to-hit defensive branches don't break CI.
        // Raise (never lower); the ~3pt buffer holds.
        thresholds: {
          lines: 95,
          branches: 87,
          functions: 94,
          statements: 93,
        },
      },
    },
  };
});
