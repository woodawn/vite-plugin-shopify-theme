# context — 四插件共享态 Ctx 的填充→读取契约

> 源码：[`src/types/index.ts`](../src/types/index.ts)

## 职责

`Ctx` 是工厂内四个插件之间**唯一的通信通道**。把「选项」解析成一份规整事实，解析一次、各插件共享，避免每个插件各自重复解析导致的不一致。（插件不读 `process.env`；env 由宿主读后经选项传入。）

## 字段（[types/index.ts:4-13](../src/types/index.ts)）

| 字段 | 含义 | 由谁用 |
| --- | --- | --- |
| `root` | 项目根（含 `vite.config.ts`、`src/`） | config、reload |
| `themePath` | 主题绝对路径 = `root/theme` | check、reload、mixer |
| `entry` | 入口（相对 `root`） | config、mixer（dev 多入口回退） |
| `snippet` | 生成的 mixer snippet 文件名 | config、reload（跳过判定）、mixer |

## 填充→读取契约

- **唯一写者**：`shopify-theme:config` 的 `config` 钩子，`Object.assign(ctx, …)` 一次性填满（[config.ts:24](../src/plugins/config.ts)）。
- **读者及其钩子**：check `buildStart`、reload `configureServer`、mixer `configureServer`/`generateBundle`。
- **为什么读取安全**：Vite 钩子序中 `config` 最早执行，早于上述所有钩子；故读 `Ctx` 时必已就绪（[types/index.ts:1-3](../src/types/index.ts)）。

## 不变量

1. `Ctx` 只在 `config` 钩子写入，下游**只读**。
2. 任何读 `Ctx` 的钩子都必须晚于 `config`。
3. 工厂用 `{} as Ctx` 起步——**填充前字段为 `undefined`**，类型上的 `as Ctx` 只是断言，不是运行时保证。

## 设计决策与理由

- **为什么用一份共享对象，而非各插件各自解析** —— 路径、入口、snippet 名、端口来源都需单一权威；集中在 config 解析一次，杜绝多份解析漂移。
- **为什么以空对象起步，靠 config 回填** —— `Ctx` 含主题路径等派生字段，需在注入 `build` 配置、且下游钩子读取前由 `config` 钩子统一填好；工厂体只做装配（本插件不读 `process.env`，无 `loadEnv`/`mode` 依赖）。见 [config.md](./config.md)。

## 边界 / 已知约束

- **新增早于 `config` 的钩子是陷阱**：若某个新钩子在 `config` 之前读 `Ctx`，会读到空对象。新增读取点务必确认其钩子晚于 `config`。
- `Ctx` 无运行时校验；必填项（`themePath`/`entry`）的缺失检查在 config 钩子内完成（见 [config.md](./config.md) 不变量），不在此类型层。
