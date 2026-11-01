# 判断依据完善与跨平台插件 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 完善判断依据规则及退出范围，并提供 Claude Code、Codex 可安装插件。

**Architecture:** 共享插件目录与 CJS hook，DSH 保留 ESM 实现和宿主接线。各平台有独立清单，测试验证范围与安装包自包含。

**Tech Stack:** Node.js >=22、node:test、JSON 插件清单、Markdown 技能与文档。

---

## Task 1：范围退出回归

文件：`test/foundation.test.mjs`、`test/parity.test.mjs`、`lib/foundation.js`、`plugins/constitution-layer/hooks/session-start.cjs`。

1. 写根退出标记被子层依据遮蔽的失败测试，同时覆盖 `.git` 指针、嵌套仓库独立、近层依据选择。
2. 运行 `node --test test/foundation.test.mjs test/parity.test.mjs`，确认退出遮蔽场景因现状失败。
3. 解析时记录最近依据目录，继续扫描到边界，范围内任一退出标记优先。
4. 同命令应全部通过；保留两套实现的独立预期与 parity 断言。

## Task 2：Claude Code 与 Codex 分发

创建：`.claude-plugin/marketplace.json`、`.agents/plugins/marketplace.json`、`plugins/constitution-layer/.claude-plugin/plugin.json`、`plugins/constitution-layer/.codex-plugin/plugin.json`、`plugins/constitution-layer/hooks/codex.json`、`test/platforms.test.mjs`。

修改：`plugins/constitution-layer/hooks/hooks.json`、现有平台清单和 `package.json`。

1. 测试从平台市场定位插件、读取技能、解析 hook 命令，并在仅复制插件目录的带空格中文路径执行注入。
2. 新平台缺少市场清单时测试应失败；观察后添加清单。
3. Codex 单独 hook 配置使用 `${PLUGIN_ROOT}` 与显式上下文预算；Claude / CodeBuddy 使用标准 hook。
4. 核对版本一致、所有引用位于插件根内；执行 CLI 原生验证与 `npm pack --dry-run --json`。

## Task 3：治理与初始化技能

修改：`CONSTITUTION.md`、`MENTAL-MODEL.md`、`plugins/constitution-layer/skills/constitution-brainstorm/SKILL.md` 及 `references/`。

1. 按开发者本轮授权修正独立定位与重复问题的权限边界，不生成新价值观。
2. 澄清转录与价值代笔的区别；依据齐备直接继续，缺任一才补齐，不重访已确认内容。
3. 同步流程图、跨平台定位说明；补决策证据格式与明确适用的取舍判据。
4. 人工交叉审查冲突、权限与引用；核对宪法 50 行、心智模型 105 行预算。

## Task 4：文档、行为场景与收尾

修改：`README.md`；创建 `CHANGELOG.md`、`evals/README.md` 与行为场景定义。

1. 写四个平台的准确安装与卸载命令、技能调用、hook 信任和真实验证状态。
2. 提供三组对照条件及可复跑场景，不写未经运行的模型效果结论。
3. 运行 `npm test`、官方清单验证、包内容核查、`git diff --check`。
4. 请求独立代码审查，解决 BLOCKER / MAJOR，最后重新运行相关检查。

本轮在当前工作区顺序实施，不自动提交、发布或修改使用者全局配置。原始对比报告保留为历史基线。

## 实施记录

- Task 1 完成：新退出场景先观察到两个断言失败，修复后通过；保留最近依据和嵌套仓库边界。
- Task 2 完成：新平台缺清单与 fork 匹配场景先失败，接入后三个平台独立包执行通过；Codex 原生市场发现成功。
- Task 3 完成：治理权限、齐备直接继续、部分缺失保留现有文件、取舍与红线区别及证据格式已同步；中文内容与篇幅核验通过。
- Task 4 完成：安装说明、变更记录与七个行为场景已提供；49 项测试通过，独立审查无 BLOCKER / MAJOR。
- 尚未执行：真实宿主模型会话与行为对照、发布和远程安装；这些不作为本轮已验证结果。
