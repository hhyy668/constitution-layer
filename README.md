# constitution-layer

由开发者确定项目红线与取舍，为 AI 编码智能体持续提供**项目专属的判断依据**。

## 两份依据，各有职责

| 文件 | 回答的问题 | 例子 |
|---|---|---|
| `CONSTITUTION.md` | 哪些方案不能接受 | 不向第三方上传用户原始数据 |
| `MENTAL-MODEL.md` | 合法方案之间怎么取舍 | 在满足需求的方案中优先选择更简单的实现 |

立场由开发者决定。智能体可以引导、检查，并转录已确认的文本；不能从现有代码习惯推断价值条款。宪法先排除不可接受的方案，心智模型再给剩余方案排序。

插件独立可用，可以组合 superpowers、Spec Kit 或现有团队流程。Spec Kit 本身已有宪法、想法评估和规格闭环；本项目专注于人工掌握立场、区分红线与取舍，以及在宿主上下文中提供依据，不接管规格、计划和实现。调研见 [对比报告](SPEC-KIT-COMPARISON.md)，该报告保留为 `0.2.0` 历史快照。

> 建议器，不是门禁。本插件不拦截工具，规则是否被遵守仍依赖智能体。安装成功、hook 执行成功和模型遵守规则是三件不同的事。

## 安装

需要 Node.js 22 或更新版本，并确保宿主运行环境可以执行 `node`。同一仓库提供 DSH bundle、CodeBuddy 市场、Claude Code 市场和 Codex 市场；各平台独立读取自己的清单。

以下 GitHub 命令在包含 `0.3.0` 的代码推送后生效；当前工作区测试请使用本地目录入口。

### DeepSeek Harness

在 Plugins 页面选择 bundle，或调用 `plugin_manager`：

```text
action: install_bundle
target: github:hhyy668/constitution-layer
```

开发时使用本地目录：

```text
action: install_bundle
target: link:/绝对路径/constitution-layer
```

卸载：`action: remove_bundle`，`target: constitution-layer`。bundle 沿用宿主现有装载机制。

### WorkBuddy / CodeBuddy

在宿主中运行：

```text
/plugin marketplace add hhyy668/constitution-layer
/plugin install constitution-layer@constitution-layer-dev
```

本地开发时将第一条的仓库名替换为本地仓库绝对路径。市场名来自 `.codebuddy-plugin/marketplace.json`，保留现有的 `constitution-layer-dev`。

卸载使用宿主 `/plugin` 管理器。安装或更新后按宿主要求重载插件、启动新会话。

### Claude Code

在 Claude Code 中运行：

```text
/plugin marketplace add hhyy668/constitution-layer
/plugin install constitution-layer@constitution-layer
```

本地开发可以直接在终端启动：

```sh
claude --plugin-dir /绝对路径/constitution-layer/plugins/constitution-layer
```

也可以将本地仓库路径添加为市场，再安装相同的插件选择器。市场位于根 `.claude-plugin/marketplace.json`，插件清单位于共享插件目录的 `.claude-plugin/plugin.json`。

引导技能：`/constitution-layer:constitution-brainstorm`。卸载：`/plugin uninstall constitution-layer@constitution-layer`。安装后启动新会话；更新后按宿主提示重启。

### Codex CLI / 本地 Codex 插件环境

终端运行：

```sh
codex plugin marketplace add hhyy668/constitution-layer
codex plugin add constitution-layer@constitution-layer
```

本地开发时把第一条的 GitHub 仓库替换为本地仓库绝对路径。也可以在 Codex `/plugins` 中选择市场和插件。

市场位于根 `.agents/plugins/marketplace.json`；插件采用官方仍支持的 `.codex-plugin/plugin.json` 兼容清单，显式引用 `skills/` 和 `hooks/codex.json`。

安装后启动新会话，并在 `/hooks` 中审阅并信任本插件 hook；仅安装插件不会自动授予 hook 信任。被禁用、尚未信任或管理员禁止的 hooks 不会提供注入能力。可用 `/skills` 或输入 `$` 选择 `constitution-brainstorm` 引导技能。

卸载：`codex plugin remove constitution-layer@constitution-layer`。若不再需要市场，可运行 `codex plugin marketplace remove constitution-layer`。

这里支持能运行本地脚本的 Codex 插件环境。IDE 单独安装技能不等于安装了本插件；网页安装、云端执行或远程宿主不保证能运行本地 hook。

## 注入时机与文件更新

| 平台 | 实际机制 | 更新行为 |
|---|---|---|
| DSH | `systemPrompt.section()`，`text` 函数 | 每次提示词装配重新定位并读取；正文使用 mtime + size 缓存 |
| CodeBuddy / WorkBuddy | `SessionStart` hook | 宿主触发 SessionStart 时读取 |
| Claude Code | `SessionStart` hook | 启动、恢复、清空、压缩、fork 等宿主触发事件时读取 |
| Codex 本地环境 | 受宿主信任控制的 `SessionStart` hook | 宿主触发事件时读取；不是每条请求都重读 |

Hook 没有 source 白名单，是否触发某个事件取决于宿主版本。会话内编辑依据后，hook 平台应重新开启会话或显式读取当前文件，不能把旧注入当作新版。DSH 的每次装配读取也不等于所有宿主都拥有相同生命周期保证。

