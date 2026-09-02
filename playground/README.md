# Playground tour

Open this folder in the Extension Development Host (F5 from the repo root) or run
`pnpm smoke` from the repo root to see the same things printed.

1. `node-description.ts`: a node definition with no markers. Hover `$parameter` on the
   `subtitle` line: its type comes from the `properties` array below. Line 42 has a typo,
   `$parameter.operaton`, underlined with "Did you mean 'operation'?". Line 33 assigns an
   expression yielding a string to a `number` slot.
2. `strings.ts`: `expr()` declarations at the top, `resolve()` and `Resolve<>` against
   sample data below. Hover `$json` inside a block, hover `{{`, hover the variable name.
   Put the cursor on `toUppercase` and open quick fixes. Type `$json.user.` for completions.
3. `lambda.ts`: the same expressions as typed lambdas, no plugin involved.
4. `types.test.ts`: the type-level assertions that `pnpm typecheck` runs.
5. `runtime.ts`: the sample data everything above is typed against. Change a field and
   watch the diagnostics move.

`service-demo.ts` shows the service API without an editor (`pnpm demo`).

