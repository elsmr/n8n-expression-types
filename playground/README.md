# Playground tour

Open this folder in VS Code with the extension loaded (`pnpm open` from the repo root, or
F5) or run `pnpm test` to see the same things asserted headless.

1. `node-description.ts`: a node definition with no markers. Hover `$parameter` on the
   `subtitle` line: its type comes from the `properties` array below. `$parameter.operaton`
   is underlined with "Did you mean 'operation'?". `maxItems` assigns an expression that
   yields a string to a `number` slot.
2. `demo.ts`: five sections. Declare with `expr()`, contexts, `resolve()` and `Resolve<>`
   against sample data, the language inside a block, and the error kinds. Hover `$json`
   inside a block, hover `{{`, hover a variable name. Put the cursor on `toUppercase` and
   open quick fixes. Type `$json.user.` for completions.
3. `lambda.ts`: the same idea as typed lambdas, no plugin involved.
4. `sample-data.ts`: the example data everything above is resolved against. In n8n this
   would come from a previous execution. Change a field and watch the diagnostics move.
5. `types.test.ts`: type-level assertions, run by `pnpm typecheck`.

