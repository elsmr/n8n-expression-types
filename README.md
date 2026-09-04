# n8n expression types

n8n expressions are JavaScript inside strings: `={{ $json.orderId }}`.
Nothing checks them before they run. This repo hands them to TypeScript's own checker, so the
editor shows types, n8n's method docs, completions and quick fixes inside the string, and
`n8n-expressions check` fails the build on expressions that will not work.

```ts
const orderId = expr("={{ $('Webhook').item.json.body.orderId }}");
const when = expr('={{ $now.toISo() }}');
//                          ^ Property 'toISo' does not exist on type 'DateTime'.
//                            Did you mean 'toISO'?   (quick fix: Change spelling)

resolve(orderId, sample); // number, from the sample's Webhook output
```

## Run it

```sh
pnpm install
pnpm open # Opens VSCode with the extension loaded
```

## Features

**Editor.** Everything TypeScript gives you, forwarded into the string: hover on `{{` shows
the block's result type, `.toTitleCase` shows n8n's docs and example, `$now.minus(` shows
Luxon's signature, "Change spelling to 'toISO'" is a quick fix, identifiers get semantic
colours. Works in any tsserver editor via tsconfig, or through the VS Code extension.

**Typed globals.** `$json`, `$input`, `$('Node')`, `$binary`, `$vars`, `$now`,
`$if`, and every n8n extension method carry their real types. Item data has no known shape
until data arrives, so `$json.anything` passes; unknown globals, wrong contexts and typos on
known types fail.

```ts
expr("={{ $('Webhook').params.httpMethod }}"); // hover .params, .item: n8n's node data shape
expr('={{ $json.user.emails.first().isEmail() }}'); // n8n extensions
expr('={{ $input.all().map((i) => i.json.n).sum() }}');
//     ^ hover {{: (block) ...: number
expr('={{ $pageCount }}'); // InvalidExpr: not a node-parameter global
```

**Real data makes it exact.** `resolve()` and `Resolve<>` check the expression against the
data's type. The result type is specific to that pairing, and a field the data does not have
is an error at the `resolve()` site.

```ts
resolve(orderId, sample); // number
type Method = Resolve<typeof method, typeof sample>; // string
type Ok = Resolve<typeof email, typeof sample>; // boolean

const typo = expr('={{ $json.user.name.toUppercase() }}'); // fine here: $json is loose
resolve(typo, sample);
// Property 'toUppercase' does not exist on type 'string'. Did you mean 'toUpperCase'?
// (in '={{ $json.user.name.toUppercase() }}' against this data)
```

The lookup behind `Resolve<>` is a hidden file, `.n8n/expressions.d.ts`, written by the plugin
while you type and by `n8n-expressions check` before `tsc`. Plain `tsc`, no wrapper, nothing
to commit.

**Lambda form.** `expr()` also takes a lambda over the context. Same contexts and globals,
checked by TypeScript itself with no plugin involved; serialised to `={{ body }}` with
`fn.toString()`, so n8n sees an ordinary expression. `resolve()` returns the type the lambda
yields but cannot re-check the body against data.

```ts
expr(({ $ }) => $('Webhook').item.json.body.orderId);       // LambdaExpr<NodeParameterContext, any>
expr.httpPagination(({ $pageCount }) => $pageCount >= 10);  // LambdaExpr<HttpPaginationContext, boolean>
expr(({ $now }) => $now.toISo());                           // error: Did you mean 'toISO'?
expr(({ $pageCount }) => $pageCount);                       // error: not in this context
```



**Other contexts.** Pagination, routing, credential and description expressions each get
their own globals; see [Contexts](#contexts).

```ts
expr.httpPagination('={{ $response.body.next }}');   // Expr<HttpPaginationContext, "...">
expr.credential('={{ "Bearer " + $self.apiKey }}');
```

**Existing nodes, zero edits.** A field declared as `Expression<T, Context>` checks every
literal assigned to it in that context. This is how node definitions get coverage without
changing them.

```ts
interface INodeTypeDescription { subtitle?: Expression<string, DescriptionContext> }
const description: INodeTypeDescription = { subtitle: '={{ $parameter.operation }}' };
```


## How it works

1. **Find.** A scan of the program collects every expression: literals in branded slots,
   `expr()` arguments, `resolve()` sites. Each comes with its context and whatever shape is
   known: the data type at a `resolve()`, sibling `properties` for `$parameter`, or nothing.
2. **Check.** The code inside `{{ }}` is copied into a small TypeScript file that also
   declares the context's globals and n8n's extension methods. TypeScript checks that file;
   its errors, hover and completions are mapped back into the string.
3. **Flow.** TypeScript cannot parse a string at the type level, so result types reach the
   program through a lookup interface keyed by context and text, written to
   `.n8n/expressions.d.ts`. The plugin writes it while you type, `check` writes it before `tsc`.
   Absent, resolved types are `any`.

The globals per context follow `workflow-data-proxy.ts` and its callers; `extensions.ts`
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
n8n-expressions check && tsc
```

`check` reports broken expressions in tsc's format, at the string's position, and writes the
lookup that makes `tsc` exact. Without it `tsc` still passes; resolved types are `any`.

## Repo

| Path | What |
| --- | --- |
| `packages/@n8n/expression-types` | contexts, `expr`/`resolve`; what node code imports |
| `packages/@n8n/expression-ts-plugin` | the tsserver plugin and the `n8n-expressions check` CLI |
| `packages/vscode-n8n-expressions` | VS Code extension: `{{ }}` highlighting, bundles the plugin |
| `playground` | The tour and the type tests |
| `scripts` | `gen-extensions`, the only code that reads `n8n-workflow` |

```sh
pnpm test         # plugin behaviour, headless and against a real tsserver
pnpm typecheck    # build, check, then plain tsc on plugin and playground
pnpm check        # n8n-expressions check on the playground: expression report + lookup
pnpm dev          # rebuild core and plugin on change
```
