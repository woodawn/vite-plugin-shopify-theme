# log — 复用 Vite Logger 的分域日志 + debug 开关

> 源码：[`src/utils/log.ts`](../src/utils/log.ts)

## 职责

给各插件一组分域（scope）日志方法，输出风格与 Vite dev server 一致（时间戳、颜色、清屏处理），并用一个模块级开关（由 `setDebug` 设定）充当 Vite Logger 缺失的「debug 级别」开关。**不读 `process.env`。**

## API（[log.ts:29-43](../src/utils/log.ts)）

`createLog(scope)` 返回 `{ debug, info, error }`，标签为 `pc.dim([shopify-theme:<scope>])`：

| 方法 | 何时打印 | 底层 |
| --- | --- | --- |
| `debug(...)` | **仅** `debugFlag` 为真时 | `logger.info`（带 timestamp） |
| `info(...)` | 始终 | `logger.info`（带 timestamp） |
| `error(...)` | 始终 | `logger.error`（带 timestamp） |

各模块按域创建：`createLog("config" | "check" | "reload" | "mixer")`，标签即指明来源。

## debug 开关（[log.ts](../src/utils/log.ts)）

模块级 `debugFlag` 默认 `false`；由工厂 `shopifyTheme(options.debug)` 经导出的 `setDebug(enabled)` 设定。`debug(...)` 仅在 `debugFlag` 为真时打印，否则静默。

本插件**不读 `process.env.DEBUG`**：开关来源单一，由宿主以参数传入（宿主可自行从 `DEBUG` 推导后传入）。

## 输出格式化（[log.ts:15-26](../src/utils/log.ts)）

`format(args)`：字符串原样拼接；其它值 `JSON.stringify(v, null, 2)`，序列化失败回退 `String(v)`。便于 `log.debug("resolved", ctx)` 这类「字面量 + 对象」混排。

## 设计决策与理由

- **为什么复用 Vite Logger（`createLogger()`）** —— 让本插件输出与 dev server 同风格（时间戳、颜色、清屏行为一致），不另造一套日志观感（[log.ts:4](../src/utils/log.ts)）。共享单个 logger 实例（[log.ts:5](../src/utils/log.ts)）。
- **为什么用模块级开关充当 debug 档** —— Vite Logger 只有 `info`/`warn`/`error`，没有 `debug` 级别；用一个由参数设定的开关，默认静默、按需开启，避免污染正常输出。早期版本读 `DEBUG` 环境变量，现改为宿主经 `options.debug` 传入，插件不碰 `process.env`。

## 不变量

1. `debug` 默认静默；`info`/`error` 始终可见。
2. 所有输出经同一 Vite Logger，风格统一。

## 边界 / 已知约束

- 开关是简单布尔；不再做 `DEBUG` 字符串的 namespace 匹配。宿主若要复用 `DEBUG` 约定，自行解析后把布尔传入 `options.debug`。
- `debug` 走 `logger.info` 通道，仅靠是否调用来区分级别，Vite 侧看仍是 info。
