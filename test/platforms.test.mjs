import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const packageManifest = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
const temporaryRoots = [];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function inside(root, path) {
  const resolved = resolve(root, path);
  assert.ok(!relative(root, resolved).startsWith('..'), `资源必须在插件包内：${path}`);
  return resolved;
}

after(() => {
  for (const root of temporaryRoots) rmSync(root, { recursive: true, force: true });
});

const platforms = [
  { name: 'CodeBuddy', directory: '.codebuddy-plugin', market: '.codebuddy-plugin/marketplace.json' },
  { name: 'Claude Code', directory: '.claude-plugin', market: '.claude-plugin/marketplace.json' },
  { name: 'Codex', directory: '.codex-plugin', market: '.agents/plugins/marketplace.json' },
];

for (const platform of platforms) {
  test(`${platform.name}：市场安装后的独立插件包可加载技能并执行 SessionStart`, () => {
    const marketplace = readJson(join(repo, platform.market));
    const entry = marketplace.plugins.find((plugin) => plugin.name === packageManifest.name);
    assert.ok(entry, '市场必须暴露本插件');
    const source = typeof entry.source === 'string' ? entry.source : entry.source.path;
    const pluginSource = inside(repo, source);
    const manifest = readJson(join(pluginSource, platform.directory, 'plugin.json'));
    assert.equal(manifest.name, packageManifest.name);
    assert.equal(manifest.version, packageManifest.version);

    // 只复制发布给宿主的插件目录，防止实现偷偷依赖仓库外层的 lib/。
    const fixture = mkdtempSync(join(tmpdir(), 'constitution-platform-'));
    temporaryRoots.push(fixture);
    const installed = join(fixture, '已安装 plugin with spaces');
    cpSync(pluginSource, installed, { recursive: true });
    const skillRoot = inside(installed, manifest.skills ?? './skills');
    const skill = readFileSync(join(skillRoot, 'constitution-brainstorm', 'SKILL.md'), 'utf8');
    assert.match(skill, /name: constitution-brainstorm/);
    for (const reference of ['review-criteria.md', 'completeness-check.md']) {
      assert.ok(readFileSync(join(skillRoot, 'constitution-brainstorm', 'references', reference), 'utf8').length > 0);
    }

    const hookConfig = readJson(inside(installed, manifest.hooks ?? './hooks/hooks.json'));
    const sessionHooks = hookConfig.hooks.SessionStart;
    assert.ok(sessionHooks.length > 0);
    for (const sourceName of ['startup', 'resume', 'clear', 'compact', 'fork']) {
      assert.ok(sessionHooks.some((group) => !group.matcher || new RegExp(group.matcher).test(sourceName)), sourceName);
    }
    const commandHook = sessionHooks[0].hooks[0];
    assert.equal(commandHook.type, 'command');
    const match = /^node "\$\{(CLAUDE_PLUGIN_ROOT|PLUGIN_ROOT)\}\/([^"\n]+)"$/.exec(commandHook.command);
    assert.ok(match, '命令必须明确引用当前插件包内的独立 Node 脚本');
    const hookScript = inside(installed, match[2]);
    const project = join(fixture, '用户项目 with spaces');
    mkdirSync(join(project, '.git'), { recursive: true });
    writeFileSync(join(project, 'CONSTITUTION.md'), '# 用户自己的宪法\n禁止上传原始数据。\n');
    writeFileSync(join(project, 'MENTAL-MODEL.md'), '# 用户自己的心智模型\n简单优先。\n');

    const result = spawnSync(process.execPath, [hookScript], {
      cwd: installed,
      input: JSON.stringify({ cwd: project, hook_event_name: 'SessionStart', source: 'fork' }),
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const output = JSON.parse(result.stdout).hookSpecificOutput;
    assert.equal(output.hookEventName, 'SessionStart');
    assert.match(output.additionalContext, /用户自己的宪法/);
    assert.match(output.additionalContext, /用户自己的心智模型/);
    assert.doesNotMatch(output.additionalContext, /IMPORTANT-MISSING-FOUNDATION/);

    // 安装包运行时仍应尊重使用者的退出选择。
    writeFileSync(join(project, 'NO-CONSTITUTION.md'), '由开发者关闭\n');
    const optedOut = spawnSync(process.execPath, [hookScript], {
      input: JSON.stringify({ cwd: project }), encoding: 'utf8', timeout: 10000,
    });
    assert.equal(optedOut.status, 0);
    assert.equal(optedOut.stdout, '');
  });
}
