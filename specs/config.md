# config — 工厂装配 + 选项解析 + build 注入

> 源码：工厂 [`src/index.ts`](../src/index.ts) + 插件 [`src/plugins/config.ts`](../src/plugins/config.ts) · 插件名 `shopify-theme:config` · 无 `apply`/`enforce`（dev + build 皆生效）

## 职责

两件事，分属两层：

1. **工厂 `shopifyTheme(options)`**（[index.ts:22](../src/index.ts)）—— 只做装配：经 `DEFAULTS` 合并补行为类选项默认、`setDebug` 设 debug 开关、创建空 `Ctx`、按固定顺序返回四个插件。不触碰文件系统、**不读 `process.env`**。
2. **`shopify-theme:config` 插件的 `config` 钩子**（[config.ts:15-45](../src/plugins/config.ts)）—— 真正解析：定位主题路径、校验必填、补 `snippet` 默认、一次性填满 `Ctx`、返回机制必需的 `build` 配置。

## 时机

| 阶段 | 何处 | 行为 |
| --- | --- | --- |
| 工厂调用 | `plugins: [shopifyTheme(...)]` 求值时 | 经 `DEFAULTS` 合并补 `devBranches`/`reload`/`debug` 默认（[index.ts:14-24](../src/index.ts)），返回插件数组 |
| `config` 钩子 | Vite 启动最早期（dev/build 都跑） | 解析并填 `Ctx`（含 `snippet` 默认 `vite-mixer.liquid`），返回 `{ build }` |

`config` 是注入 `build` 配置、并在下游 `check`/`reload`/`mixer` 读 `Ctx` 前填满它的最早时机——这是把主题路径解析与必填校验放在 `config` 插件（而非完全在工厂体）的原因（[config.ts:16-24](../src/plugins/config.ts)）。注：本插件不读 `process.env`，故无 `loadEnv`，解析不依赖 `mode`。

## 输入

- `options`（见根 README 选项表）；`themePath`/`entry`/`snippet`/`devBranches`/`reload`（`root` 已非 option，取自 Vite `config.root`）。
- 本插件**不读 `process.env`**：`themePath`/`entry` 必填，由宿主从 env（`THEME_NAME` / 根 `.env` 的 `VITE_LIVE_ENTRY`）读取后经选项传入；`debug` 同理（原 `DEBUG` 环境变量）。

## 输出与副作用

1. **填充 `Ctx`**（[config.ts:24](../src/plugins/config.ts)）：`Object.assign(ctx, { root, themePath, entry, snippet })`，一次写满，下游只读。
2. **返回 `build` 配置**（[config.ts:29-44](../src/plugins/config.ts)）：

   | 字段 | 值 | 为什么 |
   | --- | --- | --- |
   | `outDir` | `<themePath>/assets` | 产物直接落进主题资源目录 |
   | `emptyOutDir` | `false` | outDir 即主题 `assets/`，清空会抹掉主题既有资源 |
   | `minify` | `false` | 产物不压缩（源码未注明动机，勿臆断；改动前先确认） |
   | `rolldownOptions.input` | `{ "vite-mixer": <root>/<entry> }` | 入口 key = `vite-mixer`，故产物名 `vite-mixer.js`，与默认 snippet 同名族 |
   | `output.entryFileNames`/`chunkFileNames` | `[name].js` | 扁平、稳定、无 hash 目录——Shopify `assets/` 不支持子目录 |
   | `output.assetFileNames` | `[name].[ext]` | 同上，扁平命名 |

   > **不注入 `build.manifest`**：mixer 改在 `generateBundle` 直接读 bundle 元数据，无需 manifest 文件中转（[config.ts:34](../src/plugins/config.ts)，详见 [mixer.md](./mixer.md)）。

## 不变量

1. `themePath` 缺失（无 `options.themePath`）→ **抛错中止**（[config.ts:19、49-53](../src/plugins/config.ts)）。
2. `entry` 缺失（无 `options.entry`）→ **抛错中止**（[config.ts:20、49-53](../src/plugins/config.ts)）。
3. `Ctx` 由本钩子**唯一**写入，且早于所有读者钩子（见 [context.md](./context.md)）。
4. 注入的 `build` 是「主题路径派生 + 机制必需」的最小集，不含 `alias`/`server`。

## 设计决策与理由

- **为什么主题路径解析与必填校验放在 `config` 钩子而非工厂体** —— `config` 是注入 `build`、并在下游钩子读 `Ctx` 前填满它的最早时机；工厂体只做装配（[index.ts:22-36](../src/index.ts)）。本插件不读 `process.env`，故无 `loadEnv`，不依赖 `mode`。
- **为什么工厂直接返回四插件，而非在 `config` 里动态注入** —— Vite 运行 `config` 钩子时**已解析完用户插件数组**，此时再返回 `plugins` 不会被接纳。所以子插件必须在工厂阶段就进入数组（[index.ts:30-35](../src/index.ts)）。这条约束决定了整个「一个工厂返回一组插件」的架构形态。
- **为什么只注入 `build`，不碰 `alias`/`server`** —— 职责切分：插件管 Shopify 接入机制，`resolve.alias` 与 `server`（含端口）属工程级配置，留给外层根 `vite.config.ts`（[config.ts:27-28](../src/plugins/config.ts)）。端口因此单一来源，避免插件与宿主各设一份。

## 边界 / 已知约束

- `config` 钩子返回的对象会被 Vite 与用户配置**深合并**；本插件只声明自己负责的字段，其余空缺即沿用用户配置。
- 本插件不再 `loadEnv`；env 的读取（根 `.env` 的 `VITE_LIVE_ENTRY`、主题侧 `<theme>/.env` 的 `VITE_LIVE_PORT`）全部由外层 `vite.config` 完成后传入。
