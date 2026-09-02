// Writes the generated globals next to playground/expressions.ts so VS Code's
// TypeScript server shows the same types and errors the service reports.
import { writeFileSync } from 'node:fs';
import { globalsFor } from './service.ts';
import { runtime } from './example-runtime.ts';

writeFileSync(new URL('./playground/globals.d.ts', import.meta.url), globalsFor(runtime));
console.log('wrote playground/globals.d.ts');
