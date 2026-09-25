# ts-calm

给自己的 TypeScript 项目准备的一组省心约定。Node 24+、ESM、MIT。
[English](README.md) · [详细规则指南](docs/rules.md)

## 开始

```sh
pnpm add ts-calm
pnpm exec ts-calm init
pnpm exec ts-calm fmt
pnpm exec ts-calm check
```

首次 npm 发布前安装已验收的 tarball。一个包带齐固定版本的格式、lint、TypeScript 工具；
函数库根入口不会加载这些工具。包管理、构建、workspace 和测试仍由项目决定。

## 命令与功能

| 命令                           | 用途                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| `check` / `check --staged`     | 完整静态检查 / 检查同一份暂存源码和配置，不修改源码          |
| `fmt` / `fmt --check`          | 格式化 / 只检查格式                                          |
| `lint` / `typecheck`           | 单独运行相应检查                                             |
| `init`                         | 补齐缺失的 Node ESM 配置，不覆盖已有选择                     |
| `explain <规则>`               | 查看原因及函数式替代写法                                     |
| `commit-message --file <路径>` | 检查 `scope - verb description`，例如 `fp - add safe guards` |

支持 `--cwd`、`--json`。退出码：0 通过，1 代码问题，2 配置或执行失败。

- `ts-calm`：Result、Option、组合函数、类型守卫、集合工具和 Codec。
- `ts-calm/boundary`：capture/captureAsync 及其 Result 版本。
- `ts-calm/check`：检查 API 与 CheckConfig。
- 七条源码规则：提交消息、函数长度、边界、文件循环、目录循环、strict-fp、purity。
- 包内使用 Node 原生 `#` 路径；开发测试选源码，安装包默认选 `dist`。

默认遵循纯函数约定，已知副作用用 `/** @impure 原因 */` 标明。
允许普通循环和局部数据构造；这是有限检查，不是任意 JavaScript 的纯度证明。
实际外部操作仍放在有说明的 `.b.ts`。优先使用 fromNullable、capture、守卫和 Option/Result，再考虑例外。

## Workspace 模板

```sh
pnpm exec ts-calm init --template pnpm-turbo --cwd ./my-project
cd my-project
pnpm install
pnpm build && pnpm check && pnpm test && pnpm start
```

生成私有 app/shared workspace、原生 `#src/*`、Turbo 和可运行示例。
目标必须不存在或为空，不自动安装依赖或启动进程。本仓库仍保持单包。

## 本项目开发

行为改动按 TDD：先失败测试，再实现，再重构。文档修改不硬凑测试。
日常跑 `pnpm verify`，相关测试用 `pnpm test -- <路径>`。
`test:coverage` 看漏测，`test:mutation` 定点检查两个目标，`bench` 测热点；不追求统一满分，也不用耗时波动阻断提交。
报告在 `.local/reports`。`test:package`、`test:template` 验收真实安装和生成项目。
修改规则说明后用 `pnpm run docs` 更新指南。

最后手动上传：`npm publish .local/release/ts-calm-0.1.0.tgz --access public`。
