/**
 * constitution-layer — 判断依据的定位与渲染（纯逻辑，不依赖 Cordis）。
 *
 * 与 CodeBuddy 钩子 `hooks/session-start.cjs` 保持同一套判据：
 * 向上逐级查找项目根、两份文件分别注入、缺失即报、正文里的插件标记一律转义。
 * 差异只在「从哪里拿起点目录」与「注进哪一层提示」。
 *
 * 定位规则的三条边界（都由机制守住，不靠约定）：
 *   1. 不越过最近的 `.git` —— 找不到就按缺失报，不会把无关项目卷进来
 *   2. 退出标记 `NO-CONSTITUTION.md` 一票否决，且优先于判断依据
 *   3. 正文里出现插件自己的标记一律转义，内容无法伪造外框
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
 * 项目根的退出标记。开发者主动决定「本项目不要判断依据」时，
 * 在项目根放这个文件即可，插件对该项目不再注入任何内容。
 *
 * 之所以要给这条正当出口：本插件是建议器而非门禁（它不拦任何工具），
 * 一个既无法强制、又无法关掉的提醒，只会训练所有人忽略它。
 */
export const OPT_OUT_FILE = 'NO-CONSTITUTION.md';

/** 项目边界标记：与 DSH 自己的项目根约定一致（`projectRootMarkers: ['.git']`）。 */
const PROJECT_BOUNDARY = '.git';

/**
 * 注入块的外框。系统提示词里没有 SessionStart 的上下文，
 * 所以补一行来源说明，避免模型把它当成用户正文。
 */
const FRAME_OPEN = '<PROJECT-FOUNDATION>';
const FRAME_CLOSE = '</PROJECT-FOUNDATION>';

/**
 * 本插件自己拥有、因而不允许从正文里伪造的标记。
 *
 * 两侧实现转义同一批标记，保证同一份宪法在两个平台上呈现一致
 * （CodeBuddy 侧不用外框，但在那边的正文里转义它是无害的）。
 */
const OWNED_MARKERS = [
  FRAME_OPEN,
  FRAME_CLOSE,
  '<IMPORTANT-MISSING-FOUNDATION>',
  '</IMPORTANT-MISSING-FOUNDATION>',
  '<FOUNDATION-LOCATION>',
  '</FOUNDATION-LOCATION>',
];

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

/** 存在即可，不区分文件或目录 —— `.git` 既可能是目录，也可能是 worktree/submodule 的指针文件。 */
function existsAny(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 沿起点目录向上解析本次装配的适用范围。
 *
 * 退出标记优先于判断依据：同一层既有宪法又有标记时标记生效 —— 开关就该能关掉。
 * 走到带 `.git` 的目录就停：monorepo 的宪法放在 git 根仍然找得到（那是项目自己的根），
 * 而放在 git 根之上的文件不再跨边界去管辖无关项目。
 *
 * 不再缓存结果：有了项目边界，向上查找本身就是有界的（正常项目 1–3 层），
 * 而缓存会引入「刚加上的开关不生效」「刚写的宪法要等重启」这类陈旧性。
 *
 * @param {string} startDir - 起点目录（通常为会话工作目录）。
 * @returns {{ optedOut: boolean, root: string }} 是否被主动关闭，以及认定的项目根。
 */
export function resolveScope(startDir) {
  const base = resolve(startDir);
  let dir = base;
  for (;;) {
    if (isFoundationFile(join(dir, OPT_OUT_FILE))) return { optedOut: true, root: base };
    if (FOUNDATION_FILES.some((name) => isFoundationFile(join(dir, name)))) return { optedOut: false, root: dir };
    if (existsAny(join(dir, PROJECT_BOUNDARY))) return { optedOut: false, root: base };
    const parent = dirname(dir);
    if (parent === dir) return { optedOut: false, root: base };
    dir = parent;
  }
}

/**
 * 向上逐级查找项目根：命中任一判断依据文件即停。
 *
 * 只锚定宪法会让「仅有心智模型的项目」被误报为两者皆缺，
 * 所以两份文件任一命中都算找到根。
 *
 * @param {string} startDir - 起点目录（通常为会话工作目录）。
 * @returns {string} 项目根；命中前先撞到项目边界或退出标记时回退为起点目录。
 */
export function findProjectRoot(startDir) {
  return resolveScope(startDir).root;
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

/**
 * 把正文里出现的插件标记转义掉。
 *
 * 转义必须**断开标记本身**，而不是只在前面加个字符 —— 加前缀的话
 * `\</PROJECT-FOUNDATION>` 里仍然含完整标记，照样能被当成外框结束。
 * 这里把尖括号换成实体，标记就再也拼不出来了。
 *
 * @param {string} text - 用户可自由编辑的正文。
 * @returns {string} 不再包含任何插件标记的正文。
 */
export function escapeOwnedMarkers(text) {
  let out = text;
  for (const marker of OWNED_MARKERS) {
    const broken = `&lt;${marker.slice(1, -1)}&gt;`;
    out = out.split(marker).join(broken);
  }
  return out;
}

/** 缺文件时的提示块。建议保持硬，同时给出正当出口（机制要诚实）。 */
function missingNotice(missing) {
  return [
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
 * @returns {string} 注入文本；项目主动关闭时返回空串（什么都不注入）。
 */
export function renderFoundation(startDir) {
  const base = resolve(startDir);
  const scope = resolveScope(base);
  if (scope.optedOut) return '';

  let body = '';
  const missing = [];
  for (const name of FOUNDATION_FILES) {
    const content = readIfExists(join(scope.root, name));
    if (isEmpty(content)) missing.push(name);
    else body += `--- BEGIN ${name} ---\n${escapeOwnedMarkers(content)}\n--- END ${name} ---\n\n`;
  }
  if (missing.length > 0) body += missingNotice(missing);
  if (body === '') return '';

  if (scope.root !== base) body = `${locationNotice(scope.root, base)}\n\n${body}`;
  return `${FRAME_OPEN}\n以下为本项目的专属判断依据，常驻生效。\n\n${body}${FRAME_CLOSE}`;
}

/** 清空读缓存。仅测试需要。 */
export function clearFoundationCache() {
  fileCache.clear();
}
