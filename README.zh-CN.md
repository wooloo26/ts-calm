# ts-calm

给自己的 TypeScript 项目准备的一组省心约定，按职责拆成三个包。Node 24+、ESM、MIT。
[English](README.md) · [详细规则指南](docs/rules.md)

| 包                                                               | 职责                         |
| ---------------------------------------------------------------- | ---------------------------- |
| [`@ts-calm/fp`](packages/fp/README.md)                           | 运行时：Option、Result、守卫 |
| [`@ts-calm/check`](packages/check/README.md)                     | 工具：`ts-calm` 检查命令     |
| [`@ts-calm/create-template`](packages/create-template/README.md) | workspace 生成器             |

## 开始

```sh
pnpm add -D @ts-calm/check
pnpm add @ts-calm/fp
pnpm exec ts-calm init
pnpm exec ts-calm typecheck
pnpm exec ts-calm check
```

运行时与工具是两个包。`@ts-calm/check` 带齐固定版本的编译器、lint、格式工具及其预设；
导入 `@ts-calm/fp` 不会加载它们。包管理、构建和测试仍由项目决定。

## 命令与功能

| 命令                           | 用途                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| `check` / `check --staged`     | 源码规则：检查工作区 / 检查冻结的 Git 暂存内容               |
| `typecheck`                    | 用固定版本编译器检查项目自己的 `tsconfig.json`               |
| `init`                         | 补齐缺失的 Node ESM 配置，不覆盖已有选择                     |
| `init --template pnpm-turbo`   | 调用 `@ts-calm/create-template` 生成 workspace               |
| `explain <规则>`               | 查看原因及函数式替代写法                                     |
| `commit-message --file <路径>` | 检查 `scope - verb description`，例如 `fp - add safe guards` |

支持 `--cwd`、`--json`。退出码：0 通过，1 代码问题，2 配置或执行失败。
格式（`oxfmt --write .`、`oxfmt --check .`）和 lint（`oxlint --type-aware .`）保留为项目脚本，
因为 workspace 每个包各跑一次。

- `@ts-calm/fp`：Result、Option、组合函数、类型守卫、集合工具和 Codec。
- `@ts-calm/fp/boundary`：capture/captureAsync 及其 Result 版本。
- `@ts-calm/check`：检查 API 与 CheckConfig。
- `@ts-calm/check/tsconfig.node.json`、`/oxlint`、`/oxfmt`、`/node`：内置预设。
- 七条源码规则：提交消息、函数长度、边界、文件循环、目录循环、strict-fp、purity。
- 包内使用相对路径并保留 `.ts` 后缀，Node、打包器和浏览器都能解析；只属于 Node 的 `#`
  映射浏览器读不到，所以面向 web 的运行时包不使用它。

默认遵循纯函数约定，已知副作用用 `/** @impure 原因 */` 标明。
允许普通循环和局部数据构造；这是有限检查，不是任意 JavaScript 的纯度证明。
实际外部操作仍放在有说明的 `.b.ts`。优先使用 fromNullable、capture、守卫和 Option/Result，再考虑例外。

## Workspace 模板

```sh
pnpm dlx @ts-calm/create-template my-project
cd my-project
pnpm install
pnpm fmt && pnpm lint && pnpm typecheck && pnpm build && pnpm check && pnpm test
```

生成私有 `packages/a` + `packages/b` workspace，带 Turbo、project references、每包测试和可运行示例。
目标必须不存在或为空，不自动安装依赖或启动进程。

## 发布

三个包按依赖顺序手动发布：

```sh
pnpm build
pnpm test:package
npm publish packages/fp --access public
npm publish packages/create-template --access public
npm publish packages/check --access public
```

`pnpm test:package` 把三个包打成 `.local/release` 下的 tarball，把内部 `workspace:*`
替换成 tarball 路径，然后用真实 npm 与 pnpm 安装验收：`init` 幂等、CLI、类型声明，
以及 `@ts-calm/fp` 在没有检查工具的情况下可以独立加载。

## 本项目开发

本仓库是 pnpm workspace，包含三个包和这个私有根包。

```sh
pnpm install
pnpm build       # turbo：fp -> check -> create-template
pnpm typecheck   # 每个包
pnpm check       # 整个 workspace 的格式、lint 与源码规则
pnpm test        # vitest 跑 packages/*/tests
pnpm verify      # build、typecheck、check、lint、fmt:check、test
```

其他门禁：`pnpm test:coverage`、`pnpm test:mutation`（带 runner canary）、`pnpm bench`、
`pnpm test:package`、`pnpm test:template`。报告在 `.local/reports`。
行为改动按 TDD：先失败测试，再实现，再重构。文档修改不硬凑测试。
修改规则说明后用 `pnpm docs` 更新指南。
