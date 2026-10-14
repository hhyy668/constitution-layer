#!/usr/bin/env node
// SessionStart hook: 常驻注入判断依据 + 开工前缺失检查
//
// 相比 bash 实现的改进：
//   1. JSON 由 JSON.stringify 生成，控制字符必定正确转义（bash 手工转义会漏）
//   2. 直接读 stdin JSON 的 cwd 字段，不做 sed 解析
//   3. 不依赖 bash / cmd / polyglot，无 ASCII 约束
//   4. 跨平台同一份代码
//
// 判定口径与 DSH 侧 lib/foundation.js 逐条对齐，由 test/parity.test.mjs 守着：
//   项目边界 .git、退出标记 NO-CONSTITUTION.md、正文里的插件标记一律转义。
//
// 定位：建议器，不是门禁。它不拦任何工具，缺文件只提示、不阻断。

'use strict';

const fs = require('fs');
const path = require('path');

const CONSTITUTION = 'CONSTITUTION.md';
const MENTAL_MODEL = 'MENTAL-MODEL.md';
const FOUNDATION_FILES = [CONSTITUTION, MENTAL_MODEL];
// 开发者主动决定「本项目不要判断依据」时，在项目根放这个文件即可。
const OPT_OUT_FILE = 'NO-CONSTITUTION.md';
// 项目边界：与 DSH 自己的项目根约定一致（projectRootMarkers: ['.git']）。
const PROJECT_BOUNDARY = '.git';

// 本插件自己拥有、因而不允许从正文里伪造的标记。两侧转义同一批，
// 保证同一份宪法在两个平台上呈现一致。
const OWNED_MARKERS = [
  '<PROJECT-FOUNDATION>',
  '</PROJECT-FOUNDATION>',
  '<IMPORTANT-MISSING-FOUNDATION>',
  '</IMPORTANT-MISSING-FOUNDATION>',
  '<FOUNDATION-LOCATION>',
  '</FOUNDATION-LOCATION>',
];

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

// 存在即可，不区分文件或目录 —— .git 既可能是目录，也可能是 worktree/submodule 的指针文件。
function existsAny(p) {
  try {
    fs.statSync(p);
    return true;
  } catch {
    return false;
  }
}

// 沿起点目录向上解析适用范围。
// 退出标记优先于判断依据：同一层既有宪法又有标记时标记生效 —— 开关就该能关掉。
// 走到带 .git 的目录就停：monorepo 的宪法放在 git 根仍然找得到，
// 而放在 git 根之上的文件不再跨边界去管辖无关项目。
function resolveScope(startDir) {
  const base = path.resolve(startDir);
  let dir = base;
  for (;;) {
    if (isFoundationFile(path.join(dir, OPT_OUT_FILE))) return { optedOut: true, root: base };
    if (FOUNDATION_FILES.some((f) => isFoundationFile(path.join(dir, f)))) return { optedOut: false, root: dir };
    if (existsAny(path.join(dir, PROJECT_BOUNDARY))) return { optedOut: false, root: base };
    const parent = path.dirname(dir);
    if (parent === dir) return { optedOut: false, root: base };
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

// 转义必须断开标记本身，而不是只在前面加字符 ——
// 加前缀的话 `\</PROJECT-FOUNDATION>` 仍含完整标记，照样能被当成外框结束。
function escapeOwnedMarkers(text) {
  let out = text;
  for (const marker of OWNED_MARKERS) {
    out = out.split(marker).join(`&lt;${marker.slice(1, -1)}&gt;`);
  }
  return out;
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
  const scope = resolveScope(startDir);
  // 开发者明确关闭了本项目 —— 什么都不注入，也不提示。
  if (scope.optedOut) return;

  let inject = '';
  const missing = [];

  for (const name of FOUNDATION_FILES) {
    const content = readIfExists(path.join(scope.root, name));
    if (isEmpty(content)) {
      missing.push(name);
    } else {
      inject += `--- BEGIN ${name} ---\n${escapeOwnedMarkers(content)}\n--- END ${name} ---\n\n`;
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
      '',
      `若开发者明确决定本项目不要判断依据，由开发者在项目根创建 ${OPT_OUT_FILE} 关闭本插件。`,
      '这是开发者的取舍，不能由你代做，也不能为了让提示消失而创建它。',
      '</IMPORTANT-MISSING-FOUNDATION>',
    ].join('\n');
  }

  if (!inject) return;

  // 从子目录启动时，标明判断依据所在位置
  if (scope.root !== path.resolve(startDir)) {
    inject = [
      '<FOUNDATION-LOCATION>',
      `判断依据位于项目根：${scope.root}（当前工作目录：${startDir}）`,
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
