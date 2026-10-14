/**
 * lib/index.js 的接线测试。
 *
 * 不需要真 Cordis：用 mock ctx 验证 apply() 注册了什么形状的东西。
 * 这部分此前完全没有覆盖 —— 而这正是最容易因 API 猜测出错的地方。
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { OPT_OUT_FILE } from '../lib/foundation.js';
import { apply, name as pluginName, safeRender } from '../lib/index.js';

const roots = [];
/** 带 .git 的临时目录：把向上查找钉在这里，结果与机器上层状态无关。 */
function tempDir() {
  const d = mkdtempSync(join(tmpdir(), 'index-test-'));
  mkdirSync(join(d, '.git'));
  roots.push(d);
  return d;
}

after(() => {
  for (const d of roots) rmSync(d, { recursive: true, force: true });
});

/** 造一个够用的 mock ctx，记录注册了什么。 */
function mockCtx({ services = ['systemPrompt', 'skills'], agents } = {}) {
  const calls = { sections: [], skills: [], warnings: [], injects: [] };
  const ctx = {
    logger: { warn: (m) => calls.warnings.push(m) },
    get: (key) => (key === 'agents' ? agents : undefined),
    inject: (deps, cb) => {
      calls.injects.push(deps);
      if (!deps.every((d) => services.includes(d))) return; // 服务不存在则回调不执行
      const scope = {};
      if (deps.includes('systemPrompt')) scope.systemPrompt = { section: (def) => calls.sections.push(def) };
      if (deps.includes('skills')) scope.skills = { register: (def) => calls.skills.push(def) };
      cb(scope);
    },
  };
  return { ctx, calls };
}

test('插件名与 cordis.patch.yml 的 loader 条目一致', () => {
  assert.equal(pluginName, 'constitution-layer');
});

test('注册 prompt section：形状正确，且 interpolate 为 false', () => {
  const { ctx, calls } = mockCtx();
  apply(ctx);

  assert.equal(calls.sections.length, 1, '应注册恰好一个 section');
  const def = calls.sections[0];
  assert.equal(typeof def.name, 'string');
  assert.equal(def.name, 'constitution-layer:foundation');
  assert.equal(def.order, 100);
  assert.equal(def.interpolate, false, '必须 false —— 否则正文里的 {{...}} 会让装配抛错');
  assert.equal(typeof def.text, 'function', 'text 必须是函数，才能每次装配重读');
});

test('section 的 text() 输出项目判断依据', () => {
  const root = tempDir();
  writeFileSync(join(root, 'CONSTITUTION.md'), '# 宪法\n');
  writeFileSync(join(root, 'MENTAL-MODEL.md'), '# 心智模型\n');

  const { ctx, calls } = mockCtx({ agents: { currentInitiator: () => ({ session: { header: { cwd: root } } }) } });
  apply(ctx);

  const text = calls.sections[0].text();
  assert.match(text, /BEGIN CONSTITUTION\.md/);
  assert.match(text, /BEGIN MENTAL-MODEL\.md/);
  assert.doesNotMatch(text, /IMPORTANT-MISSING-FOUNDATION/);
  assert.equal(calls.warnings.length, 0, '正常路径不应有告警');
});

test('取不到会话 cwd 时回退并告警（不静默）', () => {
  const { ctx, calls } = mockCtx({ agents: { currentInitiator: () => ({}) } });
  apply(ctx);

  calls.sections[0].text();
  assert.equal(calls.warnings.length, 1, '回退必须留痕');
  assert.match(calls.warnings[0], /回退 process\.cwd\(\)/);
});

test('同一个实例只告警一次 —— text() 每次装配都跑，重复刷会淹掉一次性信号', () => {
  const { ctx, calls } = mockCtx({ agents: { currentInitiator: () => ({}) } });
  apply(ctx);

  for (let i = 0; i < 5; i += 1) calls.sections[0].text();
  assert.equal(calls.warnings.length, 1, '5 次装配仍只应有一条回退告警');
});

test('不同实例各自告警，互不吞掉', () => {
  const a = mockCtx({ agents: { currentInitiator: () => ({}) } });
  const b = mockCtx({ agents: { currentInitiator: () => ({}) } });
  apply(a.ctx);
  apply(b.ctx);

  a.calls.sections[0].text();
  b.calls.sections[0].text();
  assert.equal(a.calls.warnings.length, 1);
  assert.equal(b.calls.warnings.length, 1, '去重按实例，不能跨实例吞告警');
});

test('currentInitiator 抛错时不崩，同样告警', () => {
  const { ctx, calls } = mockCtx({
    agents: { currentInitiator: () => { throw new Error('no initiator'); } },
  });
  apply(ctx);

  assert.doesNotThrow(() => calls.sections[0].text());
  assert.equal(calls.warnings.length, 1);
});

test('注册技能：字段齐全，正文已去掉 frontmatter，且带 resourceBase', () => {
  const { ctx, calls } = mockCtx();
  apply(ctx);

  assert.equal(calls.skills.length, 1, '应注册恰好一个技能');
  const s = calls.skills[0];
  assert.equal(s.name, 'constitution-brainstorm');
  assert.equal(typeof s.description, 'string');
  assert.ok(s.description.length > 0);
  assert.ok(s.content.length > 0, '正文不应为空');
  assert.doesNotMatch(s.content, /^---/, '正文不应残留 frontmatter 分隔符');
  assert.equal(s.source, 'runtime');
  assert.equal(s.resourceBase.kind, 'directory');
  assert.match(s.resourceBase.path, /constitution-brainstorm$/);
});

test('服务缺失时回调不执行，插件装载不抛错', () => {
  const { ctx, calls } = mockCtx({ services: ['systemPrompt'] }); // 没有 skills
  assert.doesNotThrow(() => apply(ctx));
  assert.equal(calls.sections.length, 1);
  assert.equal(calls.skills.length, 0);
});

test('渲染抛错时降级为空串并告警 —— 装配绝不能因为这段建议文本而失败', () => {
  // 给足 agents，让 cwd 正常取到：这样唯一可能的告警就只剩渲染失败那一条。
  const { ctx, calls } = mockCtx({
    agents: { currentInitiator: () => ({ session: { header: { cwd: process.cwd() } } }) },
  });
  const boom = () => {
    throw new Error('磁盘炸了');
  };

  assert.equal(safeRender(ctx, boom), '', '应降级为空串');
  assert.equal(calls.warnings.length, 1, '降级必须留痕');
  assert.match(calls.warnings[0], /渲染判断依据失败/);
});

test('项目主动关闭时 section 注入空串（不提示、不复述缺失）', () => {
  const root = tempDir();
  writeFileSync(join(root, OPT_OUT_FILE), '本项目不要判断依据\n');

  const { ctx, calls } = mockCtx({ agents: { currentInitiator: () => ({ session: { header: { cwd: root } } }) } });
  apply(ctx);

  assert.equal(calls.sections[0].text(), '', '关闭后不应注入任何内容');
  assert.equal(calls.warnings.length, 0, '主动关闭是正常路径，不应告警');
});
