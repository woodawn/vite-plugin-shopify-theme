import type { PluginOption } from "vite";

import type { Ctx, ResolvedOptions, ShopifyThemeOptions } from "./types";
import config from "./plugins/config";
import check from "./plugins/check";
import reload from "./plugins/reload";
import mixer from "./plugins/mixer";
import { setDebug } from "./utils/log";

export type { Ctx, ShopifyThemeOptions } from "./types";

// 工厂层选项默认值（行为类，非 Ctx 事实）：缺省即用这些。
// Ctx 事实（root 默认 cwd、snippet 默认文件名）的默认在 config 钩子解析，详见 ./plugins/config。
const DEFAULTS = {
  devBranches: ["dev"],
  reload: [],
  debug: false,
} satisfies Partial<ShopifyThemeOptions>;

// 标准 Shopify 主题接入 Vite 的一站式插件：返回一组 Vite 插件（Vite 会自动展平）。
// 用法：plugins: [shopifyTheme()]
export default function shopifyTheme(options: ShopifyThemeOptions = {}): PluginOption[] {
  const ctx = {} as Ctx;
  const opts: ResolvedOptions = { ...DEFAULTS, ...options };
  setDebug(opts.debug);

  // UI 库（Tailwind / UnoCSS / …）不在本插件职责内：由宿主项目自行选择并接入
  // 自己的 vite.config.ts plugins 数组——本插件只负责 Shopify 主题接入机制。
  // 四个插件统一签名 (ctx, opts)，各自从 opts 取所需字段。config 须最先：它在 config 钩子
  // 里填满 Ctx，其余三个的后续钩子才读得到（opts 同步传入、无时序依赖）。详见 ./plugins/config。
  return [
    config(ctx, opts),
    check(ctx, opts),
    reload(ctx, opts),
    mixer(ctx, opts),
  ];
}
