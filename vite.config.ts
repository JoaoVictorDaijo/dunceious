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
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";

const ROOT = fileURLToPath(new URL(".", import.meta.url));

// Coverage floors only rise. Per-file floors leave about three points
// for v8 jitter and defensive branches; global floors still cover every
// included file, including those with an individual floor.
const COVERAGE_THRESHOLDS = {
  lines: 95,
  branches: 87,
  functions: 94,
  statements: 93,
  "src/app/viewer/cds.ts": {
    lines: 97,
    branches: 92,
    functions: 97,
    statements: 95,
  },
  "src/app/viewer/coordinates.ts": {
    lines: 97,
    branches: 84,
    functions: 97,
    statements: 84,
  },
  "src/app/viewer/colors.ts": {
    lines: 97,
    branches: 97,
    functions: 97,
    statements: 97,
  },
  "src/app/viewer/annotationPresentation.ts": {
    lines: 97,
    branches: 85,
    functions: 88,
    statements: 92,
  },
  "src/app/lib/ebiClient.ts": {
    lines: 97,
    branches: 90,
    functions: 97,
    statements: 94,
  },
  "src/app/hooks/useBioWorker.ts": {
    lines: 90,
    branches: 70,
    functions: 97,
    statements: 89,
  },
  "src/app/hooks/useSearchWorker.ts": {
    lines: 67,
    branches: 45,
    functions: 80,
    statements: 64,
  },
  "src/app/hooks/useRemoteAlignment.ts": {
    lines: 97,
    branches: 84,
    functions: 97,
    statements: 96,
  },
  "src/app/App.tsx": {
    lines: 85,
    branches: 70,
    functions: 70,
    statements: 80,
  },
  "src/app/hooks/useFileHandlers.ts": {
    lines: 77,
    branches: 53,
    functions: 77,
    statements: 73,
  },
  "src/app/hooks/useFeatureManager.ts": {
    lines: 97,
    branches: 84,
    functions: 97,
    statements: 95,
  },
  "src/app/hooks/useHubState.ts": {
    lines: 97,
    branches: 94,
    functions: 97,
    statements: 97,
  },
};

export default defineConfig(() => {
  // Single source of truth for the app version: read from package.json and
  // injected as the `__APP_VERSION__` global so every UI/provenance string reads
  // one value. Applies to the build and (via this shared config) the tests.
  // Bump with `npm version`.
  const pkg = JSON.parse(
    readFileSync(path.resolve(ROOT, "package.json"), "utf-8"),
  ) as { version: string };
  return {
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    // Proposal: Tailwind 4 requires modern CSS support; see docs/tailwind-4-migration.md.
    // These reduced browser targets require owner approval before merge.
    build: {
      target: ['es2020', 'chrome111', 'edge111', 'firefox128', 'safari16.4'],
      cssTarget: ['chrome111', 'edge111', 'firefox128', 'safari16.4'],
    },
    server: {
      port: 3000,
      host: "0.0.0.0",
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(ROOT, "."),
      },
    },
    test: {
      environment: "node",
      // Whole-app and whole-showroom UI tests take 3–6 s when CI workers share the
      // CPU, past Vitest's 5 s default; 15 s still fails a hung test quickly.
      testTimeout: 15_000,
      exclude: [
        "perf/**",
        "e2e/**",
        "bench/**",
        "**/node_modules/**",
      ],
      coverage: {
        provider: "v8" as const,
        include: [
          "src/core/**",
          "src/workers/handlers/**",
          "src/app/recordRemoval.ts",
          "src/app/viewer/layout.ts",
          "src/app/logic/**",
          "src/domain/**",
          "src/app/viewer/cds.ts",
          "src/app/viewer/coordinates.ts",
          "src/app/viewer/colors.ts",
          "src/app/viewer/annotationPresentation.ts",
          "src/app/lib/ebiClient.ts",
          "src/app/hooks/useBioWorker.ts",
          "src/app/hooks/useSearchWorker.ts",
          "src/app/hooks/useRemoteAlignment.ts",
          "src/app/App.tsx",
          "src/app/hooks/useFileHandlers.ts",
          "src/app/hooks/useFeatureManager.ts",
          "src/app/hooks/useHubState.ts",
        ],
        exclude: [
          "**/__tests__/**",
          "**/*.test.ts",
          "**/index.ts",
          "**/types.ts",
        ],
        reporter: ["text", "text-summary", "json-summary"],
        thresholds: COVERAGE_THRESHOLDS,
      },
    },
  };
});
