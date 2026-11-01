# constitution-layer

由开发者确定项目红线与取舍，为 AI 编码智能体持续提供**项目专属的判断依据**。

支持 DeepSeek Harness、CodeBuddy / WorkBuddy、Claude Code、Codex CLI。MIT 许可。

## 它解决什么问题

编码智能体缺的不是能力，是立场。没有项目专属的判断依据时，它只有两条路：
反复追问开发者，或者按通用习惯自作主张。前者把认知负担甩回给人，后者在你没注意的地方做出你不会同意的取舍。

本插件让两份文件常驻在智能体的上下文里：

| 文件 | 回答的问题 | 例子 |
|---|---|---|
| `CONSTITUTION.md` | 哪些方案不能接受 | 不向第三方上传用户原始数据 |
| `MENTAL-MODEL.md` | 合法方案之间怎么取舍 | 在满足需求的方案中优先选择更简单的实现 |

宪法先排除不可接受的方案，心智模型再给剩余方案排序。立场由开发者决定。智能体可以收集证据、引导、检查，并转录已确认的文本；不能从现有代码习惯推断价值条款。

> 建议器，不是门禁。本插件不拦截工具，规则是否被遵守仍依赖智能体。安装成功、hook 执行成功和模型遵守规则是三件不同的事。

## 三分钟上手

1. 按下文安装到你的宿主，开一个新会话。
2. 进入任一 Git 项目。插件向上找到最近的 `.git`，读取该范围内的两份文件并注入上下文。
3. 两份都有：智能体直接按其行事，不重复访谈。
4. 缺任一份：智能体收到缺失提示，并按任务分流。
   - 只读、解释、调研任务直接完成，末尾提一次缺失。
   - 会产生决策或写入的工作，先用 `constitution-brainstorm` 技能引导你建立，再开工。
   - 无人可对话的环境，报告缺失并退出。
5. 不想在某个项目用：在项目根放一个 `NO-CONSTITUTION.md`，插件对该项目完全静默。

技能调用方式见各平台安装说明。首版引导目标是十五分钟内落盘，不超过 8 个问题。

## 两份文件长什么样

下面是一个虚构项目的示意，用来说明粒度，不是模板。插件不附带模板，也不会替你填写立场。

```markdown
# 宪法
- 禁止把用户上传的原始文件发送到任何第三方服务。
- 禁止在未经开发者确认的情况下删除数据库表或迁移文件。
- 公开示例与测试数据一律虚构，不得出现真实客户名。
- 修改本文件须由维护者显式授权，并在 CHANGELOG 留痕。
```

```markdown
# 心智模型
- 简单 / 灵活：只为已知的第二个场景做抽象；单一场景直接写。
- 兼容 / 演进：公开 API 保持向后兼容；内部模块允许破坏性重构。
- 停止条件：删除、对外发布、产生费用、修改治理文件，一律停下问人。
```

区分两者的办法是事故测试：有人违反了，是回滚或拒绝合并，还是要求解释理由？前者进宪法，后者进心智模型。

## 安装

需要 Node.js 22 或更新版本，并确保宿主运行环境可以执行 `node`。同一仓库提供四个平台的入口，各平台独立读取自己的清单。

| 平台 | 入口 | 技能调用 |
|---|---|---|
| DeepSeek Harness | bundle，`package.json` + `cordis.patch.yml` | 宿主技能列表 |
| CodeBuddy / WorkBuddy | 市场 `.codebuddy-plugin/marketplace.json` | 宿主技能列表 |
| Claude Code | 市场 `.claude-plugin/marketplace.json` | `/constitution-layer:constitution-brainstorm` |
| Codex CLI | 市场 `.agents/plugins/marketplace.json` | `/skills` 或输入 `$` 选择 |

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

卸载：`/plugin uninstall constitution-layer@constitution-layer`。安装后启动新会话；更新后按宿主提示重启。

### Codex CLI / 本地 Codex 插件环境

终端运行：

```sh
codex plugin marketplace add hhyy668/constitution-layer
codex plugin add constitution-layer@constitution-layer
```

本地开发时把第一条的 GitHub 仓库替换为本地仓库绝对路径。也可以在 Codex `/plugins` 中选择市场和插件。

市场位于根 `.agents/plugins/marketplace.json`；插件采用官方仍支持的 `.codex-plugin/plugin.json` 兼容清单，显式引用 `skills/` 和 `hooks/codex.json`。

安装后启动新会话，并在 `/hooks` 中审阅并信任本插件 hook；仅安装插件不会自动授予 hook 信任。被禁用、尚未信任或管理员禁止的 hooks 不会提供注入能力。

卸载：`codex plugin remove constitution-layer@constitution-layer`。若不再需要市场，可运行 `codex plugin marketplace remove constitution-layer`。

