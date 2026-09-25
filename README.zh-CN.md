# ts-calm

面向省心 TypeScript 开发：函数式值、清晰边界和一个完整的静态检查入口。MIT 许可，CLI 需要 Node 24+。

[English](README.md) · [规则与替代写法](docs/rules.md) · [参与开发](CONTRIBUTING.md)

## 一次安装

```sh
npm install ts-calm
npx ts-calm init
npx ts-calm fmt
npx ts-calm check
```

pnpm 使用 `pnpm add ts-calm` 和 `pnpm exec ts-calm <命令>`。首次 npm 发布前，安装 CI 中的 tarball。
一包提供固定版本的 TypeScript、Oxfmt、Oxlint 和类型检查后端，使用项目无需另装一份工具。
安装体积包含这些工具；函数式根入口不会加载 Node 或工具代码。

包管理、workspace、构建与测试由使用项目自己决定。本包不安装 hooks、不调度任务，也不引入模块登记清单。

| 入口                                                  | 能力                                                     |
| ----------------------------------------------------- | -------------------------------------------------------- |
| `ts-calm`                                             | Result、Option、组合函数、集合操作、类型守卫和编解码     |
| `ts-calm/boundary`                                    | capture、captureAsync、captureResult、captureResultAsync |
| `ts-calm/check`                                       | 检查 API、CheckConfig、诊断类型、初始化及规则说明        |
| `ts-calm/oxlint`、`ts-calm/oxfmt`                     | 原生工具预设                                             |
| `ts-calm/tsconfig.json`、`ts-calm/tsconfig.node.json` | 严格检查与 Node ESM 编译配置                             |

## 常用命令

| 命令                           | 行为                                              |
| ------------------------------ | ------------------------------------------------- |
| `check`                        | 只读运行格式、类型感知 lint、tsc 和全部自定义规则 |
| `check --staged`               | 对同一份暂存快照执行完整检查                      |
| `fmt` / `fmt --check`          | 格式化 / 只检查格式                               |
| `lint`                         | 类型感知 Oxlint 和自定义规则                      |
| `typecheck`                    | 按项目 tsconfig 执行 tsc，不输出编译产物          |
| `init`                         | 只创建缺失的配置                                  |
| `explain strict-fp/no-try`     | 离线查看原因及替代 API                            |
| `commit-message --file <路径>` | 根据暂存策略检查提交消息                          |

支持 `--cwd`、`--json`。检查输出诊断数组，包含位置、规则、消息以及可选的帮助文本和文档链接。
退出码 0 表示通过或只有警告，1 表示代码问题，2 表示配置或执行失败。缺少 tsconfig 会提示 init，不能静默跳过。
类型检查缓存位于本次操作独占的临时目录，不改项目的构建缓存。

## 默认约定与配置

`init` 默认 Node ESM，生成引用内置预设的 tsconfig、`oxlint.config.ts`、`oxfmt.config.ts`。
Node 类型通过预设的 `ts-calm/node` 类型入口配套提供，pnpm 下也不需要另装 `@types/node`。
已有配置及其 JSON/JSONC/TS/MTS 形式会保留，不生成冲突文件；重复执行不产生修改。
只在 package.json 缺少 type 时补 `module`，已有其它值保留并提示。不会修改依赖、scripts、workspace 或包管理器设置。
前端项目继续使用自己的 tsconfig，可仅继承严格检查预设。

fmt/lint 优先使用项目原生配置，没有时使用内置默认值。Oxlint 保留原项目的插件、correctness 分类和五条 TypeScript 规则。
可选的 `ts-calm.config.ts` 只配置自定义规则：

```ts
import { defineConfig } from 'ts-calm/check';

export default defineConfig({
  effectImports: ['better-sqlite3', 'some-network-sdk'],
  rules: {
    'function-length': { warning: 80, maximum: 150 },
    'strict-fp': { 'no-null': false },
  },
});
```

规则可设 false。`files`、`ignores` 支持 `/` 路径与 `*`、`**`、`?`；effectImports 使用完整 import specifier。
该配置是同步执行的可信项目代码，不支持顶层 await。原生工具配置仍使用各自的格式。

## 六条源码规则

| 规则             | 默认行为                                                  |
| ---------------- | --------------------------------------------------------- |
| commit-message   | `type(scope): description`；全文 ASCII，标题最多 100 字符 |
| function-length  | 有效行超过 80 警告、超过 150 报错                         |
| boundary         | 直接副作用进入有说明的 `.b.ts`，声明与实际用法对应        |
| no-file-cycles   | 禁止值、类型、再导出、可解析动态 import 构成的文件循环    |
| no-module-cycles | 每个源码目录就是模块，禁止目录之间的循环                  |
| strict-fp        | 默认启用，可配置具体检查项，并允许有理由的边界例外        |

