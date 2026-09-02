# n8n expression types

Static types, diagnostics and completions for n8n expressions (`={{ ... }}`).

| File | What |
| --- | --- |
| `type-level.ts` | Pure type-level resolver. Only `$json` paths. Paste into the TS playground. |
| `globals.ts` | Generates the ambient `.d.ts` an expression sees: root `$` globals, n8n extension methods (read from `n8n-workflow` doc metadata), and runtime-shaped types injected via `RuntimeTypes`. |
| `service.ts` | Drives the TypeScript language service over a virtual file. `analyze()` gives per-block types and errors, `completionsAt()` gives completions at a cursor. |
| `playground/` | Open `expressions.ts` in VS Code: hover for return types, squiggles for errors. `pnpm playground` regenerates `globals.d.ts` from `example-runtime.ts`. |
| `demo.ts` | Example with injected runtime shapes for `$json`, `$binary`, `$('Node')`, `$parameter`, `$vars`. |

```sh
pnpm install
pnpm demo              # run the examples
pnpm demo -- --globals # also print the generated .d.ts
pnpm typecheck
pnpm playground       # regenerate playground/globals.d.ts
```

## Rules mirrored from n8n

- A value without a leading `=` is a literal string.
- One `{{ }}` block and no surrounding text returns the block's value as-is. Anything else concatenates to a string (`@n8n/tournament` `ExpressionBuilder`).
- Each block body is a single JS expression statement.
- Extension methods (`.toTitleCase()`, `.first()`, `.plus()`) come from `packages/workflow/src/extensions/*` and apply to string, number, boolean, array, object, `Date` and luxon `DateTime`.
- Root globals come from `packages/workflow/src/workflow-data-proxy.ts` and `packages/core/.../get-additional-keys.ts`.

## Known approximations

- Doc metadata types are informal. `any` in the output usually means the doc says `any`.
- `$item()`, `$tool`, `$fromAI()`, `$jmespath()`, `$evaluateExpression()` are `any` by nature.
- The sandbox rules (`constructor`, `__proto__`, bare `$`, class extension) are not enforced here.
