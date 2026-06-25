import { join, resolve } from "node:path";
import type { Plugin } from "vite";
import type { Ctx, ResolvedOptions } from "../types";
import { createLog } from "../utils/log";

const log = createLog("config");

// config 钩子：解析选项、定位主题路径、填满 Ctx，注入机制必需的 build 配置。
// 这一步必须早于 check/reload/mixer 的钩子（它们只读 Ctx），config 正是最早的时机。
// 注意：Vite 在运行 config 钩子前已解析完用户插件，故不能在此注入其它插件——
// 插件本身由工厂（index.ts）直接返回。
export default function config(ctx: Ctx, opts: ResolvedOptions): Plugin {
  return {
    name: "shopify-theme:config",
    config(viteConfig) {
      // root 跟随 Vite 自身的 config.root（缺省回退 cwd），与宿主 vite.config 单一来源，
      // 不再单设 option；仅用于解析 entry / 额外 reload 目录 / 日志相对路径。
      const root = resolve(viteConfig.root ?? process.cwd());
      const themePath = required(opts.themePath, "themePath");
      const entry = required(opts.entry, "entry");

      const snippet = opts.snippet ?? "vite-mixer.liquid";

      Object.assign(ctx, { root, themePath, entry, snippet } satisfies Ctx);
      log.debug("resolved", ctx);

      // resolve.alias 与 server 由外层 vite.config 掌控（见根 vite.config.ts）；
      // 本插件只注入主题路径派生 / 机制必需的 build 配置。
      return {
        build: {
          outDir: join(themePath, "assets"),
          emptyOutDir: false,
          minify: false,
          // 无需 manifest：:mixer 改从 generateBundle 的 bundle 元数据读取 entry/CSS
          rolldownOptions: {
            input: { "vite-mixer": join(root, entry) },
            output: {
              entryFileNames: "[name].js",
              chunkFileNames: "[name].js",
              assetFileNames: "[name].[ext]",
            },
          },
        },
      };
    },
  };
}

// 必填选项校验：缺失即抛出统一格式错误，中止启动。
function required(value: string | undefined, name: string): string {
  if (!value) throw new Error(`[shopify-theme] ${name} 未设置：请传 options.${name}。`);
  return value;
}