这里支持能运行本地脚本的 Codex 插件环境。IDE 单独安装技能不等于安装了本插件；网页安装、云端执行或远程宿主不保证能运行本地 hook。

## 工作原理

```text
会话启动 / 提示词装配
  └─ 从工作目录向上扫描到最近的 .git
       ├─ 遇到 NO-CONSTITUTION.md → 静默，不注入不提示
       ├─ 两份都有 → 注入正文
       └─ 缺任一 → 注入现有正文 + 缺失提示（含任务分流说明）
```

### 注入时机与文件更新

| 平台 | 实际机制 | 更新行为 |
|---|---|---|
| DSH | `systemPrompt.section()`，`text` 函数 | 每次提示词装配重新定位并读取；正文使用 mtime + size 缓存 |
| CodeBuddy / WorkBuddy | `SessionStart` hook | 宿主触发 SessionStart 时读取 |
| Claude Code | `SessionStart` hook | 启动、恢复、清空、压缩、fork 等宿主触发事件时读取 |
| Codex 本地环境 | 受宿主信任控制的 `SessionStart` hook | 宿主触发事件时读取；不是每条请求都重读 |

Hook 没有 source 白名单，是否触发某个事件取决于宿主版本。会话内编辑依据后，hook 平台应重新开启会话或显式读取当前文件，不能把旧注入当作新版。DSH 的每次装配读取也不等于所有宿主都拥有相同生命周期保证。

Codex 的 hook 上下文预算设为 20000；超出宿主预算时正文可能被保存为文件或缩略。宪法建议 40 行、心智模型 80 行，两份常驻注入，每行都是上下文成本；这不是运行时硬截断。

### 项目边界与退出

从当前工作目录向上查找，记住最近的一组依据，同时继续检查退出标记，直到最近的 `.git` 文件、目录或文件系统根。

- 不越过最近 `.git`，因此外层依据不会管理无关 Git 项目；支持 worktree / submodule 的 Git 指针文件。
- monorepo 根目录的依据可以从子目录找到。若子目录有自己的任一判断文件，使用该目录的一组，不拼接父层文件。
- 项目范围内任一 `NO-CONSTITUTION.md` 常规文件优先于判断依据。Git 根的退出标记覆盖该项目内的子目录依据。
- 嵌套 Git 仓库独立：外层退出标记不跨越其 Git 边界。
- 退出标记由开发者创建；智能体不能为了消除提示创建它。范围关闭后不注入、不提示缺失。
- 两份依据任一缺失、空白或不可读时提示补齐；现有文件保留，不重新建立全部依据。
- 缺失提示按任务分流：只读、解释、调研任务直接完成并在末尾提一次缺失；产生决策或写入的工作先补齐；无人可对话时报告缺失并退出。

在没有 `.git` 的目录中，扫描会继续到文件系统根；需要明确项目隔离时，应使用 Git 项目边界。

正文中的插件自有标记被转义为 `&lt;...&gt;`，避免内容闭合插件外框。这只保护插件标记的结构，不是对任意正文的语义安全保证。

## 引导：从零建立两份文件

`constitution-brainstorm` 在缺任一依据且任务产生决策，或开发者明确要求建立、修订时使用。目标是没写过宪法的开发者十五分钟内拿到可用首版。

| 阶段 | 智能体做什么 | 你做什么 |
|---|---|---|
| 收割证据 | 引用 README、CONTRIBUTING、指令文件、ADR 里已写下的规则作为候选；观察到的事实只变成问题 | 无 |
| 定位 | 最多三问：交付形态、使用者与决策、真实事故 | 选项或自定义回答 |
| 红线 | 对每条候选过三道测试：违反后回滚还是解释、第三人能否一分钟判定、能否举出触发场景 | 列 3 到 7 件绝不能发生的事 |
| 取舍 | 先给证据暗示的冲突轴，再给示例菜单 | 选 2 到 4 条，定偏向、适用条件、例外，确认停止条件 |
| 归属 | 问确认人是谁、现有指令文件与宪法谁赢 | 裁决，并在指令文件加一行指向 |
| 落盘 | 转录确认文本，完备性检查、审查，再用 git log 最近两个改动回测 | 逐条确认文本 |

最小可用版本：宪法 3 到 7 条禁止加一条修改权限，心智模型 2 到 4 条轴加一组停止条件。首版访谈不超过 8 问；你直接口述条款时跳过访谈只做检查。

两份文件常驻注入，每行都是上下文成本。每条规则一句话，不写解释。每次授权修订时顺带合并重复、删解释性文字；删规则或放宽上限由你裁决。

