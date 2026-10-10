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

import { dirname, join, normalize } from 'node:path';
import ts from 'typescript';

type Shell = 'shared' | 'desktop' | 'mobile' | 'shell';

/** Which shells each app area may import from (static or dynamic). */
const FORBIDDEN: Record<Shell, Shell[]> = {
  shared: ['desktop', 'mobile', 'shell'],
  desktop: ['mobile', 'shell'],
  mobile: ['desktop', 'shell'],
  shell: ['desktop', 'mobile'],
};

/** The only dynamic imports allowed across the boundary: the lazy roots in ShellRoot. */
const SHELL_ROOT = 'src/app/shell/ShellRoot.tsx';
const LAZY_ROOTS = new Set(['../desktop/DesktopApp', '../mobile/MobileApp']);

function shellOf(path: string): Shell | null {
  const m = /^src\/app\/(shared|desktop|mobile|shell)\//.exec(path);
  return m ? (m[1] as Shell) : null;
}

function resolveSpecifier(from: string, spec: string): string | null {
  if (spec.startsWith('@/')) return spec.slice(2);
  if (spec.startsWith('.')) return normalize(join(dirname(from), spec)).replace(/\\/g, '/');
  return null;
}

function isLazyArgument(call: ts.CallExpression): boolean {
  const arrow = call.parent;
  if (!ts.isArrowFunction(arrow) || arrow.body !== call) return false;
  const outer = arrow.parent;
  if (!ts.isCallExpression(outer)) return false;
  const callee = outer.expression;
  if (ts.isIdentifier(callee)) return callee.text === 'lazy';
  return ts.isPropertyAccessExpression(callee) && callee.name.text === 'lazy'
    && ts.isIdentifier(callee.expression) && callee.expression.text === 'React';
}

/**
 * Checks the shared/desktop/mobile/shell import rules over static imports,
 * re-exports, type-only imports and dynamic `import()`. ESLint's
 * no-restricted-imports cannot see dynamic imports, hence this test-side check.
 */
export function checkImports(files: { path: string; source: string }[]): string[] {
  const violations: string[] = [];
  for (const file of files) {
    const from = shellOf(file.path);
    if (!from) continue;
    const sf = ts.createSourceFile(file.path, file.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const check = (spec: string, dynamic: ts.CallExpression | null) => {
      const target = resolveSpecifier(file.path, spec);
      const to = target ? shellOf(target + '/') ?? shellOf(target) : null;
      if (!to || !FORBIDDEN[from].includes(to)) return;
      const allowed = dynamic !== null && from === 'shell' && file.path === SHELL_ROOT
        && LAZY_ROOTS.has(spec) && isLazyArgument(dynamic);
      if (!allowed) violations.push(`${file.path}: ${from} may not import ${to} ('${spec}'${dynamic ? ', dynamic' : ''})`);
    };
    const visit = (node: ts.Node) => {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
        && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        check(node.moduleSpecifier.text, null);
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword
        && node.arguments.length > 0 && ts.isStringLiteral(node.arguments[0])) {
        check(node.arguments[0].text, node);
      } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
        && ts.isStringLiteral(node.argument.literal)) {
        check(node.argument.literal.text, null);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return violations;
}
