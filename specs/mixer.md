# mixer — 生成 vite-mixer.liquid，缝合 Vite 与 Shopify 主题

> 源码：[`src/plugins/mixer.ts`](../src/plugins/mixer.ts) · 插件名 `shopify-theme:mixer` · `enforce: 'post'`（dev + build 皆加载）

## 职责

维护那一个**自动生成的 snippet**（`<themePath>/snippets/<ctx.snippet>`，默认 `vite-mixer.liquid`）——本插件的核心产物。dev 写指向本地 dev server 的 script 标签，build 直接读 bundle 元数据改写成 Shopify CDN 的 `asset_url` 标签；两态都在 snippet 末尾 `assign dev_mode`，供 `layout/theme.liquid` 分流。

## 时机

| 钩子 | 命令 | 行为 |
| --- | --- | --- |
| `configureServer`（[mixer.ts:31-56](../src/plugins/mixer.ts)） | dev | `httpServer` `'listening'` 时写 **dev** snippet |
| `generateBundle`（[mixer.ts:60-78](../src/plugins/mixer.ts)） | build | 读 bundle 元数据写 **生产** snippet |

`enforce:'post'` 让它在所有插件之后跑，确保 Vite 收集的 `viteMetadata`（含 `importedCss`）已就绪、server 状态已最终。

## 输入

