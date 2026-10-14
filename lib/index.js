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
 * 取当前装配所属会话的工作目录。
 *
 * 装配上下文（AssembleContext）只带 scope 与 signal，没有 cwd，所以按
 * `agents.currentInitiator()` 取当前驱动链上的 agent，再读会话 cwd。
 * 取不到时回退进程工作目录 —— 宁可判错目录也不要让装配抛错。
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
  const close = text.indexOf('\n---', firstBreak);
  if (close < 0) return { meta: {}, body: text };
  const meta = {};
  for (const line of text.slice(firstBreak + 1, close).split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line);
    if (match === null) continue;
    meta[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
  }
  const body = text.slice(close + 4).replace(/^[ \t]*\r?\n/, '');
  return { meta, body };
}

/**
 * 读取包内技能定义。
 *
 * @returns {{ name: string, description: string, whenToUse?: string, content: string, dir: string } | undefined}
 *   技能输入，或读取失败时的 undefined（技能缺失不应阻止插件加载）。
 */
function loadSkill() {
  const file = join(packageRoot, SKILL_RELATIVE, 'SKILL.md');
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  const { meta, body } = parseFrontmatter(text);
  if (meta.name === undefined || meta.description === undefined) return undefined;
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
    const skill = loadSkill();
    if (skill === undefined) return;
    sctx.skills.register({
      name: skill.name,
      description: skill.description,
      ...skill.whenToUse === undefined ? {} : { whenToUse: skill.whenToUse },
      content: skill.content,
      source: 'bundled',
      resourceBase: { kind: 'directory', path: skill.dir },
    });
  });
}
