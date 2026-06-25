# vite-plugin-shopify-theme — 设计规格（specs）

> 本目录是**面向维护者**的设计契约，回答「每个部件应当做什么、为什么这么设计、改动时不能破坏什么」。
> 面向**使用者**的「怎么用」见仓库根 [`README.md`](../README.md)；本目录刻意不重复用法，只记录契约、不变量与决策理由。
> 规格与源码若出现不一致，**以源码为准**，并应回头修正本目录。

## 一句话定位

一个工厂函数 `shopifyTheme(options)` 返回**一组 Vite 插件**，把**结构不变的标准 Shopify 主题**接入 Vite：开发态提供真·HMR dev server，生产态把构建产物经 bundle 元数据改写注入成主题 snippet。UI 库（Tailwind / UnoCSS / …）不绑定，由宿主项目自行接入。

## 要解决的根本矛盾

Shopify 主题以 `.liquid` 为模板，由 Shopify 服务端渲染：

1. **`.liquid` 不在 Vite 的模块图里** —— Vite 原生 HMR（`handleHotUpdate`）触达不到主题模板，改 liquid 不会刷新。
2. **生产产物必须用 `asset_url` 引用** —— 不能像普通 web 应用那样写死 `<script src>`，资源要走 Shopify CDN（缓存破除由 `asset_url` 的版本参数承担，产物名因此固定无 hash）。
3. **Shopify `assets/` 目录不支持子目录** —— Vite 默认的 `assets/[hash]` 这种嵌套结构无法直接落进主题。

本插件就是把这三道缝缝起来。核心产物是一个**自动生成的 snippet**（默认 `snippets/vite-mixer.liquid`），dev 写本地 dev server 的 script、build 写 CDN 的 `asset_url` tag，并用一个 `dev_mode` 变量让 `layout/theme.liquid` 分流。

## 主要功能

### dev 开发态

- 仅 dev：校验主题仓库 git 分支前缀，不符即阻断启动。
- 生成 `snippets/vite-mixer.liquid`，dev 写本地 dev server script
- 监听主题源码目录，liquid/json 变更触发 full-reload。

### build 生产态

- 打包静态资源到主题根目录，不支持子目录。
- snippet 生成 `snippets/vite-mixer.liquid`，build 写 CDN tag 的 snippet。

## 架构：一个工厂 + 四插件 + 两支撑模块

工厂 [`shopifyTheme()`](../src/index.ts) 不做实事，只**装配**——解析选项默认值，按固定顺序返回四个插件；四插件经一份共享态 [`Ctx`](./context.md) 串联。

| 部件               | 源码                                                    | 插件名                   | 角色                                                              |
| ------------------ | ------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------- |
| 工厂 + config 插件 | [`src/index.ts`](../src/index.ts) + [`src/plugins/config.ts`](../src/plugins/config.ts) | `shopify-theme:config`   | 解析选项、填充 `Ctx`，注入机制必需的 `build` 配置（不读 env）     |
| 分支预检           | [`src/plugins/check.ts`](../src/plugins/check.ts) | `shopify-theme:check` | 仅 dev：校验主题仓库 git 分支前缀，不符即阻断启动                 |
| 整页刷新           | [`src/plugins/reload.ts`](../src/plugins/reload.ts)     | `shopify-theme:reload`   | 仅 dev：监听主题源码目录，liquid/json 变更触发 full-reload        |
| 混入器             | [`src/plugins/mixer.ts`](../src/plugins/mixer.ts)   | `shopify-theme:mixer`    | dev 写 dev-server script、build 读 bundle 元数据写 CDN tag 的 snippet |
| 共享态             | [`src/types/index.ts`](../src/types/index.ts)                   | —                        | `Ctx` 接口：config 填充、其余插件读取                             |
| 日志               | [`src/utils/log.ts`](../src/utils/log.ts)               | —                        | 复用 Vite Logger 的分域日志，`options.debug` 充当 debug 开关      |

