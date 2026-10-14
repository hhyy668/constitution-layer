/**
 * constitution-layer — 判断依据的定位与渲染（纯逻辑，不依赖 Cordis）。
 *
 * 与 CodeBuddy 钩子 `hooks/session-start.js` 保持同一套判据：
 * 向上逐级查找项目根、两份文件分别注入、缺失即报。
 * 差异只在"从哪里拿起点目录"与"注进哪一层提示"。
 */

import { readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** 宪法文件名：回答「什么能做、什么不能做」。 */
export const CONSTITUTION_FILE = 'CONSTITUTION.md';
/** 心智模型文件名：回答「遇到冲突时怎么决策」。 */
export const MENTAL_MODEL_FILE = 'MENTAL-MODEL.md';
/** 判断依据的两个文件，注入顺序即此顺序。 */
export const FOUNDATION_FILES = [CONSTITUTION_FILE, MENTAL_MODEL_FILE];

/**
 * 注入块的外框。系统提示词里没有 SessionStart 的上下文，
 * 所以补一行来源说明，避免模型把它当成用户正文。
 */
const FRAME_OPEN = '<PROJECT-FOUNDATION>';
const FRAME_CLOSE = '</PROJECT-FOUNDATION>';

/** 已读文件缓存：按 mtime + size 判断是否重读，避免每步都打盘。 */
const fileCache = new Map();

/** 是否存在（不区分文件/目录，任一即算命中）。 */
function exists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 向上逐级查找项目根：命中任一判断依据文件即停。
 *
 * 只锚定宪法会让「仅有心智模型的项目」被误报为两者皆缺，
 * 所以两份文件任一命中都算找到根。
 *
 * @param {string} startDir - 起点目录（通常为会话工作目录）。
 * @returns {string} 项目根；一路到顶都没命中时回退为起点目录。
 */
export function findProjectRoot(startDir) {
  const base = resolve(startDir);
  let dir = base;
  for (;;) {
    if (FOUNDATION_FILES.some((name) => exists(join(dir, name)))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return base;
    dir = parent;
  }
}

/**
 * 读取文件并去掉尾部换行（与 `$(<file)` 一致）；不存在或不可读时返回 null。
 *
 * @param {string} path - 绝对路径。
 * @returns {string | null} 内容，或 null。
 */
export function readIfExists(path) {
  try {
    const stat = statSync(path);
    const cached = fileCache.get(path);
    if (cached !== undefined && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.text;
    const text = readFileSync(path, 'utf8').replace(/\n+$/, '');
    fileCache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, text });
    return text;
  } catch {
    fileCache.delete(path);
    return null;
  }
}

/** 缺文件时的提示块。措辞与上游钩子一致：不留「本次用不到」的解释空间。 */
function missingNotice(missing) {
  return [
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

/** 从子目录启动时，标明判断依据所在位置。 */
function locationNotice(projectRoot, startDir) {
  return [
    '<FOUNDATION-LOCATION>',
    `判断依据位于项目根：${projectRoot}（当前工作目录：${startDir}）`,
    '下列规则对该项目整体生效，不限于当前目录。',
    '</FOUNDATION-LOCATION>',
  ].join('\n');
}

/**
 * 渲染一段可直接注入系统提示词的判断依据文本。
 *
 * @param {string} startDir - 会话工作目录。
 * @returns {string} 注入文本；两份文件都在且非空时也总是带外框，无内容可注入时返回空串。
 */
export function renderFoundation(startDir) {
  const base = resolve(startDir);
  const projectRoot = findProjectRoot(base);

  let body = '';
  const missing = [];
  for (const name of FOUNDATION_FILES) {
    const content = readIfExists(join(projectRoot, name));
    if (content === null) missing.push(name);
    else body += `--- BEGIN ${name} ---\n${content}\n--- END ${name} ---\n\n`;
  }
  if (missing.length > 0) body += missingNotice(missing);
  if (body === '') return '';

  if (projectRoot !== base) body = `${locationNotice(projectRoot, base)}\n\n${body}`;
  return `${FRAME_OPEN}\n以下为本项目的专属判断依据，常驻生效。\n\n${body}${FRAME_CLOSE}`;
}

/** 清空读缓存。仅测试需要。 */
export function clearFoundationCache() {
  fileCache.clear();
}
