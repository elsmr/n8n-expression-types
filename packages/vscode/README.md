# n8n Expressions for VS Code

Highlights `{{ }}` blocks inside strings and loads `@n8n/expression-ts-plugin` into the
TypeScript server, so `=...{{ }}` strings get diagnostics, hover, completions and inlay
hints without any tsconfig change. The plugin also works on its own from tsconfig.

Develop: press F5 in the repo root (launch config "Extension: playground").
