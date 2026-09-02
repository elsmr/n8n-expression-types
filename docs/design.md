# Design

## The problem

An n8n expression is arbitrary JavaScript inside `{{ }}` in a string. TypeScript cannot
type-check a string at the type level, and a type-level JS parser is not viable beyond
toy grammars. Yet the checker is exactly the tool that knows string methods, Luxon,
optional chaining and the shape of a JSON sample.

## Approach

Run a second TypeScript language service over a virtual file. Every block body becomes a
statement; ambient declarations provide the globals for the context; `extensions.d.ts`
provides n8n's extension methods. Types, diagnostics, completions, quick fixes and
signature help come out of the checker unchanged, with positions mapped back into the
literal.

Result types reach the host program through a generated global interface,
`N8nResolvedTypes`, keyed by `context::text`. The plugin rewrites the file while you
type; `gen-resolved` does the same for CI. There is precedent for a plugin writing its
own output in the GraphQL tooling world.

## Decisions

**Explicit markers, no default.** A string is an expression when its contextual type is
a branded `Expression<T, C>` slot, or when it is the argument of `expr()`. There is no
bare-string scan and no default context; both were judged error prone. Slots give
zero-edit coverage of existing code, since the mark is declared once by the interface
author. `expr.<context>()` covers everything else.

**No tagged templates.** A tag receives `TemplateStringsArray` and gets no literal type
for the text, so it can never carry a result type. `${` inside a template literal also
clashes with expressions that contain JS template literals. `expr(`...`)` with a
no-substitution template still works when quotes are a nuisance.

**Data enters only at `resolve()`.** `expr()` declares; its type is what the text yields
with runtime holes loose. `resolve(expression, data)` and the type-only
`Resolve<typeof expression, typeof data>` check against real data. The lookup records
`[dataType, result]` pairs per site and `Resolve<>` selects by structural identity, so the
same expression can be `string` against one data set and `N8nResolveError` against
another. A site that fails is reported at that site and does not poison the others.

**Two error types, no messages in generics.** `N8nInvalidExpression`: the text is wrong
in its context, whatever the data. `N8nResolveError`: the expression is fine, this data
does not fit. Both are unassignable. The messages are diagnostics, from the plugin in the
editor and from `gen-resolved --fail-on-error` in CI.

**Loose by default, strict against data.** A runtime hole with no shape is `any`, so
`$json.anything.goes()` passes. Globals, contexts and methods on known types are still
checked. `any` is the only type that permits arbitrary chains without errors; hover hides
it behind `Expr<Context, text>`.

**Contexts as registered interfaces.** Each context is an interface on the global
`N8nExpressionContexts` plus a `defineContext({ name, layers })` call. `name` is the one
string, internal, from which the lookup key derives. Layers: `core`, `item`,
`pagination`, `routing`, `description`, `credential`.

**Static shapes where the code has them.** `$parameter` is derived from the enclosing
`properties` array, `$value` from the enclosing property's `type`. Union of all
properties; `displayOptions` and node versions are ignored on purpose.

**Slot type mismatches are errors.** `Expression<number, ...>` receiving an expression
that yields `string` is reported, when the slot type spells out primitives.

## Alternatives rejected

- Pure type-level parser: exact for `$json.a.b` paths and a fixed method table, never
  arbitrary JS. Kept as `playground/type-level.ts`.
- Language service plugin only: cannot change what the checker infers, so no types flow.
- VS Code extension only: works in one editor; the plugin works in any tsserver editor and
  the extension bundles it.
- Default context from `runtime.json`: silent wrong answers.

## Cost

Measured on the playground, TypeScript 6.0.3:

| | |
| --- | --- |
| First analysis in a session | 148 ms |
| Per expression analysis | 5.5 ms |
| Per hover inside a block | 4.1 ms |
| Generated lookup for 10 expressions with 6 data pairings | 8 KB |

Analyses are cached per file version; hover does not re-analyse. The lookup file grows
with the number of distinct expression and data-type pairings.

## Known gaps

- Sample-derived types produce false errors for fields the sample lacks; the loose default
  limits this to sites that pass data.
- The lambda form serialises with `fn.toString()` and does not detect free variables.
- `$parameter` ignores `displayOptions` and versions. `$self` is loose.
- Slot checks skip slot types that name non-portable types.
- Position mapping assumes no escape sequences in the literal.
- Data types that name your own interfaces are not portable into the lookup and fall back
  to the loose type.
- The plugin resolves `shapes.d.ts`, `extensions.d.ts` and Luxon from `packages/core`; a
  published package must carry them.
- TypeScript 7 has no language service API or plugin model; everything here needs 6.x.

## Next steps

1. PR the `Expression<T, Context>` brands into `n8n-workflow`'s `INodeTypeDescription`
   and `INodeProperties`, so `nodes-base` gets coverage with no edits.
2. Reuse the service in editor-ui's existing TypeScript worker for expressions typed in
   the UI, with shapes from execution data.
3. Sandbox rules and free-variable detection for the lambda form as AST checks.
