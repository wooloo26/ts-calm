# ts-calm

给自己的 TypeScript 项目准备的一组省心约定，按职责拆成两个包。Node 24+、ESM、MIT。
本仓库是模板：复制一份，按需改改即可，不发布到 npm。
[English](README.md) · [详细规则指南](docs/rules.md)

| 包                                           | 职责                         |
| -------------------------------------------- | ---------------------------- |
| [`@ts-calm/fp`](packages/fp/README.md)       | 运行时：Option、Result、守卫 |
| [`@ts-calm/check`](packages/check/README.md) | 工具：`ts-calm` 检查命令     |

## 作为模板使用

```sh
git clone --depth 1 https://github.com/wooloo26/ts-calm.git my-project
cd my-project
rm -rf .git          # Windows: Remove-Item -Recurse -Force .git
pnpm install
pnpm verify
```

直接下载 ZIP 也一样：解压、删掉 `.git`、再 `pnpm install`。
复制过去的是完整的 workspace 级配置：源码规则、编译器项目、测试运行器、任务运行器、包管理器设置、
Lefthook hooks 和编辑器默认值都在。`pnpm install` 会把 `packages/` 里的 `@ts-calm/fp` 与
`@ts-calm/check` 链接进 workspace，不从 npm 拉取。

优先改这几处：

- 根 `package.json`：`name`、`description`，以及不需要的脚本。
- `ts-calm.config.ts`：`commit-message` 的 scope 列表和允许的副作用 import。
- `packages/`：两个示例包可以保留、改名或删除；只要目录还在，`@ts-calm/fp` 与 `@ts-calm/check`
  的 import 就能通过 workspace 解析。

运行时与工具是两个包。检查工具只负责自己的源码规则和编译器调用：`typecheck`
读取项目自己的 `tsconfig.json`，格式与 lint 由项目自己的脚本负责。
包管理、构建和测试仍由项目决定。

## 命令与功能

| 命令                           | 用途                                                         |
| ------------------------------ | ------------------------------------------------------------ |
| `check` / `check --staged`     | 源码规则：检查工作区 / 检查冻结的 Git 暂存内容               |
| `typecheck`                    | 用固定版本编译器检查项目自己的 `tsconfig.json`               |
| `init`                         | 补上缺失的 ESM `type`，不覆盖已有选择                        |
| `explain <规则>`               | 查看原因及函数式替代写法                                     |
| `commit-message --file <路径>` | 检查 `scope - verb description`，例如 `fp - add safe guards` |

支持 `--cwd`、`--json`。退出码：0 通过，1 至少一条 error 级问题，2 配置或执行失败；warning 只报告，不判定失败。
格式（`oxfmt --write .`、`oxfmt --check .`）和 lint（`oxlint --type-aware .`）保留为项目脚本，
因为 workspace 每个包各跑一次。

- `@ts-calm/fp`：Result、Option、组合函数、类型守卫、集合工具和 Codec。
- `@ts-calm/fp/boundary`：capture/captureAsync 及其 Result 版本。
- `@ts-calm/check`：检查 API 与 CheckConfig。
- 七条源码规则：提交消息、函数长度、边界、文件循环、目录循环、strict-fp、purity。
- 包内使用相对路径并保留 `.ts` 后缀，Node、打包器和浏览器都能解析；只属于 Node 的 `#`
  映射浏览器读不到，所以面向 web 的运行时包不使用它。

默认遵循纯函数约定，已知副作用用 `/** @impure 原因 */` 标明。
允许普通循环和局部数据构造；这是有限检查，不是任意 JavaScript 的纯度证明。
实际外部操作仍放在有说明的 `.b.ts`。优先使用 fromNullable、capture、守卫和 Option/Result，再考虑例外。

## 本项目开发

本仓库是 pnpm workspace：两个包加上这个私有根包。

```sh
pnpm install
pnpm build       # turbo：fp -> check
pnpm typecheck   # 每个包
pnpm check       # 整个 workspace 的源码规则
pnpm test        # vitest 跑 packages/*/tests
pnpm verify      # build、typecheck、check、lint、fmt:check、test
```

其他门禁：`pnpm test:coverage`、`pnpm bench`。报告在 `.local/reports`。
`pnpm install` 同时安装 Lefthook hooks：`pre-commit` 检查暂存文件的格式与源码规则，
`commit-msg` 检查提交信息。

这里的改动就是下一个项目的起点，所以行为改动按 TDD：先失败测试，再实现，再重构。文档修改不硬凑测试。
修改规则说明后用 `pnpm run docs` 更新指南；有测试保证 `docs/rules.md` 与规则说明一致。
该文件是生成的，所以 `pnpm fmt` 会忽略它。
