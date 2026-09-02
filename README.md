# n8n expression types

n8n expressions are JavaScript inside strings: `={{ $json.user.email.toLowerCase() }}`.
Today nothing checks them before they run. This repo types them with TypeScript's own
checker, so the editor shows errors, hover types, completions and quick fixes inside the
string, the resulting type flows into surrounding code, and CI can gate on it.

```ts
const total = expr('={{ $input.all().map((i) => i.json.n).sum() }}');
//                       ^ hover: (method) Array<number>.sum(): number

resolve(total, runtime);                 // number
resolve(typo, runtime);                  // N8nResolveError, and the line is underlined:
//   Property 'toUppercase' does not exist on type 'string'. Did you mean 'toUpperCase'?
```

## See it

```sh
pnpm install
pnpm open        # VS Code with the extension loaded, on playground/node-description.ts
```

`playground/README.md` is a five-step tour of what to hover. Other routes: F5 from the
repo root does the same as `pnpm open`; `pnpm vsix` builds an installable extension for
any workspace (`code --install-extension n8n-expressions.vsix`); `pnpm test` drives the
plugin headless and asserts what it shows.

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
the data's type, and the result type is specific to that pairing.

```ts
const url: string = resolve(next, pagination);
type Url = Resolve<typeof next, typeof pagination>;              // string
type Bad = Resolve<typeof next, { response: { items: number[] } }>; // N8nResolveError
```

**Lambda form.** For expressions authored in TypeScript: no parser, native checking.

```ts
expression(({ $json, $ }) => $json.n * $('Webhook').item.json.body.orderId, runtime);
```

**Editor.** Everything TypeScript gives you, forwarded into the string: hover on `$json`
shows its type, `.toTitleCase` shows n8n's docs and example, `$now.minus(` shows Luxon's
signature, "Change spelling to 'toUpperCase'" is a quick fix, identifiers get semantic
colours. Works in any tsserver editor via tsconfig, or through the VS Code extension.

## How it works

```mermaid
flowchart LR
  src[TS source] --> scan[scan: branded slot / expr() / resolve()]
  scan --> shape[shape: data type, sibling properties, or loose]
  shape --> vf[virtual TS file per expression<br/>+ globals for the context<br/>+ extensions.d.ts]
  vf --> ls[TypeScript language service]
  ls --> plugin[tsserver plugin: diagnostics, hover, completions, fixes]
  ls --> gen[gen-resolved: n8n-resolved.d.ts lookup + CI report]
```

Each `{{ }}` body becomes `const __r0 = (<body>);` in a virtual file next to ambient
declarations for the context: `$json`, `$input`, `$('Node')`, `$now`, and the n8n
extension methods. The checker does the rest. TypeScript cannot parse a string at the
type level, so the result types reach the program through a generated lookup keyed by
context and text; the plugin rewrites it as you type, `gen-resolved` does it in CI.

Grounded in n8n's code: the globals per context come from `workflow-data-proxy.ts`,
`get-additional-keys.ts`, `routing-node.ts` and `pagination.ts`; `extensions.d.ts` is
generated from `n8n-workflow`'s own doc metadata; `pnpm drift` fails when n8n adds a
global the layers do not declare.

## Contexts

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

## Repo

| Path | What |
| --- | --- |
| `packages/core` | `@n8n/expression-types`: service, contexts and globals, `expr`/`resolve`, lambda form, generators, drift check |
| `packages/plugin` | `@n8n/expression-ts-plugin`: the tsserver plugin |
| `packages/vscode` | VS Code extension: `{{ }}` highlighting, bundles the plugin |
| `playground` | The tour, type tests, `service-demo.ts` |
| `docs/design.md` | Decisions, alternatives rejected, known gaps, cost numbers |

```sh
pnpm test         # plugin behaviour, headless
pnpm typecheck    # core, plugin, generate lookup, playground incl. type tests
pnpm demo         # service API without an editor
pnpm drift        # n8n-workflow globals vs declared layers
```

TypeScript is pinned to 6.x: `typescript@7` is the Go compiler and has no language
service API or plugin model yet. Packages are private.