落盘之后：遇到两份文件没覆盖的决策，智能体给一条「待裁决」提议，不自动写入。同类情况第二次出现且你批准，才进入修订。修订在项目现有变更记录中留痕；本仓库使用 [CHANGELOG.md](CHANGELOG.md)。

审查按 BLOCKER / MAJOR / NIT 三档。宪法冲突是 BLOCKER，导致返工或定位偏离是 MAJOR，普通偏好忽略。重要判断附规则位置与原文、候选方案与取舍、决定、验证证据；未验证就写待验证。

## 常见问题

**为什么不直接拦截工具？**
拦截要么能被绕过，要么把每个项目都变成审批流。一个既无法强制又无法关掉的提醒只会训练所有人忽略它。本插件选择把建议写硬、把机制写诚实，并给出项目级退出标记。

**用 CLAUDE.md 或 AGENTS.md 写规则不就够了？**
可以，也应该继续用。区别在于本插件把红线和取舍分成两份、提供建立它们的引导、并在缺失时提示。引导阶段会问清两者冲突时谁赢，建议在指令文件里加一行指向宪法。

**团队项目谁来定立场？**
引导阶段会问确认人是谁并记入变更记录。智能体不替任何人决定价值观；多人意见不一致时它报告冲突并等人裁决。

**和 Spec Kit、superpowers 是什么关系？**
组合，不替代。Spec Kit 负责规格、计划、任务与实现；superpowers 提供两阶段审查。本插件只负责立场层，核心能力不依赖任何外部插件。调研见 [对比报告](SPEC-KIT-COMPARISON.md)，保留为 `0.2.0` 历史快照。

**根目录的两份文件能直接拿来用吗？**
不能。它们是本项目自己的依据，也是一份真实样例；立场要由你的项目自己决定。

## 验证与效果评估

```sh
npm test
claude plugin validate ./plugins/constitution-layer
claude plugin validate ./.claude-plugin/marketplace.json
npm pack --dry-run --json
```

测试涵盖定位与退出、空文件、标记转义、DSH 接线、两套实现一致性，以及各市场对应的独立安装包执行。平台测试只复制插件目录到含中文、空格的临时路径，核对技能、参考文件和 hook 自包含。

`0.3.0` 本地验证使用 Windows、Claude Code `2.1.316`、Codex CLI `0.165.0`。Claude 验证清单；Codex 使用临时 CLI 配置发现本地市场；Node 测试直接执行发布目录中的 hook。没有修改全局安装或 hook 信任，没有运行真实模型会话，也不声称这些是最低支持版本。其他系统与宿主端到端行为尚需实测。

[行为评估场景](evals/README.md) 提供无插件、宿主指令文件、本插件三组对照，共 11 个场景，覆盖红线、合法取舍、普通任务、部分缺失、冲突依据、项目退出、重复问题、只读缺失、写入缺失、非交互缺失、宿主指令冲突。现有机制测试不证明模型遵守率、减少反问或减少返工，行为评估材料未附虚构成绩。

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
docs/plans/                              设计与实施记录
CONSTITUTION.md / MENTAL-MODEL.md        本项目自己的依据
FRICTION-LOG.md                          引导技能的摩擦记录
```

`lib/foundation.js` 与独立 CJS hook 保留两份实现；更改判据时两边同步，parity 测试用于检查漂移。DSH section 使用 `interpolate: false`，避免正文模板字符被宿主插值；渲染错误降级为空并告警。

## 参与开发

改判据先改测试。两份实现任一改动都要让 `npm test` 里的 parity 用例通过。修改根目录两份依据需开发者显式授权并在 CHANGELOG 留痕，这条对本仓库自己同样生效。

遇到技能在真实使用中的失败点，按 [FRICTION-LOG.md](FRICTION-LOG.md) 的格式记现象。同类摩擦出现第二次才改技能。

## 接口依据

- [Claude Code 插件清单](https://code.claude.com/docs/en/plugins-reference)与 [Hooks](https://code.claude.com/docs/en/hooks)。
- [官方 OpenAI 插件打包说明](https://developers.openai.com/plugins/build/plugins)、[Codex Hooks](https://developers.openai.com/codex/hooks)与 [Skills](https://developers.openai.com/codex/skills)。

## License

MIT

---

**English summary.** Constitution Layer keeps two developer-owned files in a coding agent's context: `CONSTITUTION.md` (what is never acceptable) and `MENTAL-MODEL.md` (how to rank acceptable options). It ships as a plugin for DeepSeek Harness, CodeBuddy, Claude Code and Codex, injects the files at session start, and provides a guided skill that helps a developer write them in about fifteen minutes. The developer owns the values; the agent may gather evidence, ask one question at a time, transcribe confirmed wording and report conflicts. It is an advisor, not a gate: it intercepts no tools and does not guarantee compliance.
