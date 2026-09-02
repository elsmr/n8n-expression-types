# n8n expression types

Static types, diagnostics and completions for n8n expressions (`={{ ... }}`), driven by
the TypeScript language service. A pnpm monorepo:

| Package | What |
| --- | --- |
| `packages/core` (`n8n-expression-types`) | The service, the globals per context, `expr()`/`resolve()`, the lambda form, generators. |
| `packages/plugin` (`n8n-expression-ts-plugin`) | tsserver plugin: diagnostics, hover, completions, inlay hints, and it keeps `n8n-resolved.d.ts` in sync. |
| `packages/vscode` | VS Code extension: `{{ }}` highlighting in strings, and it loads the plugin via `typescriptServerPlugins`. |
| `playground` | Examples. Open in VS Code, or `pnpm smoke` to drive the plugin headless. |

```sh
pnpm install          # also builds the plugin
pnpm smoke            # plugin against playground/, no editor
pnpm typecheck        # core, plugin, generate lookup, playground
pnpm demo             # service API examples
pnpm drift            # n8n-workflow globals vs declared layers
pnpm gen-extensions   # regenerate extensions.d.ts after bumping n8n-workflow
```

TypeScript is pinned to 6.x on purpose. `typescript@7` is the Go compiler: no
`createLanguageService`, no plugin model. VS Code 1.135 bundles 6.0.3; the workspace
settings keep `tsgo` off. Press F5 for an Extension Development Host on `playground/`.

## Marking an expression

Every expression is marked explicitly. There is no default and no bare-string scan.

**Branded slot.** The interface says a field is an expression and in which context, once:

```ts
interface INodeTypeDescription { subtitle?: Expression<string, 'description'>; ... }
const description: INodeTypeDescription = { subtitle: '={{ $parameter.operation }}' };
//                                                     ^ checked; $parameter derived from `properties`
```

**Call.** Where no slot exists, `expr()` names the context. It never carries data:

```ts
const paged = expr.httpPagination('={{ $response.body.next }}');   // Expr<"httpPagination", "...">
const total = expr('={{ $input.all().map((i) => i.json.n).sum() }}');  // Expr<"nodeParameter", "...">
const bad   = expr('={{ $pageCount }}');                            // InvalidExpr<"nodeParameter", "...">
```

`Expr` and `InvalidExpr` show the declaration; the result type is derived inside and
surfaces through slots, `resolve()` and `Resolve<>`.

**Evaluation** is n8n's. `resolve(expression, data)` is where data enters, and
`Resolve<typeof expression, typeof data>` is the same check as a type, without a call. The plugin
checks the expression against `data` at the call, and the generated lookup takes the
type from there: `total` above is `Expression<number>` once `resolve(total, runtime)`
exists, `resolve(typo, runtime)` is `N8nResolveError`, and an expression that
is never resolved keeps its loose definition-time type. The plugin writes
`<project>/n8n-resolved.d.ts`; `pnpm gen-resolved` does the same for CI.

## Contexts

| Context | Layers | Extra globals |
| --- | --- | --- |
| `nodeParameter` | core, item | `$json`, `$input`, `$('Node')`, `$parameter`, ... |
| `httpPagination` | core, item, pagination | `$request`, `$response`, `$version`, `$pageCount` |
| `routing` | core, item, routing | `$credentials`, `$value`, `$response`, `$responseItem`, `$request`, `$self` |
| `description` | core, description | `$parameter`, `$nodeVersion`, `$self`; no item data |
| `credential` | core, credential | `$self`, `$secrets`; no item data |

Two error types, both unassignable: `N8nInvalidExpression` means the text is wrong in
its context regardless of data (syntax, unknown global, typo on a known method).
`N8nResolveError` means the expression is fine but the data it was resolved against does
not fit. The messages are diagnostics, in the editor from the plugin and in CI from
`gen-resolved` (`--fail-on-error` to gate).

Shapes: a runtime/data argument when present, else what the surrounding code declares
(`$parameter` from the enclosing `properties`, `$value` from the enclosing property),
else `N8nLooseJson` (`any`): JSON-legal, unchecked.

## Lambda form

```ts
expression(({ $json, $ }) => $json.n * $('Webhook').item.json.body.orderId, runtime)
// Expression<number>, serialises to "={{ ... }}"
```

Prototype only: free variables are not detected yet, so a closure over a local compiles
and breaks at runtime.

## Known gaps

- Doc metadata types are informal; `any` in extension signatures means the doc said `any`.
- Sandbox rules (`constructor`, `__proto__`, bare `$`, class extension) are not enforced.
- Position mapping assumes no escape sequences inside the literal.
- `$parameter` ignores `displayOptions` and node versions; the union of all properties.
- Slot checks only run when the slot's type spells out primitives; named types are skipped.
- The plugin resolves `shapes.d.ts`, `extensions.d.ts` and luxon from `packages/core`; a
  published package would carry them itself.