模块循环不等于文件循环。例如 `orders/read.ts → stock/types.ts` 与 `stock/write.ts → orders/types.ts`
足以形成两个模块的循环。诊断会同时给出目录环与每条跨目录依赖的文件和行号。
子目录和测试目录独立归属模块；同目录依赖只参与文件循环检查。没有额外登记文件。

检查使用 ESM 的 `.ts`、`.tsx`、`.mts`、`.cts`。只有 `.b.ts` 具有边界含义。
测试、fixture、scripts 和配置文件默认跳过 boundary/strict-fp，仍检查两个循环规则和函数长度。
依赖、构建输出、声明文件、`.git`、`.local` 排除。解析失败、缺失依赖、被排除的内部源码、计算型 import 和 CommonJS require 都明确报错。

严格模式检查 throw、try、普通断言、any、非空断言、null、undefined、class、this、with、var、delete 和模块级 let/var。
允许 `as const`、局部 let、循环、原生 JSON 和纯第三方库。规则是明确约定，不能证明整个程序纯粹或深度不可变。
统一命令中，any/非空断言由 strict-fp 统一判断并去重，配置关闭和合法例外都生效；Promise、穷尽性检查独立保留。
直接使用 Oxlint 或编辑器原生扩展时，遵循其配置，不会识别本包的边界注释。

## 先用函数，再考虑例外

`no-try` 会建议 capture/captureAsync，已有 Result 的操作使用 captureResult 系列。
`no-null`、`no-undefined` 会建议 fromNullable/isNonNullable，再用 match、getOrElse、toResult 处理。
0、false、空字符串都会保留。协议中的真实 null 不应误当缺失值消除。
普通组合函数不会吞掉回调的程序错误；也不会自动改写可能改变清理语义的 try/finally。

```ts
/**
 * @boundary 读取外部配置，将文件错误表达为 Result。
 * @effects node:fs/promises
 */
import { readFile } from 'node:fs/promises';
import { captureAsync } from 'ts-calm/boundary';

export const readConfiguration = (path: string) =>
  captureAsync(() => readFile(path, 'utf8'), { name: 'read-config' });
```

这里不再需要 no-try 例外，但真实文件操作仍需要 `.b.ts`。
`@boundary` 解释原因与保证，`@effects` 声明实际外部能力；确有必要时才用 `@allow strict-fp/<检查项> -- 原因` 或 `strict-fp/*`。
例外不能绕过边界自身要求、长度、循环或提交消息。无用、重复、未知或错误声明报错。
类型、schema、纯转发及普通编排不足以证明需要 `.b.ts`。工具检查已知事实，人审判断理由是否正当。

新增的五个函数：

| API           | 保证                                                                |
| ------------- | ------------------------------------------------------------------- |
| isArray       | 只读 unknown 数组，不验证元素                                       |
| isObject      | 非 null 对象，包含数组、Date、Map，排除函数；不声称是字典           |
| isPlainObject | 当前 realm 普通对象或 null 原型字典，字段仍为 unknown               |
| hasOwn        | 指定自有属性存在，不读 getter、不验证属性值；联合键不代表所有键存在 |
| traverseAsync | 按顺序逐项等待，首个 Err 后不再调用后续操作，返回只读结果数组       |

守卫对撤销或无法检查的 Proxy 返回 false。traverseAsync 支持同步/异步 Result，回调抛错或拒绝会向外传播。
现有组合、集合、品牌类型、清理和 Codec 保留；没有新增 nullable 别名、抛异常的 unwrap 或并发框架。
API JSDoc、[规则指南](docs/rules.md) 和 explain 提供一致的用法引导。

## 暂存、开发与发布

`check --staged` 对同一份 index 中的完整源码和配置执行 fmt/lint/tsc/规则检查，不 stash、不写工作区或 index。
支持部分暂存、重命名、删除，并检测检查期间的 index 变化。依赖复用已安装版本；所需生成声明由使用项目负责。
冲突、已跟踪的符号链接和 submodule 会明确拒绝。通过现有 hooks 调用命令即可，不自动安装 hooks。

`checkProject`/`checkStaged` 是完整检查；`checkSourceProject` 只做自定义规则；`runChecks` 接收源码和完整解析边，保持纯函数。
操作性失败抛错，代码问题返回诊断。

```sh
pnpm verify
pnpm test:package
# 由维护者手动执行最后上传：
npm publish .local/release/ts-calm-0.1.0.tgz --access public
```

Windows/Linux CI 验证完整检查、暂存场景和独立 npm/pnpm 消费项目。包与报告位于 `.local/release`。
CI 不执行 npm 发布，运行时也不依赖原游戏项目。
