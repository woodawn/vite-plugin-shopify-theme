import { createLogger } from "vite";
import pc from "picocolors";

// 共享一个 Vite Logger，输出风格（时间戳、颜色、清屏处理）与 dev server 一致
const logger = createLogger();

// Vite 的 Logger 没有 debug 档（只有 info / warn / error），用一个模块级开关充当
// "debug 级别"：默认静默，由工厂 shopifyTheme(options.debug) 经 setDebug 设定。
// 不读 process.env——开关来源单一，由宿主以参数传入。
let debugFlag = false;

export function setDebug(enabled: boolean): void {
  debugFlag = enabled;
}

function format(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a, null, 2);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

// 按域返回一组 logger：debug 默认静默，info / error 始终可见，均经 Vite Logger 输出。
export function createLog(scope: string) {
  const tag = pc.dim(`[shopify-theme:${scope}]`);
  return {
    debug(...args: unknown[]) {
      if (!debugFlag) return;
      logger.info(`${tag} ${format(args)}`, { timestamp: true });
    },
    info(...args: unknown[]) {
      logger.info(`${tag} ${format(args)}`, { timestamp: true });
    },
    error(...args: unknown[]) {
      logger.error(`${tag} ${format(args)}`, { timestamp: true });
    },
  };
}
