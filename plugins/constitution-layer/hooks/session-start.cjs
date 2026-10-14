#!/usr/bin/env node
// SessionStart hook: 常驻注入判断依据 + 开工前缺失检查
//
// 相比 bash 实现的改进：
//   1. JSON 由 JSON.stringify 生成，控制字符必定正确转义（bash 手工转义会漏）
//   2. 直接读 stdin JSON 的 cwd 字段，不做 sed 解析
//   3. 不依赖 bash / cmd / polyglot，无 ASCII 约束
//   4. 跨平台同一份代码
//
// 设计原则：机械判据，无裁量空间。缺失即报，不判断"本次是否需要"。

'use strict';

const fs = require('fs');
const path = require('path');

const CONSTITUTION = 'CONSTITUTION.md';
const MENTAL_MODEL = 'MENTAL-MODEL.md';
const FOUNDATION_FILES = [CONSTITUTION, MENTAL_MODEL];

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(data); } };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
    // 兜底：某些环境不会触发 end
    setTimeout(finish, 3000).unref();
  });
}

// 是否为常规文件。目录、指向目录的链接都不算 ——
// 否则「同名目录」会通过存在性检查却在读取时失败，出现两侧判定不一致。
function isFoundationFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

// 向上逐级查找项目根：命中任一判断依据文件即停。
// 只锚定宪法会让「仅有心智模型的项目」被误报为两者皆缺。
function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (FOUNDATION_FILES.some((f) => isFoundationFile(path.join(dir, f)))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(startDir);
    dir = parent;
  }
}

// 读取文件，去掉尾部换行（与 bash 的 $(<file) 行为一致）
function readIfExists(p) {
  try {
    return fs.readFileSync(p, 'utf8').replace(/\n+$/, '');
  } catch {
    return null;
  }
}

// 空文件 / 只有空白 视同缺失 —— 存在但没写内容，等于判断依据没建立。
// 不这样判的话，「缺失即报」会被一个空文件静默绕过。
function isEmpty(content) {
  return content === null || content.trim() === '';
}

async function main() {
  const raw = await readStdin();

  // cwd 以 stdin 的 cwd 为准 —— hook 进程的工作目录不保证等于项目目录
  let cwd = process.cwd();
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed.cwd === 'string' && parsed.cwd.trim()) cwd = parsed.cwd;
    } catch {
      // 输入不是合法 JSON 时回退到进程工作目录，不中断会话启动
    }
  }

  const startDir = cwd;
  const projectRoot = findProjectRoot(startDir);

  let inject = '';
  const missing = [];

  for (const name of FOUNDATION_FILES) {
    const content = readIfExists(path.join(projectRoot, name));
    if (isEmpty(content)) {
      missing.push(name);
    } else {
      inject += `--- BEGIN ${name} ---\n${content}\n--- END ${name} ---\n\n`;
    }
  }

  if (missing.length > 0) {
    inject += [
      '<IMPORTANT-MISSING-FOUNDATION>',
      `本项目缺少项目专属判断依据：${missing.join(', ')}`,
      '',
      '开工前必须先补齐 —— 使用 constitution-brainstorm 技能引导开发者建立。',
      '开发者必须给出取舍方向，智能体不得代笔。',
      '',
      '「本次用不到」不构成跳过理由：判断依据的作用恰在于你尚未意识到需要它的时候拦住你。',
      '</IMPORTANT-MISSING-FOUNDATION>',
    ].join('\n');
  }

  if (!inject) return;

  // 从子目录启动时，标明判断依据所在位置
  if (projectRoot !== path.resolve(startDir)) {
    inject = [
      '<FOUNDATION-LOCATION>',
      `判断依据位于项目根：${projectRoot}（当前工作目录：${startDir}）`,
      '下列规则对该项目整体生效，不限于当前目录。',
      '</FOUNDATION-LOCATION>',
      '',
      inject,
    ].join('\n');
  }

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: inject,
    },
  }));
}

main().then(
  () => process.exit(0),
  () => process.exit(0) // 钩子失败不得中断会话启动
);
