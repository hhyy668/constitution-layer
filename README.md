# constitution-layer

给 AI 编码智能体加一层**项目专属的判断依据**。

## 它补的是什么缺口

现有的技能体系（比如 [superpowers](https://github.com/obra/superpowers)）管的是「**怎么做事**」——
先设计再动手、TDD、系统化调试、任务之间做代码审查。这些是**流程纪律**。

但它不管「**这个项目凭什么存在**」：

- 什么绝对不能做？
- 两种做法都对时，优先保哪个？
- 这个功能值得做吗，还是应该砍掉？

缺了这层，智能体遇到分歧只能反问你，把认知负担原样甩回给开发者。
更糟的是，它可能产出一堆看起来很完整、但方向从未被验证过的东西。

## 两个文件

| 文件 | 回答的问题 | 例子 |
|---|---|---|
| `CONSTITUTION.md` | 什么能做、什么不能做 | 「不向第三方发送用户数据」 |
| `MENTAL-MODEL.md` | 遇到冲突时怎么决策 | 「完备 > 速度」「严格 > 授权」 |

两份都由**开发者本人**制定 —— 它们是立场，不是能推导出来的结论。
智能体只负责引导和完备性检查，**不代笔**。

因为只有真正清楚产品定位的人，才写得出来。

## 安装

同一个仓库，两种平台 —— 仓库根既是 DSH bundle，也是 CodeBuddy 插件市场。

### DeepSeek Harness

侧边栏 **Plugins** 页可以直接选，或者让智能体调用 `plugin_manager`：

```
action: install_bundle
target: github:hhyy668/constitution-layer
```

开发时指向本地克隆即可（`link:` 走本地目录，改动立即生效）：

```
action: install_bundle
target: link:/绝对路径/constitution-layer
```

装完立即生效，不需要重启。卸载用 `action: remove_bundle`，`target: constitution-layer`。

### WorkBuddy / CodeBuddy

```
# 1. 添加市场（指向本仓库）
/plugin marketplace add <owner>/<repo>

# 2. 安装插件
/plugin install constitution-layer@<marketplace-name>
```

`<marketplace-name>` 取自 `.codebuddy-plugin/marketplace.json` 的 `name` 字段。
也可以只跑 `/plugin` 打开管理器，从列表里直接选。

安装后，打开任意项目都会自动生效。

## 它怎么工作

1. **会话启动时**自动向上逐级查找项目根，注入该项目的两份文件
2. **缺失时**明确提示，并说明为什么必须先补齐才能开工
3. **`constitution-brainstorm` 技能**引导你从零建立 —— 一次只问一个问题，取舍方向由你给
4. 产出后走审查（BLOCKER / MAJOR / NIT 三档），收敛后才进入常规流程

### 两个平台的注入点

| 平台 | 注入方式 | 时机 |
|---|---|---|
| WorkBuddy / CodeBuddy | `SessionStart` 钩子（`hooks/session-start.js`） | 会话启动时注入一次 |
| DeepSeek Harness | 常驻 prompt section（`lib/index.js`） | 每次装配重读，压缩、恢复、子会话都自然带上 |

DSH 侧注册 section 时带 `interpolate: false`：DSH 的 runtime context 会对正文做
`{{变量}}` 插值，未知变量直接让整次装配抛错。宪法是用户可自由编辑的正文，
按原样注入才不会因为里面出现 `{{...}}` 而炸掉会话。

DSH 侧的技能由插件包自行注册，**不依赖** `@deepseek-ai/dsh-skill-filesystem` ——
后者在多数 profile 里默认是关的。

### 为什么不是一份文件

因为两者**加载时机不同**：

- 宪法要**常驻**（每次会话都需要）→ 必须极短，否则没人读
- 心智模型是**查表**（遇到决策时才需要）→ 可以稍长

合成一份会同时污染两者：要么太厚没人读，要么太薄不够用。

### 一个宪法长什么样

每条规则要能判定是否被违反，所以不写「要写好代码」，写：

```markdown
## 绝不做
| 禁止 | 原因 |
|---|---|
| 把私有假设写进技能 | 私有信息、内部路径、真实项目名 |
| 缺宪法就开工 | 无判断依据时智能体只能反问 |

## 停止原则
无人在场时，一律停下等待，不放行、不降级。
「本轮不需要」不构成豁免理由。
```

## 与 superpowers 的关系

**组合，不是依赖。**

本插件不 fork、不改写、不复制上游任何技能内容。
它只做上游不做的那两件事：**开工前的合法性检验** 与 **判断依据的持久化**。

**没装 superpowers 也能完整使用** —— 本插件的核心能力不依赖任何外部插件。
装了则可以在后续审查环节沿用它的两阶段流程。

## 兼容性

| 平台 | 状态 |
|---|---|
| WorkBuddy / CodeBuddy | 原生支持（`.codebuddy-plugin` 市场清单 + `SessionStart` 钩子） |
| DeepSeek Harness | 原生支持（本仓库即 bundle：`package.json` 的 `dsh.bundle` + `cordis.patch.yml` + `lib/index.js`） |
| Claude Code | 插件格式同源（`.claude-plugin`），钩子事件结构一致 —— 理论上可直接使用，**未实机验证** |
| 其它智能体 | 技能部分（`SKILL.md`）可直接复用；钩子需按各家机制适配 |

DSH 与 CodeBuddy 共用同一份 `SKILL.md`，两条注入路径各自独立：
装了 DSH bundle 就走 prompt section，装 CodeBuddy 插件就走钩子，互不干扰。

## 目录结构

```
├── package.json                            DSH bundle 清单（dsh.bundle.patch → cordis.patch.yml）
├── cordis.patch.yml                         DSH 侧装载条目
├── lib/
│   ├── index.js                            DSH 插件入口：常驻 section + 注册技能
│   └── foundation.js                       判断依据的定位与渲染（纯逻辑，可单测）
├── test/foundation.test.mjs                判据测试
├── CONSTITUTION.md                         ← 本项目自己的宪法（见下方说明）
├── MENTAL-MODEL.md                         ← 本项目自己的心智模型
├── FRICTION-LOG.md                         ← 使用中的摩擦记录
├── .codebuddy-plugin/marketplace.json      CodeBuddy 市场清单
└── plugins/constitution-layer/             CodeBuddy 插件包
    ├── .codebuddy-plugin/plugin.json
    ├── hooks/
    │   ├── hooks.json                     注册 SessionStart
    │   └── session-start.js               注入判断依据 + 缺失检查
    └── skills/constitution-brainstorm/
        ├── SKILL.md                       引导流程（两个平台共用）
        └── references/                    完备性检查判据 / 审查判据
```

两套平台的清单文件互不引用：DSH 只看根目录的 `package.json` / `cordis.patch.yml` / `lib/`，
CodeBuddy 只看 `.codebuddy-plugin/` 与 `plugins/constitution-layer/`。
`lib/foundation.js` 与 `hooks/session-start.js` 是同一套判据的两份实现 ——
改判据时两边都要动，`test/foundation.test.mjs` 覆盖的是 DSH 侧那份。

根目录那三份文件不是模板，是**这个项目自己在用的**——本插件对自己生效（dogfooding）。
它们是活的示例，可以直接拿来参考该写成什么样。
用户项目里的两份文件是各自独立生成的，不来自这里。

## 设计取向

- **机械判据优先于裁量** —— 依赖缺失即停，不给智能体「本轮用不到所以跳过」的解释空间
- **规则要能判定** —— 无法验证的条款等于没有
- **精简是硬约束** —— 宪法 50 行、心智模型 100 行封顶；超限时放宽上限而不是砍内容
- **规则靠实测长出来** —— 每条防护都对应一次真实复现过的失败

## License

MIT
