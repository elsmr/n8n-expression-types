# n8n expression types

n8n expressions are JavaScript inside strings: `={{ $json.user.email.toLowerCase() }}`.
Today nothing checks them before they run. This repo types them with TypeScript's own
checker, so the editor shows errors, hover types, completions and quick fixes.

```ts
const total = expr('={{ $input.all().map((i) => i.json.n).sum() }}');
//                       ^ hover: (method) Array<number>.sum(): number

resolve(total, sample); // number
resolve(typo, sample);  // N8nResolveError (typescript error):
//   Property 'toUppercase' does not exist on type 'string'. Did you mean 'toUpperCase'?
```

## Demo

```sh
pnpm install
pnpm open # Launches VS Code window with the extension loaded
```


## What you get

**Branded slots, zero edits.** When a field is declared as an expression, every literal
assigned to it is checked in that context. This is how existing node definitions get
coverage without touching them.

```ts
interface INodeTypeDescription { subtitle?: Expression<string, DescriptionContext> }
const description: INodeTypeDescription = { subtitle: '={{ $parameter.operation }}' };
```

**`expr()` where there is no slot.** Names the context, carries the text in its type.

```ts
const next = expr.httpPagination('={{ $response.body.next }}');   // Expr<HttpPaginationContext, "...">
const bad  = expr('={{ $pageCount }}');                           // InvalidExpr<...>: not in this context
```

**`resolve()` and `Resolve<>` are where data enters.** The expression is checked against
the data's type, and the result type is specific to that pairing. The lookup behind it is
a hidden file, `.n8n/expressions.d.ts`, written by the plugin while you type and by
`n8n-expressions typegen` before `tsc`. Plain `tsc`, no wrapper, nothing to commit.

```ts
const url: string = resolve(next, paginationSample);
type Url = Resolve<typeof next, typeof paginationSample>;        // string
type Bad = Resolve<typeof next, { response: { items: number[] } }>; // N8nResolveError
```

**Lambda form.** `expr()` also takes a lambda over the context. Same contexts and slots,
checked by TypeScript itself with runtime data loose; serialised to `={{ body }}` with
`fn.toString()`, so n8n sees an ordinary expression. `resolve()` returns the type the lambda
yields but cannot re-check the body against data: a body is checked once, where it is written.

```ts
expr(({ $json, $ }) => $json.n * $('Webhook').item.json.body.orderId);  // LambdaExpr<NodeParameterContext, number>
expr.httpPagination(({ $pageCount }) => $pageCount >= 10);              // LambdaExpr<HttpPaginationContext, boolean>
expr(({ $pageCount }) => $pageCount);                                   // error: not in this context
```

Serialisation reads compiled output, so it needs `target` >= ES2020 (no `?.` downlevelling)
and no minifier; a closure over a local compiles and breaks at runtime.

**Editor.** Everything TypeScript gives you, forwarded into the string: hover on `$json`
shows its type, `.toTitleCase` shows n8n's docs and example, `$now.minus(` shows Luxon's
signature, "Change spelling to 'toUpperCase'" is a quick fix, identifiers get semantic
colours. Works in any tsserver editor via tsconfig, or through the VS Code extension.

## How it works

1. **Find.** A scan of the program collects every expression: literals in branded slots,
   `expr()` arguments, `resolve()` sites. Each comes with its context and whatever shape is
   known: the data type at a `resolve()`, sibling `properties` for `$parameter`, or nothing.
2. **Check.** The code inside `{{ }}` is copied into a small TypeScript file that also
   declares the context's globals and n8n's extension methods. TypeScript checks that file;
   its errors, hover and completions are mapped back into the string.
3. **Flow.** TypeScript cannot parse a string at the type level, so result types reach the
   program through a lookup interface keyed by context and text, written to
   `.n8n/expressions.d.ts`. The plugin writes it while you type, `typegen` writes it before `tsc`.
   Absent, resolved types are `any`.

The globals per context follow `workflow-data-proxy.ts` and its callers; `extensions.d.ts`
is generated from `n8n-workflow`'s own doc metadata.

## Contexts

Interfaces over a runtime sample (`NodeParameterContext<R>`), shared by both forms.

| Context | Adds |
| --- | --- |
| `NodeParameterContext` | `$json`, `$input`, `$('Node')`, `$parameter`, `$itemIndex`, ... |
| `HttpPaginationContext` | `$request`, `$response`, `$version`, `$pageCount` |
| `RoutingContext` | `$credentials`, `$value`, `$response`, `$responseItem`, `$request`, `$self` |
| `DescriptionContext` | `$parameter`, `$nodeVersion`, `$self`; no item data |
| `CredentialContext` | `$self`, `$secrets`, `$vars`; no item data |

Runtime data with no known shape is loose (`any`): `$json.anything.goes()` passes, while
unknown globals, wrong contexts and typos on known types still fail. Data becomes strict
the moment it is passed to `resolve()`.

## Use it in a project

```sh
pnpm add @n8n/expression-types && pnpm add -D @n8n/expression-ts-plugin
```

```jsonc
// tsconfig.json
"compilerOptions": { "plugins": [{ "name": "@n8n/expression-ts-plugin" }] },  // any tsserver editor; not needed with the VS Code extension
"include": ["src", ".n8n/*.d.ts"]                                            // lets plain tsc see the lookup
```

Add `.n8n/` to `.gitignore`. Type the slots that hold expressions as `Expression<T, Context>`,
use `expr()` for loose strings, `resolve()` where data exists. Then:

```sh
n8n-expressions typegen && tsc
```

`typegen` fails on broken expressions and writes the lookup that makes `tsc` exact. Without
it `tsc` still passes; resolved types are `any`.

## Repo

| Path | What |
| --- | --- |
| `packages/@n8n/expression-types` | contexts, `expr`/`resolve`; what node code imports |
| `packages/@n8n/expression-ts-plugin` | the tsserver plugin and the `n8n-expressions typegen` CLI |
| `packages/vscode-n8n-expressions` | VS Code extension: `{{ }}` highlighting, bundles the plugin |
| `playground` | The tour and the type tests |
| `scripts` | `gen-extensions`, the only code that reads `n8n-workflow` |

```sh
pnpm test         # plugin behaviour, headless and against a real tsserver
pnpm typecheck    # build, typegen, then plain tsc on plugin and playground
pnpm typegen      # n8n-expressions typegen on the playground: lookup + expression report
pnpm dev          # rebuild core and plugin on change
```