- `ctx.themePath`、`ctx.snippet`、`ctx.entry`。
- dev：`server.httpServer` 实际监听端口；`server.config.build.rolldownOptions.input`（多入口列表，存绝对路径）。
- build：`generateBundle` 收到的 `bundle` 对象——entry chunk 的 `fileName` 与 `viteMetadata.importedCss`。无 manifest 文件中转（参见 [Vite: output bundle metadata](https://vite.dev/guide/api-plugin#output-bundle-metadata)）。

## 输出（生成的 snippet 形态）

**dev**（[mixer.ts:47-54](../src/plugins/mixer.ts)）——首行显式注入 `/@vite/client`（HMR / full-reload 的 WebSocket 由它建立），其后每个入口一行 script，末尾 `dev_mode = true`；`<host>` 按实际监听地址推导（见下「关键流程」）：

```liquid
<script src="http://<host>:<port>/@vite/client" type="module"></script>
<script src="http://<host>:<port>/<entry>" type="module"></script>
{% liquid
  assign dev_mode = true
%}
```

**build**（[mixer.ts:76-77](../src/plugins/mixer.ts)）——disclaimer 注释 + 各 entry chunk 的 `asset_url` script + 其 css 的 `stylesheet_tag`，末尾 `dev_mode = false`：

```liquid
{% comment %} … 自动生成，勿手改 … {% endcomment %}
<script src="{{ '<entry>.js' | asset_url }}" type="module"></script>
{{ '<entry>.css' | asset_url | stylesheet_tag }}
{% liquid
  assign dev_mode = false
%}
```

标签构造见 [mixer.ts:82-110](../src/plugins/mixer.ts)（`scriptTag`/`stylesheetTag`/`devScriptTag`/`devHost`）。

## 关键流程

- **dev 地址取值**（[mixer.ts:33-38](../src/plugins/mixer.ts)）：`httpServer.once('listening')` 后取 `address()` 的**实际监听端口与地址**（端口回退 `server.config.server.port`）。主机名经 `devHost` 推导（[mixer.ts:97-110](../src/plugins/mixer.ts)）：未知/回环 → `localhost`；wildcard（`0.0.0.0`/`::`）→ 第一个非内部 IPv4（LAN/手机预览可达），找不到回退 `localhost`；具体地址原样用。取实际值而非配置值，因端口被占用时 Vite 会自动换。
- **dev 多入口**（[mixer.ts:40-45](../src/plugins/mixer.ts)）：`input` 为 string 用 `[ctx.entry]`，否则取 `Object.values`——`input` 存绝对路径，故逐项 `relative(root, …)` 转 root 相对后写 script。
- **build 改写**（[mixer.ts:63-69](../src/plugins/mixer.ts)）：遍历 `bundle`，仅对 `type === "chunk"` 且 `isEntry` 的项写 `scriptTag(fileName)`；其 `viteMetadata.importedCss` 逐个写 `stylesheetTag`。

## 不变量

1. **只有 build 改写生产 snippet**：`generateBundle` 是 Rollup 的产物生成钩子，**仅 `vite build` 触发**（dev server 关闭不触发），故无需 `command`/`isBuild` 区分（[mixer.ts:58-60](../src/plugins/mixer.ts)）。
2. bundle 中无 entry chunk → `log.error` 后 return，**不抛**（[mixer.ts:71-74](../src/plugins/mixer.ts)）。
3. 仅 `isEntry` 的 chunk 进入标签（非入口 chunk 由入口自行引入）。
4. snippet 末尾的 `dev_mode` 是 dev/build 分流的唯一开关；layout 据此选 `vite-mixer`/`theme-editor`。
5. **dev snippet 首行必须是 `/@vite/client`**：full-reload / HMR 的 WebSocket 由 client 模块建立，不得依赖 entry 模块图传递性加载它（[mixer.ts:47-52](../src/plugins/mixer.ts)）。

## 设计决策与理由

- **为什么 `enforce:'post'`** —— snippet 改写依赖 Vite 在 build 管线中填充的 `viteMetadata`（及最终 server 信息），需排在所有插件之后。
- **为什么用 `generateBundle` 而非 `closeBundle`** —— `generateBundle` 只在 `vite build` 触发，dev server 关闭不会触发；用它就天然不会在退出 dev 时误把 snippet 写成生产形态，省去 `isBuild` 判断（[mixer.ts:58-60](../src/plugins/mixer.ts)）。
- **为什么直接读 bundle 元数据而非 manifest** —— entry chunk 的 `fileName` 与 `viteMetadata.importedCss` 在 `generateBundle` 已齐备，直接读即可改写 snippet；无需开 `build.manifest`、也无需生成再删 `.vite/manifest.json` 这类一次性中转物（[mixer.ts:63-69](../src/plugins/mixer.ts)）。
- **为什么端口/主机名取 `httpServer.address()`** —— dev 地址的单一来源是「实际监听地址」。配置端口可能因占用被换，只有 `address().port` 是真值（[mixer.ts:33-38](../src/plugins/mixer.ts)）。本插件因此**不读** `VITE_LIVE_PORT`。主机名同理由实际监听地址推导：回环写 `localhost`；wildcard 监听说明宿主有意开放 LAN（如 `host: "0.0.0.0"` 做手机预览），写死 `localhost` 会让局域网设备取不到资产，故取 LAN IP（[mixer.ts:97-110](../src/plugins/mixer.ts)）。
- **为什么显式注入 `/@vite/client`** —— Vite backend-integration 的标准做法。HMR 与 [reload](./reload.md) 发的 `full-reload` 都经 client 的 WebSocket 送达；若只注入 entry，client 仅在「entry 模块图里恰好有会传递性加载它的模块」（如 CSS 代理模块）时才被加载——纯 JS entry 下整条刷新链路会静默失效（[mixer.ts:47-52](../src/plugins/mixer.ts)）。

## 边界 / 已知约束

- dev snippet 主机名按监听地址推导：回环监听写 `localhost`，仅本机预览有效；wildcard 监听写 LAN IP，局域网/手机可预览，但换网络后 IP 变化需重启 dev 重新生成。生产形态才用 CDN。
- 生成的 snippet 会被 [reload](./reload.md) 显式跳过，避免自触发刷新。
- 改写以 bundle 里 chunk 的 `isEntry`/`viteMetadata.importedCss` 为准；若 Vite 的 bundle 元数据结构变化需同步本逻辑。
