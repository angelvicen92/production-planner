import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

// Parse call expressions rather than matching dialog components or test mocks.
test('client production source contains no native browser dialog calls', async () => {
  const found: string[] = [];
  async function walk(dir: URL) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
      if (entry.isDirectory()) { await walk(url); continue; }
      if (!/\.[jt]sx?$/.test(entry.name) || /\.(test|spec|browser)\./.test(entry.name)) continue;
      const source = ts.createSourceFile(url.pathname, await readFile(url, 'utf8'), ts.ScriptTarget.Latest, true);
      const custom = new Set<string>();
      const collect = (node: ts.Node) => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isCallExpression(node.initializer) && ts.isIdentifier(node.initializer.expression) && node.initializer.expression.text === 'useConfirm') custom.add(node.name.text);
        ts.forEachChild(node, collect);
      };
      collect(source);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node)) {
          const callee = node.expression;
          const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isElementAccessExpression(callee) && callee.argumentExpression && ts.isStringLiteral(callee.argumentExpression) ? callee.argumentExpression.text : '';
          if (['alert', 'prompt', 'confirm'].includes(name) && !(ts.isIdentifier(callee) && custom.has(name))) found.push(`${url.pathname}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  await walk(new URL('../../', import.meta.url));
  assert.deepEqual(found, []);
});

test('Assisted consent preserves guards, permissions and critical exception tokens', async () => {
  const source = await readFile(new URL('../planning/assisted-planning-workspace.tsx', import.meta.url), 'utf8');
  assert.match(source, /if\(requiresAdminAuthorization\).*return;/);
  assert.match(source, /confirmation="HARD_EXCEPTIONS"/);
  assert.match(source, /confirmation="REQUIRED_DEVIATIONS"/);
  assert.match(source, /details:newViolations.map\(violationDecisionText\)/);
  assert.match(source, /before.state\?\.draftFingerprint===after.state\?\.draftFingerprint/);
  assert.match(source, /before.state\?\.validation===after.state\?\.validation/);
  assert.match(source, /pendingTimelineEdits>0\|\|!authorized.current\|\|!isAutopilotClean\(state\)/);
});
