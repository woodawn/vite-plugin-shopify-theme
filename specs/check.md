# check — dev 下校验主题仓库的 git 分支前缀

> 源码：[`src/plugins/check.ts`](../src/plugins/check.ts) · 插件名 `shopify-theme:check` · `enforce: 'pre'` · `apply: 'serve'`

## 职责

仅在 `vite`（dev）启动时，校验**主题仓库自身**（`ctx.themePath`）当前 git 分支是否以约定前缀列表（默认 `["dev"]`）中**任一**前缀开头；不符即抛错，**阻断 dev 启动**。这是一道「别在错误分支上连真实店铺」的安全闸——`shopify theme dev` 会连接并同步到 `shopify.theme.toml` 指向的真实店铺。

## 时机

| 钩子 | 何时 | 行为 |
| --- | --- | --- |
| `buildStart`（[check.ts:16](../src/plugins/check.ts)） | dev 启动期 | `branches === false` 直接返回；否则 `checkGitBranch(ctx.themePath, branches)` |

`apply:'serve'` 使本插件**在 `vite build` 时整体不加载**——生产构建绝不会被分支校验拦住（[check.ts:9-10](../src/plugins/check.ts)）。`enforce:'pre'` 让它尽量早执行。

## 输入

- `ctx.themePath` —— 被校验的仓库路径（主题，而非插件仓库本身）。
- `branches: string[] | false` —— 来自工厂的 `options.devBranches ?? ["dev"]`；`false` 关闭校验。

## 输出与副作用

- 无文件写入。仅**读** git 元数据：先定位 `.git`（目录直接用，文件则解析 `gitdir:` 重定向），再读其中的 `HEAD`（[check.ts:34-64](../src/plugins/check.ts)）。
- 校验失败 → `throw new Error(...)`，中止 dev 启动。

## 校验逻辑（[check.ts:25-64](../src/plugins/check.ts)）

1. 定位 git 目录（[check.ts:48-64](../src/plugins/check.ts)）：`<themePath>/.git` 为目录直接用；为文件则解析 `gitdir: <path>` 重定向（linked worktree / submodule，path 可相对 `repoPath`）；`.git` 缺失 / 形态异常 → 抛 `[shopify-theme] dev branch check failed: no git repo …`（或 `… malformed .git file …`）。
2. 读该 git 目录下的 `HEAD` 并 `trim()`。若以 `"ref: refs/heads/"` 开头（正常在分支上）→ 剥离该前缀取**完整分支名**（分支名本身可含 `/`，如 `dev/foo`，故不能 `split("/")` 取末段）；若**不以任一** `branches` 前缀开头 → 抛 `[shopify-theme] dev branch check failed: current "<x>", need <p1 | p2 | …>`。
3. 否则（HEAD 不是分支 ref，通常是 detached HEAD / 裸 commit）→ 抛 `[shopify-theme] dev branch check failed: not on a branch at <themePath>`。

## 不变量

1. `branches === false` 时**完全跳过**，不读文件、不抛错（[check.ts:17](../src/plugins/check.ts)）。
2. 前缀匹配用 `startsWith`、对象是**完整分支名**，列表**任一命中即通过**：默认 `["dev"]` 下 `dev`、`dev-foo`、`develop`、`dev/foo` 均通过；`main`/`feat-x` 被拒，`feat/dev` 也被拒（末段碰巧叫 `dev` 不算）。
3. `branches: []`（空列表）任何分支都不通过——空白名单 = 全拒；要关闭校验须显式传 `false`。
4. build 永不加载本插件（`apply:'serve'`）。

## 设计决策与理由

- **为什么直接读 `HEAD` 而非跑 `git` 命令** —— 轻量、无子进程、不依赖 PATH 里的 git；分支名解析对 HEAD 文件格式而言足够（`.git` 为文件时先解析 `gitdir:` 重定向再读）。
- **为什么 `apply:'serve'`** —— 校验只对「即将连店铺的 dev」有意义；生产构建在 CI 任意分支都该能跑，故 build 不加载（[check.ts:9-10](../src/plugins/check.ts)）。
- **为什么 `enforce:'pre'`** —— 让校验在其它插件逻辑之前发生，尽早失败。
- **为什么校验 `ctx.themePath` 而非插件仓库** —— 危险的是主题源码所在仓库的分支状态（它决定推往店铺的内容），所以校验对象是主题仓库。

## 边界 / 已知约束

- 依赖主题是一个 **git 仓库**（普通仓库，或 `.git` 为文件的 linked worktree / submodule）；非 git 仓库 / `.git` 形态异常时抛**受控**的 `[shopify-theme]` 前缀错误，不再逃逸裸 `ENOENT`。
- detached HEAD 会被判为「不在分支上」而拒绝——这是有意从严。
- 仅前缀匹配，不校验远端、不校验工作区是否干净。
