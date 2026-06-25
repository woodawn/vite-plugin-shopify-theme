# reload — 监听主题源码目录，liquid/json 变更整页刷新

> 源码：[`src/plugins/reload.ts`](../src/plugins/reload.ts) · 插件名 `shopify-theme:reload` · `apply: 'serve'`

## 职责

dev 下监听主题的源码目录，任一文件（`.liquid`/`.json` 等）变更时向浏览器发 `full-reload`，触发整页刷新。补上 Vite 原生 HMR 的盲区——主题模板不在 Vite 模块图里，原生 HMR 触达不到。

## 时机

| 钩子 | 行为 |
| --- | --- |
| `configureServer`（[reload.ts:31](../src/plugins/reload.ts)） | 计算监听目录 → `server.watcher.add(dirs)` → 注册 `change`/`add`/`unlink` 回调 |

`apply:'serve'`，build 不加载。

## 输入

- `ctx.themePath`、`ctx.root`、`ctx.snippet`。
- `extra: string[]` —— 来自 `options.reload ?? []`，额外监听目录（相对 `root`）。

## 监听范围

- **默认目录**（相对 `themePath`，[reload.ts:14-23](../src/plugins/reload.ts)）：`sections` `blocks` `snippets` `templates` `layout` `config` `locales` `assets`。
- **额外目录**（相对 `root`）：`extra` 逐项 `join(root, p)`。
- 全部经 `normalize` 规整后 `server.watcher.add`（[reload.ts:32-39](../src/plugins/reload.ts)）。

## 输出与副作用

- `change`/`add`/`unlink` 命中监听目录 → `server.ws.send({ type: 'full-reload', path: '*' })`（[reload.ts:49](../src/plugins/reload.ts)），并 `log.info` 相对路径。
- 不写文件。

## 命中判定（[reload.ts:41-51](../src/plugins/reload.ts)）

1. 变更文件 `normalize` 后，若**不在**任一监听目录下（`f.startsWith(d + sep)`）→ 忽略。`+ sep` 确保按目录边界匹配，`assets` 不会误命中 `assets-foo`。
2. 若文件名以 `<sep><ctx.snippet>` 结尾（即自生成的 mixer snippet）→ **跳过**。

## 不变量

1. **必须跳过 `ctx.snippet` 自身**（[reload.ts:48](../src/plugins/reload.ts)）：mixer 启动时会写这个 snippet，watcher 的 `add`/`change` 会捕获；不跳过就会在启动时多刷一次，甚至形成写→刷→写循环。
2. `assets` 纳入监听**不会**触发 reload 循环：dev 下 Vite 不向 `outDir` 写产物（[reload.ts:12](../src/plugins/reload.ts)），故 `assets` 内无构建写入扰动。
3. **`assets` 的事件可达依赖 config 插件注入的 `emptyOutDir: false`**（[config.ts:32](../src/plugins/config.ts)）：Vite 仅在 emptyOutDir 为真时把 `outDir/**` 加入 chokidar 的 `ignored`，且 `ignored` 对显式 `watcher.add` 的路径同样生效——一旦改回 true，`assets` 变更将收不到任何 watch 事件，reload 静默失效。
4. build 不加载本插件（`apply:'serve'`）。

## 设计决策与理由

- **为什么复用 `server.watcher` 而非另起 watcher** —— Vite dev server 已持有一个 chokidar 实例；复用它避免第二个文件监听器的资源与一致性开销（[reload.ts:25](../src/plugins/reload.ts)）。
- **为什么用文件级 watch + 整页刷新，而非 HMR** —— 主题 `.liquid` 不在 Vite 模块图，`handleHotUpdate` 不会被触发；且 liquid 由 Shopify 服务端渲染，无法局部热替换，只能整页刷新（[reload.ts:26](../src/plugins/reload.ts)）。
- **为什么保留 `watcher.add`，尽管宿主形态下冗余**（[reload.ts:36-39](../src/plugins/reload.ts)）—— 宿主把 `themePath` 拼为 `root` 下子目录（`join(root, theme)`）传入，恒在 root 内，而 Vite 对 root 的递归 watch 已覆盖默认目录，add 实为冗余；但通用插件不应依赖"主题在 root 内 + Vite watch root"这两个宿主事实（后者在 `experimental.bundledDev` 下不成立），保留 add 成本为零。共享 watcher 的事件来自整个 root，真正把 reload 限定在主题源码内的是命中判定的前缀过滤，不是 add。
- **为什么 `extra` 相对 `root` 而默认目录相对 `themePath`** —— 默认目录是标准主题结构（在主题内）；`extra` 多用于主题外的工程目录，故相对项目根更自然。

## 边界 / 已知约束

- 整页 `full-reload` 而非精细 HMR：改一处 liquid，整页重载。
- 仅监听目录列表内的变更；主题新增的非标准顶层目录需经 `options.reload` 追加。
