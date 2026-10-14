/**
 * constitution-layer — DeepSeek Harness 插件入口。
 *
 * 它做两件事，对应上游 CodeBuddy 插件的两个部分：
 *
 *   1. 常驻注入：把项目根的 `CONSTITUTION.md` / `MENTAL-MODEL.md` 注入系统提示词，
 *      缺文件时注入补齐提示。上游靠 SessionStart 钩子做一次；这里注册成
 *      prompt section，每次装配都重读，因此压缩、恢复、子会话都自然带上。
 *   2. 提供 `constitution-brainstorm` 技能：从插件包内注册，不依赖
 *      `@deepseek-ai/dsh-skill-filesystem`（该插件在多数 profile 里是关的）。
 *
 * 注入用 section + `interpolate: false`，不是 context：context 的文本会被强制
 * 做 `{{变量}}` 插值，用户宪法里一旦出现 `{{...}}` 就会让整次装配抛错；
 * `interpolate: false` 的 section 按原样使用，正文内容不影响装配。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderFoundation } from './foundation.js';

/** 插件标识，与 cordis.patch.yml 的 loader 条目名一致。 */
export const name = 'constitution-layer';

/**
 * section 名。全局唯一：system-prompt 对同名 context/section 会直接抛错。
 * order 取 100 —— 在 deployment:persona-prefix(0) 之后、plan 策略(500) 之前，
 * 让判断依据先于具体流程生效。
 */
const SECTION_NAME = 'constitution-layer:foundation';
const SECTION_ORDER = 100;

/** 插件包根目录，用于定位包内技能与参考文档。 */
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

/** 技能目录（相对包根）。 */
const SKILL_RELATIVE = join('plugins', 'constitution-layer', 'skills', 'constitution-brainstorm');

/**
 * 输出告警。优先走宿主 logger；拿不到就退到 stderr ——
 * 静默降级会让人把「API 取不到值」误当成「一切正常」，必须留痕。
 *
 * @param {object} ctx - 插件上下文。
 * @param {string} message - 告警内容。
 */
function warn(ctx, message) {
  const line = `[constitution-layer] ${message}`;
  let logged = false;
  try {
    if (typeof ctx?.logger?.warn === 'function') {
      ctx.logger.warn(message);
      logged = true;
    }
  } catch {
    // logger 本身出错也不能影响装配
  }
  if (!logged) console.error(line);
}

/**
 * 已就「cwd 回退」告警过的插件实例。
 *
 * text() 每次装配都会跑；同一个实例只报一次，否则非会话驱动的装配会
 * 每步刷一条，把真正的一次性信号淹掉。按实例去重，多会话互不影响。
 */
const cwdFallbackWarned = new WeakSet();

/** 记一次「cwd 回退」告警；同一实例重复调用返回 false。 */
function markCwdFallback(ctx) {
  if (typeof ctx !== 'object' || ctx === null) return true;
  if (cwdFallbackWarned.has(ctx)) return false;
  cwdFallbackWarned.add(ctx);
  return true;
}

/**
 * 取当前装配所属会话的工作目录。
 *
 * 装配上下文（AssembleContext）只带 scope 与 signal，没有 cwd，所以按
 * `agents.currentInitiator()` 取当前驱动链上的 agent，再读会话 cwd。
 * 取不到时回退进程工作目录 —— 宁可判错目录也不要让装配抛错，
 * 但要显式告警（同一实例仅一次）：静默回退会让「取值链失效」看起来和正常运行一样。
 *
 * @param {object} ctx - 插件上下文。
 * @returns {string} 绝对路径。
 */
function sessionCwd(ctx) {
  try {
    const cwd = ctx.get('agents')?.currentInitiator?.()?.session?.header?.cwd;
    if (typeof cwd === 'string' && cwd !== '') return cwd;
  } catch {
    // 无 initiator 边界（如非会话驱动的装配）时按回退处理。
  }
  if (markCwdFallback(ctx)) {
    warn(ctx, `取不到会话 cwd，回退 process.cwd()（${process.cwd()}）—— 判断依据可能定位到错误目录`);
  }
  return process.cwd();
}

/**
 * 解析 SKILL.md 的 YAML frontmatter。
 *
 * 只认单行 `key: value`：本插件的技能头部就是这种形状，为此引一个 YAML
 * 依赖不值得。
 *
 * @param {string} text - 文件全文。
 * @returns {{ meta: Record<string, string>, body: string }} 头部字段与正文。
 */
function parseFrontmatter(text) {
  const firstBreak = text.indexOf('\n');
  if (firstBreak < 0 || text.slice(0, firstBreak).trim() !== '---') return { meta: {}, body: text };

  const lines = text.split('\n');
  // 闭合定界符必须是单独成行的 `---`（允许行尾空白）。
  // 用 indexOf('\n---') 会把 `---foo` 这种正文行误当成结束。
  let closeLine = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (/^---[ \t]*\r?$/.test(lines[i])) {
      closeLine = i;
      break;
    }
  }
  if (closeLine < 0) return { meta: {}, body: text };

  const meta = {};
  for (const line of lines.slice(1, closeLine)) {
    const match = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line);
    if (match === null) continue;
    const raw = match[2].trim();
    // 只剥「成对的」引号：`"a"` → a，而 `He said "hi"` 原样保留。
    const quoted = /^(["'])([\s\S]*)\1$/.exec(raw);
    meta[match[1]] = quoted === null ? raw : quoted[2];
  }
  const body = lines.slice(closeLine + 1).join('\n').replace(/^[ \t]*\r?\n/, '');
  return { meta, body };
}

/**
 * 读取包内技能定义。
 *
 * @param {object} ctx - 插件上下文，仅用于失败时告警。
 * @returns {{ name: string, description: string, whenToUse?: string, content: string, dir: string } | undefined}
 *   技能输入，或读取/解析失败时的 undefined（技能缺失不应阻止插件加载，但要留痕）。
 */
function loadSkill(ctx) {
  const file = join(packageRoot, SKILL_RELATIVE, 'SKILL.md');
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    warn(ctx, `技能文件读不到，constitution-brainstorm 将不会被注册：${file}（${error.message}）`);
    return undefined;
  }
  const { meta, body } = parseFrontmatter(text);
  if (meta.name === undefined || meta.description === undefined) {
    warn(ctx, `技能 frontmatter 缺少 name 或 description，技能不会被注册：${file}`);
    return undefined;
  }
  return {
    name: meta.name,
    description: meta.description,
    ...meta.whenToUse === undefined ? {} : { whenToUse: meta.whenToUse },
    content: body,
    dir: dirname(file),
  };
}

/**
 * 插件装载。
 *
 * 两个注入分开注册：系统提示词与技能服务各自可用即生效，
 * 任一缺失不影响另一半。
 *
 * @param {object} ctx - Cordis 上下文。
 */
export function apply(ctx) {
  ctx.inject(['systemPrompt'], (sctx) => {
    sctx.systemPrompt.section({
      name: SECTION_NAME,
      order: SECTION_ORDER,
      interpolate: false,
      text: () => renderFoundation(sessionCwd(ctx)),
    });
  });

  ctx.inject(['skills'], (sctx) => {
    const skill = loadSkill(ctx);
    if (skill === undefined) return;
    sctx.skills.register({
      name: skill.name,
      description: skill.description,
      ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
      content: skill.content,
      // 'runtime' 才是 skills.register() 的语义（注册进来的运行时技能）；
      // 'bundled' 指随安装附带的技能目录，走的是文件系统 provider 那条路。
      source: 'runtime',
      resourceBase: { kind: 'directory', path: skill.dir },
    });
  });
}
