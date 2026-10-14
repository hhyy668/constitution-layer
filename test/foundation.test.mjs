/**
 * foundation.js 的判据测试。
 *
 * 覆盖上游钩子声明的那几条机械判据：向上找根、两份文件分别注入、
 * 缺失即报、子目录启动时标明位置。
 */

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { clearFoundationCache, findProjectRoot, renderFoundation } from '../lib/foundation.js';

/** 每个用例一个独立临时目录，避免缓存与残留互相影响。 */
const roots = [];

function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'constitution-layer-'));
  roots.push(dir);
  return dir;
}

after(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

test('两份文件都在时，按顺序注入且不报缺失', () => {
  const root = tempDir();
  writeFileSync(join(root, 'CONSTITUTION.md'), '# 宪法\n\n不向第三方发送用户数据。\n');
  writeFileSync(join(root, 'MENTAL-MODEL.md'), '# 心智模型\n\n完备 > 速度。\n');

  const text = renderFoundation(root);

  assert.match(text, /--- BEGIN CONSTITUTION\.md ---/);
  assert.match(text, /--- BEGIN MENTAL-MODEL\.md ---/);
  assert.ok(text.indexOf('BEGIN CONSTITUTION.md') < text.indexOf('BEGIN MENTAL-MODEL.md'), '宪法先于心智模型');
  assert.doesNotMatch(text, /IMPORTANT-MISSING-FOUNDATION/);
  assert.doesNotMatch(text, /FOUNDATION-LOCATION/);
  assert.match(text, /^<PROJECT-FOUNDATION>/);
  assert.match(text, /<\/PROJECT-FOUNDATION>$/);
});

test('只有心智模型时，项目根仍被认定，只报宪法缺失', () => {
  const root = tempDir();
  writeFileSync(join(root, 'MENTAL-MODEL.md'), '# 心智模型\n');

  assert.equal(findProjectRoot(root), root);
  const text = renderFoundation(root);

  assert.match(text, /缺少项目专属判断依据：CONSTITUTION\.md/);
  assert.match(text, /--- BEGIN MENTAL-MODEL\.md ---/);
});

test('两份都缺时，回退起点目录并同时报缺', () => {
  const root = tempDir();
  const text = renderFoundation(root);

  assert.equal(findProjectRoot(root), root);
  assert.match(text, /缺少项目专属判断依据：CONSTITUTION\.md, MENTAL-MODEL\.md/);
  assert.match(text, /「本次用不到」不构成跳过理由/);
});

test('从子目录启动时标明判断依据位置，且根取自上层', () => {
  const root = tempDir();
  writeFileSync(join(root, 'CONSTITUTION.md'), '# 宪法\n');
  const nested = join(root, 'packages', 'app');
  mkdirSync(nested, { recursive: true });

  const text = renderFoundation(nested);

  assert.equal(findProjectRoot(nested), root);
  assert.match(text, /<FOUNDATION-LOCATION>/);
  assert.match(text, /判断依据位于项目根/);
  assert.ok(text.indexOf('FOUNDATION-LOCATION') < text.indexOf('BEGIN CONSTITUTION.md'), '位置说明在正文之前');
});

test('正文里的 {{...}} 原样保留（section 用 interpolate:false 的原因）', () => {
  const root = tempDir();
  writeFileSync(join(root, 'CONSTITUTION.md'), '# 宪法\n\n模板示例：{{user_name}} 不得被解释为提示变量。\n');

  const text = renderFoundation(root);

  assert.match(text, /\{\{user_name\}\}/);
});

test('文件尾部空行被去掉，内容变化后重新读取', () => {
  const root = tempDir();
  const file = join(root, 'CONSTITUTION.md');
  writeFileSync(file, '# 宪法\n\n第一版\n\n\n');

  assert.match(renderFoundation(root), /第一版\n--- END CONSTITUTION\.md/);

  writeFileSync(file, '# 宪法\n\n第二版更长一些\n');
  const text = renderFoundation(root);

  assert.match(text, /第二版更长一些/);
  assert.doesNotMatch(text, /第一版/);
});

test('缓存不会跨路径串味', () => {
  clearFoundationCache();
  const a = tempDir();
  const b = tempDir();
  writeFileSync(join(a, 'CONSTITUTION.md'), '# A\n');
  writeFileSync(join(b, 'CONSTITUTION.md'), '# B\n');

  assert.match(renderFoundation(a), /# A/);
  assert.match(renderFoundation(b), /# B/);
});
