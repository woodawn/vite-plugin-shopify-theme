import { join, normalize, sep } from "node:path";
import type { Plugin } from "vite";
import type { Ctx, ResolvedOptions } from "../types";
import { createLog } from "../utils/log";

const log = createLog("reload");

// 复用 Vite 自带的 server.watcher（chokidar 实例），不再起第二个 watcher。
// 主题 .liquid 不在 Vite 模块图里，handleHotUpdate 不会触发，故需文件级 watch + 整页刷新。
export default function reload(ctx: Ctx, opts: ResolvedOptions): Plugin {
  return {
    name: "shopify-theme:reload",
    apply: "serve",
    configureServer(server) {
      // themePath 单目录前缀即可框定主题源码，无需逐子目录白名单。
      const themeDir = normalize(ctx.themePath);
      // 额外整页 reload 目录（相对 root，可在 themePath 外）。
      const extraDirs = opts.reload.map((p) => normalize(join(ctx.root, p)));
      // .vitify 在 Vite 模块图内、由 HMR 接管：纳入触发会 HMR + full-reload 双触发，故从前缀里挖掉。
      //（.git / node_modules 由 Vite watcher 默认 ignored 兜住，不会进 onChange，无需在此排除。
      //  assets 即 build.outDir，dev 下 Vite 不写出 → 纳入无 reload 循环，故不挖。）
      const vitifyDir = normalize(join(ctx.themePath, ".vitify"));

      // 宿主形态下此 add 冗余——themePath 恒在 root 内，Vite 对 root 的递归 watch 已覆盖；
      // 保留是为不依赖宿主事实：themePath 在 root 外（插件对外契约允许任意 themePath）时仍可工作，成本为零。
      server.watcher.add([themeDir, ...extraDirs]);

      const onChange = (file: string) => {
        const f = normalize(file);
        // server.watcher 是共享实例，事件来自 Vite 对整个 root 的递归 watch（远不止主题目录）；
        // 把 reload 限定在主题源码内的是这层前缀过滤。+ sep 保证按目录边界匹配（themePath 不误命中 theme-foo）。
        const inTheme = f.startsWith(themeDir + sep) && !f.startsWith(vitifyDir + sep);
        const inExtra = extraDirs.some((d) => f.startsWith(d + sep));
        if (!inTheme && !inExtra) return;
        // 跳过本插件体系自己生成的 mixer snippet，避免启动写入时多一次刷新
        if (f.endsWith(`${sep}${ctx.snippet}`)) return;
        server.ws.send({ type: "full-reload", path: "*" });
        log.info("page reload", f.startsWith(ctx.root + sep) ? f.slice(ctx.root.length + 1) : f);
      };

      server.watcher.on("change", onChange);
      server.watcher.on("add", onChange);
      server.watcher.on("unlink", onChange);

      // dump 共享 watcher 监听的目录全集：Vite 对 root 的递归 watch + 本插件 add 的目录
      // + chokidar 对各 watch 根之父目录的登记。getWatched() 返回 { 目录: 子项[] }；
      // 初始扫描异步，"listening" 时未必已扫完（完整信号是 watcher 的 "ready" 事件），此处仅作 debug 参考。
      server.httpServer?.once("listening", () => {
        const watched = Object.keys(server.watcher.getWatched())
          .map((d) => (d.startsWith(ctx.root + sep) ? d.slice(ctx.root.length + 1) || "." : d))
          .sort();
        log.debug("watched dirs", watched);
      });
    },
  };
}
