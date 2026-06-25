import { defineBuildConfig } from "obuild/config";

// obuild：rolldown 打包 + oxc 转译，单入口 bundle 模式，出 dist/index.mjs + index.d.mts
export default defineBuildConfig({
  entries: [{ type: "bundle", input: ["./src/index.ts"] }],
});
