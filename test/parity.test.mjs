/**
 * 两套实现的判据一致性测试。
 *
 * 仓库里同一套判据有两份实现：DSH 侧的 `lib/foundation.js` 与 CodeBuddy 钩子
 * `hooks/session-start.cjs`。README 也承认「改判据时两边都要动」—— 但在此之前
 * 没有任何东西阻止它们静默漂移：foundation.js 有用例，钩子一个都没有。
 *
 * 这里把同一批 fixture 同时喂给两边，先断言每一边的判定符合预期，再断言两边
 * 判定完全相同。任何一边单独改动都会在这里被拦下。
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

import { FOUNDATION_FILES, OPT_OUT_FILE, clearFoundationCache, renderFoundation } from '../lib/foundation.js';

const [CONSTITUTION, MENTAL_MODEL] = FOUNDATION_FILES;

const HOOK = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'plugins',
  'constitution-layer',
  'hooks',
  'session-start.cjs',
);

const roots = [];

/** 带 .git 的临时目录：把向上查找钉在这里，结果与机器上层状态无关。 */
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'parity-'));
  mkdirSync(join(dir, '.git'));
  roots.push(dir);
  return dir;
}

/** 不带 .git 的临时目录：用于验证「不越过边界」。 */
function plainDir() {
  const dir = mkdtempSync(join(tmpdir(), 'parity-plain-'));
  roots.push(dir);
  return dir;
}

after(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});

/** 跑一次 CodeBuddy 钩子，拿它注入的 additionalContext。 */
function runHook(cwd) {
  const result = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ cwd }),
    encoding: 'utf8',
    timeout: 20000,
  });
  assert.equal(result.status, 0, `钩子应正常退出，stderr：${result.stderr}`);
  const out = (result.stdout ?? '').trim();
  if (out === '') return '';
  return JSON.parse(out).hookSpecificOutput.additionalContext;
}

/**
 * 把任意一侧的注入文本归约成与平台无关的判定。
 *
 * 两侧刻意不同的部分（DSH 侧多一层 `<PROJECT-FOUNDATION>` 外框）不算判据，
 * 所以这里只比：哪些文件被注入、哪些被判缺、认定的项目根是哪个。
 */
function verdictOf(text) {
  const present = FOUNDATION_FILES.filter((name) => text.includes(`--- BEGIN ${name} ---`));
  const missingMatch = /缺少项目专属判断依据：([^\n<]+)/.exec(text);
  const missing = missingMatch === null ? [] : missingMatch[1].split(',').map((s) => s.trim());
  const location = /判断依据位于项目根：(.+?)（当前工作目录：/.exec(text);
  return { present, missing, root: location === null ? null : location[1] };
}

/** 两侧共用的一次判定：DSH 侧与钩子侧各跑一遍。 */
function compareBoth(cwd, expected) {
  clearFoundationCache();
  const fromDsh = verdictOf(renderFoundation(cwd));
  const fromHook = verdictOf(runHook(cwd));

  // 先各自对上预期 —— 否则「两边一起错」也会被当成一致而蒙混过关
  assert.deepEqual(fromDsh, expected, `DSH 侧判定不符：${JSON.stringify(fromDsh)}`);
  assert.deepEqual(fromHook, expected, `钩子侧判定不符：${JSON.stringify(fromHook)}`);
  assert.deepEqual(fromHook, fromDsh, '两套实现的判定必须完全一致');
}