逐部件契约见下方[文档索引](#文档索引)。

## 加载矩阵：谁在什么命令下生效

Vite 按 `enforce` 给插件排序（`pre` → 无标记（数组顺序）→ `post`），按 `apply` 决定是否在某命令下加载。

| 插件                     | `enforce` | `apply` | dev（`vite`）     | build（`vite build`） |
| ------------------------ | --------- | ------- | ----------------- | --------------------- |
| `shopify-theme:check` | `pre`     | `serve` | ✅ 校验分支       | ⬜ 不加载             |
| `shopify-theme:config`   | —         | —       | ✅ 注入 build     | ✅ 注入 build         |
| `shopify-theme:reload`   | —         | `serve` | ✅ 整页刷新       | ⬜ 不加载             |
| `shopify-theme:mixer`    | `post`    | —       | ✅ 写 dev snippet | ✅ 写生产 snippet     |

- **dev 实际执行序**：`check`(pre) → `config` → `reload` → `mixer`(post)，与工厂返回顺序一致。
- **build 实际执行序**：`config` → `mixer`(post)；`check`/`reload` 因 `apply:'serve'` 整体不加载，**故对生产构建零影响**——分支校验绝不会拦住 CI 构建。

## 生命周期时序

### dev（`vite` + 并行 `shopify theme dev`）

```
config 钩子(config)        → 解析选项，填充 Ctx，注入 build 配置
buildStart(check)       → 读 <theme>/.git/HEAD 校验分支；不符 throw，阻断启动
configureServer(reload)    → server.watcher.add(主题目录)，注册 change/add/unlink
configureServer(mixer)     → httpServer 'listening' 时，按实际监听地址（端口+主机名）写 dev snippet(dev_mode=true)，首行注入 /@vite/client
─── 运行中 ───
  主题 .liquid/.json 变更  → reload 发 full-reload，整页刷新
  src 下 .ts/.css 变更     → Vite 原生 HMR
```

### build（`vite build --mode shopify`）

```
config 钩子(config)   → 填充 Ctx，注入 build：outDir=<theme>/assets, 单入口 vite-mixer
（Vite 产出）          → 产物写入 <theme>/assets/
generateBundle(mixer) → 读 bundle 元数据（entry chunk fileName + viteMetadata.importedCss），改写为 asset_url script + stylesheet_tag 写回 snippet(dev_mode=false)
```

> `layout/theme.liquid` 据 `dev_mode` 与 `request.design_mode` 分流：编辑器走 `theme-editor`，前台 dev/build 都走生成出的 `vite-mixer`。

## 共享态 Ctx 的填充→读取契约

`Ctx`（`root` / `themePath` / `entry` / `snippet`）是四插件之间唯一的通信通道。

- **唯一写者**：`shopify-theme:config` 的 `config` 钩子，`Object.assign(ctx, …)` 一次性填满。
- **读者**：`check`(`buildStart`)、`reload`(`configureServer`)、`mixer`(`configureServer`/`generateBundle`)。
- **为什么安全**：Vite 钩子里 `config` 最早执行，早于上述所有钩子，故读取时 `Ctx` 必已就绪。工厂创建的是空对象 `{} as Ctx`，**在 config 钩子运行前读取会得到空值**——任何新增钩子若早于 config，都会踩坑。详见 [context.md](./context.md)。

## 选项契约（缺失行为视角）

用法表见根 README；这里只记录**谁消费、缺失时怎样、默认从哪来**。**本插件不读 `process.env`**：`themePath`/`entry`/`debug` 等均经选项传入，env 的读取在宿主 `vite.config` 完成。

| 来源                                | 键                     | 消费者                                        | 缺失行为                         |
| ----------------------------------- | ---------------------- | --------------------------------------------- | -------------------------------- |
| `options.themePath`（必填）         | 主题目录绝对路径       | config → `ctx.themePath`                      | **抛错**，启动中止               |
| `options.entry`（必填）             | 构建入口               | config → `rolldownOptions.input`                | **抛错**，启动中止               |
| `config.root`（Vite 自身，非 option） | 项目根               | config，缺省回退 `process.cwd()`              | 用 Vite 默认                     |
| `options.snippet`                   | 生成的 snippet 文件名  | config/reload/mixer，默认 `vite-mixer.liquid` | 用默认                           |
| `options.devBranches` ← 默认 `["dev"]` | 分支前缀列表（任一命中），`false` 关闭 | check                                  | 用默认 `["dev"]`                 |
| `options.reload`                    | 额外 reload 目录       | reload，默认 `[]`                             | 用默认空                         |
| `VITE_LIVE_PORT`                    | dev 端口               | **外层 vite.config 的 `server.port`**         | 本插件不读；mixer 取实际监听端口 |
| `options.debug`                     | debug 日志开关         | log，`true` 才打印（插件不读 `DEBUG`）        | 静默（`false`）                  |

## 职责边界（刻意的切分）

| 关注点                                         | 归属                                    | 理由                                                                                      |
| ---------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `build`（outDir/input/产物命名）      | **本插件**                              | 主题路径派生 + 机制必需，使用者不该手写                                                   |
| `resolve.alias`、`server`（含端口）            | **外层根 `vite.config.ts`**             | 工程级配置，端口单一来源；插件只管 Shopify 接入机制                                       |
| UI 库（`@tailwindcss/vite` / `unocss/vite` …） | **宿主项目**                            | 不绑定任何 UI 方案，宿主自选自接                                                          |
| zip 打包                                       | **Shopify CLI** `shopify theme package` | 本插件已移除打包能力，不再承担                                                            |
| 在 `config` 钩子里注入其它插件                 | **不可能**                              | Vite 运行 config 钩子时已解析完用户插件；故所有子插件由工厂直接返回，而非 config 动态追加 |

## 全局不变量（改动时勿破）

1. **Ctx 单一写者**：只有 config 钩子写 `Ctx`；任何读 `Ctx` 的钩子都必须晚于 config。
2. **dev 地址单一来源**：端口只由外层 `server.port` 决定、主机名只由外层 `server.host` 决定，mixer 统一读 `httpServer` 实际监听地址（wildcard 时推导 LAN IP）；不得在插件内另设端口/主机 env。
3. **snippet 自触发防护**：reload 必须跳过 `ctx.snippet` 自身的写入，否则生成 snippet → 触发 reload → 死循环/多刷。
4. **产物文件名稳定且扁平**：入口产物固定 `[name].js`、资源 `[name].[ext]`，因 Shopify `assets/` 不支持子目录、且 snippet 需稳定引用。
5. **无 manifest 中转**：mixer 在 `generateBundle` 直接读 bundle 元数据改写 snippet，不开 `build.manifest`、不生成 `.vite/manifest.json`。
6. **dev/build 经 `dev_mode` 分流**：snippet 末尾的 `assign dev_mode` 是 layout 选择 `vite-mixer`/`theme-editor` 的唯一开关。
7. **serve-only 插件不得有 build 副作用**：`check`/`reload` 标 `apply:'serve'`，保证生产构建不被分支校验等 dev 逻辑干扰。
8. **outDir 不清空**：`emptyOutDir:false`，因 outDir 即主题 `assets/`，清空会抹掉主题既有资源。

## 文档索引

| 规格                         | 覆盖                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------- |
| [config.md](./config.md)     | 工厂 `shopifyTheme()` + `shopify-theme:config`：选项解析、注入的 build 配置      |
| [check.md](./check.md) | `shopify-theme:check`：dev 分支前缀校验                                       |
| [reload.md](./reload.md)     | `shopify-theme:reload`：主题目录监听与整页刷新                                   |
| [mixer.md](./mixer.md)       | `shopify-theme:mixer`：dev/build 两态 snippet 生成                               |
| [context.md](./context.md)   | `Ctx` 共享态的填充→读取契约                                                      |
| [log.md](./log.md)           | 分域日志与 debug 开关约定                                                        |
