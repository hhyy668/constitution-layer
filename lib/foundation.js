/**
 * constitution-layer — 判断依据的定位与渲染（纯逻辑，不依赖 Cordis）。
 *
 * 与 CodeBuddy 钩子 `hooks/session-start.cjs` 保持同一套判据：
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

/**
 * 已读文件缓存：按 mtime + size 判断是否重读，避免每步都打盘。
 * 有上限 —— 宿主是长驻进程，跨项目只增不减会把内存吃成无界。
 */
const fileCache = new Map();
const FILE_CACHE_MAX = 512;

/** 写入读缓存；超上限时按插入顺序淘汰最早的一条。 */
function cacheFile(path, entry) {
  if (fileCache.size >= FILE_CACHE_MAX && !fileCache.has(path)) {
    const oldest = fileCache.keys().next();
    if (!oldest.done) fileCache.delete(oldest.value);
  }
  fileCache.set(path, entry);
}

/**
 * 已解析出的项目根，按会话工作目录缓存。
 *
 * 只在「两份文件都齐」时缓存：判定为缺失时不缓存，因为缺失正是
 * 「文件可能随时被写出来」的状态，缓存它会让刚写的宪法迟迟不生效。
 * 已缓存过的目录一旦判定缺失就立刻清除，所以判据不会长期失真。
 *
 * 这样成熟项目每次装配只需读文件（有内容缓存），不必从 cwd 向上重走目录树。
 */
const rootCache = new Map();

/**
 * 是否为常规文件。目录、指向目录的链接都不算 ——
 * 否则「同名目录」会通过存在性检查却在读取时失败，出现两侧判定不一致。
 */
function isFoundationFile(path) {
  try {
    return statSync(path).isFile();
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
  const cached = rootCache.get(base);
  if (cached !== undefined) return cached;
  let dir = base;
  for (;;) {
    if (FOUNDATION_FILES.some((name) => isFoundationFile(join(dir, name)))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return base;
    dir = parent;
  }
}

/**
 * 读取文件并去掉尾部换行（与 `$(<file)` 一致）；
 * 不存在、不可读、或不是常规文件（目录、断链）时返回 null。
 *
 * @param {string} path - 绝对路径。
 * @returns {string | null} 内容，或 null。
 */
export function readIfExists(path) {
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return null;
    const cached = fileCache.get(path);
    if (cached !== undefined && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.text;
    const text = readFileSync(path, 'utf8').replace(/\n+$/, '');
    cacheFile(path, { mtimeMs: stat.mtimeMs, size: stat.size, text });
    return text;
  } catch {
    fileCache.delete(path);
    return null;
  }
}

/**
 * 空文件 / 只有空白 视同缺失 —— 存在但没写内容，等于判断依据没建立。
 * 不这样判的话，「缺失即报」会被一个空文件静默绕过。
 *
 * @param {string | null} content - readIfExists 的返回值。
 */
function isEmpty(content) {
  return content === null || content.trim() === '';
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
    if (isEmpty(content)) missing.push(name);
    else body += `--- BEGIN ${name} ---\n${content}\n--- END ${name} ---\n\n`;
  }
  // 齐了才缓存根；缺失不缓存，刚写的宪法才能立刻生效。
  if (missing.length === 0) rootCache.set(base, projectRoot);
  else rootCache.delete(base);

  if (missing.length > 0) body += missingNotice(missing);
  if (body === '') return '';

  if (projectRoot !== base) body = `${locationNotice(projectRoot, base)}\n\n${body}`;
  return `${FRAME_OPEN}\n以下为本项目的专属判断依据，常驻生效。\n\n${body}${FRAME_CLOSE}`;
}

/** 清空读缓存与根缓存。仅测试需要。 */
export function clearFoundationCache() {
  fileCache.clear();
  rootCache.clear();
}