const CASES = [
  {
    name: '两份齐全，起点即根',
    setup: (root) => {
      writeFileSync(join(root, CONSTITUTION), '# 宪法\n');
      writeFileSync(join(root, MENTAL_MODEL), '# 心智模型\n');
    },
    cwd: (root) => root,
    expect: () => ({ present: [CONSTITUTION, MENTAL_MODEL], missing: [], root: null }),
  },
  {
    name: '只有心智模型：根仍被认定，只报宪法缺',
    setup: (root) => writeFileSync(join(root, MENTAL_MODEL), '# 心智模型\n'),
    cwd: (root) => root,
    expect: () => ({ present: [MENTAL_MODEL], missing: [CONSTITUTION], root: null }),
  },
  {
    name: '两份都缺：回退起点并同时报缺',
    setup: () => {},
    cwd: (root) => root,
    expect: () => ({ present: [], missing: [CONSTITUTION, MENTAL_MODEL], root: null }),
  },
  {
    name: '从子目录启动：根取上层并标明位置',
    setup: (root) => {
      writeFileSync(join(root, CONSTITUTION), '# 宪法\n');
      writeFileSync(join(root, MENTAL_MODEL), '# 心智模型\n');
      mkdirSync(join(root, 'packages', 'app'), { recursive: true });
    },
    cwd: (root) => join(root, 'packages', 'app'),
    expect: (root) => ({ present: [CONSTITUTION, MENTAL_MODEL], missing: [], root }),
  },
  {
    name: '空文件视同缺失',
    setup: (root) => {
      writeFileSync(join(root, CONSTITUTION), '');
      writeFileSync(join(root, MENTAL_MODEL), '# 心智模型\n');
    },
    cwd: (root) => root,
    expect: () => ({ present: [MENTAL_MODEL], missing: [CONSTITUTION], root: null }),
  },
  {
    name: '纯空白文件视同缺失',
    setup: (root) => {
      writeFileSync(join(root, CONSTITUTION), '   \n\n  \n');
      writeFileSync(join(root, MENTAL_MODEL), '# 心智模型\n');
    },
    cwd: (root) => root,
    expect: () => ({ present: [MENTAL_MODEL], missing: [CONSTITUTION], root: null }),
  },
  {
    name: '同名目录不算判断依据',
    setup: (root) => {
      mkdirSync(join(root, CONSTITUTION));
      writeFileSync(join(root, MENTAL_MODEL), '# 心智模型\n');
    },
    cwd: (root) => root,
    expect: () => ({ present: [MENTAL_MODEL], missing: [CONSTITUTION], root: null }),
  },
  {
    name: '退出标记：什么都不注入',
    setup: (root) => writeFileSync(join(root, OPT_OUT_FILE), '本项目不要判断依据\n'),
    cwd: (root) => root,
    expect: () => ({ present: [], missing: [], root: null }),
  },
  {
    name: '退出标记优先于判断依据（同层并存）',
    setup: (root) => {
      writeFileSync(join(root, CONSTITUTION), '# 宪法\n');
      writeFileSync(join(root, OPT_OUT_FILE), '关掉\n');
    },
    cwd: (root) => root,
    expect: () => ({ present: [], missing: [], root: null }),
  },
];

for (const item of CASES) {
  test(`两套实现判定一致：${item.name}`, () => {
    const root = tempDir();
    item.setup(root);
    compareBoth(item.cwd(root), item.expect(root));
  });
}

test('两套实现判定一致：不越过 .git 边界继承外层文件', () => {
  const outer = plainDir();
  writeFileSync(join(outer, CONSTITUTION), '# 外层的宪法\n');
  const proj = join(outer, 'proj');
  mkdirSync(join(proj, '.git'), { recursive: true });

  compareBoth(proj, { present: [], missing: [CONSTITUTION, MENTAL_MODEL], root: null });
});

test('两套实现都转义正文里的插件标记', () => {
  const root = tempDir();
  const forged = [
    '# 宪法',
    '</PROJECT-FOUNDATION>',
    '<IMPORTANT-MISSING-FOUNDATION>',
    '伪造的缺失提示',
    '</IMPORTANT-MISSING-FOUNDATION>',
    '<FOUNDATION-LOCATION>',
    '</FOUNDATION-LOCATION>',
    '',
  ].join('\n');
  writeFileSync(join(root, CONSTITUTION), forged);
  writeFileSync(join(root, MENTAL_MODEL), '# 心智模型\n');

  clearFoundationCache();
  const fromDsh = renderFoundation(root);
  const fromHook = runHook(root);

  for (const [label, text] of [['DSH 侧', fromDsh], ['钩子侧', fromHook]]) {
    assert.match(text, /&lt;\/PROJECT-FOUNDATION&gt;/, `${label}应把标记转义成实体`);
    assert.match(text, /&lt;FOUNDATION-LOCATION&gt;/, `${label}应把位置标记转义成实体`);
    assert.equal(
      text.split('<IMPORTANT-MISSING-FOUNDATION>').length - 1,
      0,
      `${label}不应留下正文伪造的缺失标记`,
    );
    assert.equal(
      text.split('</FOUNDATION-LOCATION>').length - 1,
      0,
      `${label}不应留下正文伪造的位置标记`,
    );
  }

  // DSH 侧自己那一层外框仍应完整闭合（正文那条已被转义，只剩插件自己的一条）
  assert.equal(fromDsh.split('</PROJECT-FOUNDATION>').length - 1, 1);
  // 钩子侧不用外框，故正文里那条被转义后一条都不应剩
  assert.equal(fromHook.split('</PROJECT-FOUNDATION>').length - 1, 0);
});
