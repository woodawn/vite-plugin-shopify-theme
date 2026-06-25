// 工厂内共享态：由 shopify-theme:config 插件的 config 钩子填充，
// 在 check / reload / mixer 各自的后续钩子（buildStart / configureServer / generateBundle）中读取。
// config 钩子先于这些钩子运行，故读取时一定已就绪。
export interface Ctx {
  /** 项目根（含 vite.config.ts、src/） */
  root: string;
  /** 主题绝对路径（由宿主经 options.themePath 传入） */
  themePath: string;
  /** 入口（相对 root），如 src/main.ts */
  entry: string;
  /** 生成的 mixer snippet 文件名 */
  snippet: string;
}

// 工厂 shopifyTheme(options) 的公开选项。
export interface ShopifyThemeOptions {
  /** 主题目录绝对路径（必填，缺失即抛错）；宿主自行从 root + 主题名拼好传入 */
  themePath?: string;
  /** 入口（相对 Vite root，必填，缺失即抛错） */
  entry?: string;
  /** 生成的 mixer snippet 文件名；默认 "vite-mixer.liquid" */
  snippet?: string;
  /** dev 下允许的主题仓库分支前缀列表（任一命中即通过）；默认 ["dev"]，传 false 关闭 */
  devBranches?: string[] | false;
  /** 额外整页 reload 的目录（相对 root） */
  reload?: string[];
  /** 开启 debug 日志；默认 false（由宿主决定，经参数传入，不读 process.env.DEBUG） */
  debug?: boolean;
}

// 工厂合并 DEFAULTS 后的选项：被默认值覆盖的字段（devBranches / reload / debug）由可选转为必有，
// 其余保持可选。统一传给 config / check / reload / mixer 四个子插件，由各插件按需取用（见 ../index.ts）。
export type ResolvedOptions = ShopifyThemeOptions &
  Required<Pick<ShopifyThemeOptions, "devBranches" | "reload" | "debug">>;
