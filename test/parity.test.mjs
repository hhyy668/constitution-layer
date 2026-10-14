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

import { FOUNDATION_FILES, clearFoundationCache, renderFoundation } from '../lib/foundation.js';

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
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'parity-'));
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

/** name 里的路径要与 fixture 建出来的目录对齐，所以 cwd/expect 都是函数或原值。 */
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
];

for (const item of CASES) {
  test(`两套实现判定一致：${item.name}`, () => {
    clearFoundationCache();
    const root = tempDir();
    item.setup(root);
    const cwd = item.cwd(root);
    const expected = item.expect(root);

    const fromDsh = verdictOf(renderFoundation(cwd));
    const fromHook = verdictOf(runHook(cwd));

    // 先各自对上预期 —— 否则「两边一起错」也会被当成一致而蒙混过关
    assert.deepEqual(fromDsh, expected, `DSH 侧判定不符：${JSON.stringify(fromDsh)}`);
    assert.deepEqual(fromHook, expected, `钩子侧判定不符：${JSON.stringify(fromHook)}`);

    // 再断言两边相同
    assert.deepEqual(fromHook, fromDsh, '两套实现的判定必须完全一致');
  });
}
