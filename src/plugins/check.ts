import { join } from "node:path";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import type { Ctx, ResolvedOptions } from "../types";
import { createLog } from "../utils/log";

const log = createLog("check");

// 仅 dev（apply: 'serve'）下校验主题仓库自身的 git 分支须以 opts.devBranches 中任一前缀开头。
// build（vite build）完全不加载本插件，故不影响生产构建。
export default function check(ctx: Ctx, opts: ResolvedOptions): Plugin {
  return {
    name: "shopify-theme:check",
    enforce: "pre",
    apply: "serve",
    buildStart() {
      const branches = opts.devBranches;
      if (branches === false) return;
      log.debug("check branch", { themePath: ctx.themePath, branches });
      checkGitBranch(ctx.themePath, branches);
    },
  };
}

function checkGitBranch(repoPath: string, branches: string[]) {
  const headPath = join(repoPath, ".git", "HEAD");
  const headContent = readFileSync(headPath, "utf8").trim();

  // 通常形如："ref: refs/heads/main"。分支名本身可含 "/"（如 dev/foo），
  // 必须按固定前缀切片取完整分支名，不能 split("/") 取末段。
  const refPrefix = "ref: refs/heads/";
  if (headContent.startsWith(refPrefix)) {
    const currentBranch = headContent.slice(refPrefix.length);
    if (!branches.some((branch) => currentBranch.startsWith(branch))) {
      throw new Error(`branch error: current: ${currentBranch}, need: ${branches.join(" | ")}`);
    }
  } else {
    throw new Error("branch error: Git branch is not exist");
  }
}
