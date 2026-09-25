# fp-gates

一个 npm 包，提供函数式 TypeScript API 和五条可配置的代码门禁。MIT 许可。

[English](README.md) · [参与开发](CONTRIBUTING.md)

## 使用

CLI 需要 Node 24+。根入口是与平台无关的 ESM，不加载 Node、OXC 或 CLI 代码。
单包安装仍会安装 gates 的依赖。

```sh
npm install fp-gates
npx fp-gates check
npx fp-gates check --staged
npx fp-gates commit-message --file .git/COMMIT_EDITMSG
```

0.1.0 已准备发布，以上 npm 安装命令在维护者手动发布后可用；发布前可安装 CI 产出的 tarball。

| 入口                | 能力                                                                     |
| ------------------- | ------------------------------------------------------------------------ |
| `fp-gates`          | Result、Option、组合函数、集合操作、品牌类型、Decoder/Codec 和 JSON 转换 |
| `fp-gates/boundary` | capture、captureAsync、captureResult、captureResultAsync                 |
| `fp-gates/gates`    | 检查 API、配置和诊断类型                                                 |

```ts
import { ok, map, get, isOk } from 'fp-gates';

const value = map(ok(3), (number) => number + 1);
if (isOk(value)) console.log(get(value));
```

容器只读且隐藏内部表示。通过构造函数、判别函数和安全访问器操作，避免读取内部字段。
普通组合函数不会吞掉回调中的程序错误；需要转换外部异常时使用 boundary 入口。
现有的类型推导、惰性回退、短路、异常分类、清理行为和实际数据编解码均保留。

## 五条默认规则

| 规则            | 行为                                                                                    |
| --------------- | --------------------------------------------------------------------------------------- |
| commit-message  | `type(scope): description`；全文 ASCII，标题不超过 100 字符；scope 可配置，无需模块清单 |
| function-length | 有效行超过 80 警告、超过 150 报错；不计空行、纯注释和嵌套函数体，括号行计数             |
| boundary        | 直接副作用进入有说明的 `.b.ts`；注释声明必须与实际代码对应                              |
| no-file-cycles  | 禁止包括纯类型导入、再导出和字面量动态导入在内的文件循环                                |
| strict-fp       | 默认启用，允许关闭整条或单独检查项，边界可声明例外                                      |

严格模式检查 throw、try、普通类型断言、any、非空断言、null、undefined、class、this、with、var、delete 和模块级 let/var。
允许 `as const`、函数内 let、循环、原生 JSON 和纯第三方库。它是明确的语法约定，不能证明引用透明性或深度不可变性。

支持使用 ESM 语法的 `.ts`、`.tsx`、`.mts`、`.cts`。只有 `.b.ts` 表示边界。
依赖、构建目录、声明文件、`.git` 和 `.local` 默认排除。
测试、fixture、scripts 和配置文件默认不应用 boundary/strict-fp，但仍检查长度与循环；可以通过 overrides 重新启用。

## 配置

可选的 `gate.config.ts` 导出同步对象；这是由 Node 执行的可信项目代码，不支持顶层 await。
不需要 schema、contract、module、feature 或 boundary 登记清单。

```ts
import { defineConfig } from 'fp-gates/gates';

export default defineConfig({
  effectImports: ['better-sqlite3', 'some-network-sdk'],
  rules: {
    'commit-message': { scopes: ['root', 'app'] },
    'function-length': { warning: 80, maximum: 150 },
    'strict-fp': { 'no-null': false },
  },
});
```

任意规则可以设为 false。`files`、`ignores` 使用 `/` 路径与 `*`、`**`、`?` 通配符。
`effectImports` 使用完整的 import specifier，不是通配符。循环规则必须在项目级配置。
完整配置选项和严格检查项名称见英文说明。

## 边界理由写在代码旁

```ts
/**
 * @boundary 读取外部配置，将文件错误转换为 Result。
 * @effects node:fs/promises
 * @allow strict-fp/no-try -- 原生异常在这里转换，避免向调用方泄漏。
 */
import { readFile } from 'node:fs/promises';
import { ok, err } from 'fp-gates';

export const readConfiguration = async (path: string) => {
  try {
    return ok(await readFile(path, 'utf8'));
  } catch (cause) {
    return err(cause);
  }
};
```

- 顶部必须有一个非空的 `@boundary`，说明存在原因及对调用方的保证。
- 按实际用法重复 `@effects`，例如 `node:fs`、`process`、`fetch`、`Date.now`、`Math.random`。没有效果通配豁免。
- `@allow strict-fp/no-try -- 原因` 豁免整个文件的指定检查；`strict-fp/*` 豁免整条严格规则。
- 例外不能绕过边界要求、函数长度、循环依赖或提交消息检查。
- 未使用、重复、未知、格式错误的声明都报错；关闭严格规则不会让仍有对应语法的声明被误判为无用。
- 类型、schema 定义、纯转发、仅导入边界或编排调用都不足以证明需要 `.b.ts`。不强制其它角色后缀。

```ts
// 不应命名为 double.b.ts：写了原因也不能把纯计算变成边界。
/** @boundary 辅助计算。 */
export const double = (value: number) => value * 2;
```

工具检查可观察的语法、已知平台 API、导入绑定和简单别名；人审判断理由是否正当。
它无法推断任意第三方实现、反射或间接回调的副作用。项目需要配置数据库、网络 SDK 等效果依赖。

函数长度的局部例外沿用下面的形式，必须紧邻函数、理由非空，且函数仍超过警告阈值：

```ts
// gate-allow-next-function function-length -- 此分发表逐项对应一个外部格式，拆分会破坏对应关系。
```

## 暂存检查与 API

`check --staged` 从同一份 index 读取完整源码和配置，支持部分暂存。不 stash、不改工作区、不修改 index。
即使只改一个文件也检查完整依赖图。检查中 index 改变会报错。依赖使用已安装版本，workspace 源码使用暂存版本。
冲突、已跟踪的符号链接和 submodule 会明确拒绝，不会静默遗漏。

解析使用标准 package exports/imports、tsconfig paths 和带 exports 的 workspace 包。
解析失败、缺失依赖、被排除的内部源码、计算型 import 和 CommonJS require 会报错。
使用现有 hook 工具接入即可，本包不会自动安装 Git hooks。

`checkProject(root, config?)`、`checkStaged(root)` 返回诊断数组；操作性错误会抛出。
`runGates({files, imports}, config?)` 接收源码及完整的解析边，可用于其它集成。
`validateCommitMessage(message, config?)` 无需仓库即可使用。

CLI 支持 `--cwd` 和 `--json`。退出码 0 表示通过或只有警告，1 表示规则失败，2 表示执行或配置失败。

## 验证与手动发布

```sh
pnpm verify
pnpm test:package
npm publish .local/release/fp-gates-0.1.0.tgz --access public
```

最后一条由维护者手动执行；CI 只验证 Windows/Linux 和独立消费项目，不发布 npm。
安装包只包含编译后的 JS、类型声明、README、MIT 许可与 package 元数据。
发布包及报告位于 `.local`，独立临时消费项目在验证后清理。原项目的游戏内容、客户端材料、历史及专属治理设施不在本仓库中。