Codex 的 hook 上下文预算设为 20000；超出宿主预算时正文可能被保存为文件或缩略。宪法默认 50 行、心智模型 105 行，两份合计占用上下文；这不是运行时硬截断。

## 项目边界与退出

从当前工作目录向上查找，记住最近的一组依据，同时继续检查退出标记，直到最近的 `.git` 文件、目录或文件系统根。

- 不越过最近 `.git`，因此外层依据不会管理无关 Git 项目；支持 worktree / submodule 的 Git 指针文件。
- monorepo 根目录的依据可以从子目录找到。若子目录有自己的任一判断文件，使用该目录的一组，不拼接父层文件。
- 项目范围内任一 `NO-CONSTITUTION.md` 常规文件优先于判断依据。Git 根的退出标记覆盖该项目内的子目录依据。
- 嵌套 Git 仓库独立：外层退出标记不跨越其 Git 边界。
- 退出标记由开发者创建；智能体不能为了消除提示创建它。范围关闭后不注入、不提示缺失。
- 两份依据任一缺失、空白或不可读时提示补齐；现有文件保留，不重新建立全部依据。

在没有 `.git` 的目录中，扫描会继续到文件系统根；需要明确项目隔离时，应使用 Git 项目边界。

正文中的插件自有标记被转义为 `&lt;...&gt;`，避免内容闭合插件外框。这只保护插件标记的结构，不是对任意正文的语义安全保证。

## 初始化与审查

`constitution-brainstorm` 在缺任一依据或开发者明确要求建立、修订时使用：

1. 一次询问一个尚未决定的问题，定位使用者与最不能做错的事。
2. 开发者确定取舍方向和适用条件。
3. 确认条款文本后转录落盘；已有依据齐备的普通任务直接继续。
4. 完备性检查后按 BLOCKER / MAJOR / NIT 审查。宪法冲突是 BLOCKER，导致返工或定位偏离是 MAJOR；普通偏好忽略。

重要判断附“规则位置与原文、候选方案与取舍、决定、验证证据”，未验证就写待验证。重复问题可以复用既有授权修复实现，不能据此自动修宪。修订在项目现有变更记录中留痕；本仓库使用 [CHANGELOG.md](CHANGELOG.md)。

不安装 superpowers 也能完成本插件的引导和判据审查。已有流程工具时继续沿用其开发流程，本项目不复制上游技能。

## 验证与效果评估

```sh
npm test
claude plugin validate ./plugins/constitution-layer
claude plugin validate ./.claude-plugin/marketplace.json
npm pack --dry-run --json
```

测试涵盖定位与退出、空文件、标记转义、DSH 接线、两套实现一致性，以及各市场对应的独立安装包执行。平台测试只复制插件目录到含中文、空格的临时路径，核对技能、参考文件和 hook 自包含。

`0.3.0` 本地验证使用 Windows、Claude Code `2.1.316`、Codex CLI `0.165.0`。Claude 验证清单；Codex 使用临时 CLI 配置发现本地市场；Node 测试直接执行发布目录中的 hook。没有修改全局安装或 hook 信任，没有运行真实模型会话，也不声称这些是最低支持版本。其他系统与宿主端到端行为尚需实测。

[行为评估场景](evals/README.md) 提供无插件、宿主指令文件、本插件三组对照。现有机制测试不证明模型遵守率、减少反问或减少返工，行为评估材料未附虚构成绩。

## 目录

```text
.agents/plugins/marketplace.json           Codex 市场
.claude-plugin/marketplace.json            Claude Code 市场
.codebuddy-plugin/marketplace.json        CodeBuddy 市场
package.json / cordis.patch.yml           DSH bundle
lib/                                     DSH 入口与判断依据实现
plugins/constitution-layer/
  .claude-plugin/plugin.json              Claude 清单
  .codex-plugin/plugin.json               Codex 清单
  .codebuddy-plugin/plugin.json           CodeBuddy 清单
  hooks/hooks.json                       Claude / CodeBuddy 配置
  hooks/codex.json                       Codex 配置
  hooks/session-start.cjs                 三个平台共享的独立脚本
  skills/constitution-brainstorm/         所有平台共用技能与判据
test/                                    机制与平台分发测试
evals/                                   行为场景与对照说明
docs/plans/                              本轮设计与实施记录
```

`lib/foundation.js` 与独立 CJS hook 仍保留两份实现；更改判据时两边同步，parity 测试用于检查漂移。DSH section 使用 `interpolate: false`，避免正文模板字符被宿主插值；渲染错误降级为空并告警。

根目录的 `CONSTITUTION.md`、`MENTAL-MODEL.md` 是本项目自己使用的依据，不是用户项目模板；插件不会复制它们来替用户决定价值观。

## 接口依据

- [Claude Code 插件清单](https://code.claude.com/docs/en/plugins-reference)与 [Hooks](https://code.claude.com/docs/en/hooks)。
- [官方 OpenAI 插件打包说明](https://developers.openai.com/plugins/build/plugins)、[Codex Hooks](https://developers.openai.com/codex/hooks)与 [Skills](https://developers.openai.com/codex/skills)。

## License

MIT
