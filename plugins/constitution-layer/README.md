# Constitution Layer

由开发者确定项目红线与取舍，在宿主 SessionStart 时读取项目的 `CONSTITUTION.md` 和 `MENTAL-MODEL.md`，并提供 `constitution-brainstorm` 引导技能。

本目录是自包含插件包，支持 CodeBuddy、Claude Code 与本地 Codex 插件环境。需要 Node.js 22+。Codex hooks 须在宿主 `/hooks` 中审阅并信任；安装插件不自动授权脚本。

依据齐备的常规任务直接遵守；缺失或开发者明确要求修订时才进入初始化引导。智能体可以转录已确认文本，不能自行决定价值条款。

项目根 `NO-CONSTITUTION.md` 会覆盖该 Git 项目中的子目录依据；嵌套 Git 仓库独立。标记只能由开发者主动选择创建。

插件不拦工具，不保证模型遵守规则。文件改变后，在 hook 宿主中重新开始会话或显式读取当前文件。

完整安装说明、边界与验证记录：[项目仓库](https://github.com/hhyy668/constitution-layer)。本包不附带用户项目的治理模板。

Claude Code 市场安装：

```text
/plugin install constitution-layer --marketplace hhyy668/constitution-layer
```

Constitution Layer keeps project constraints and decision priorities visible to coding agents.
The developer owns the values; the agent may transcribe confirmed wording and report conflicts.
Existing project foundations are reused without another initialization interview.
This plugin supplies guidance and does not intercept tools or guarantee model compliance.
