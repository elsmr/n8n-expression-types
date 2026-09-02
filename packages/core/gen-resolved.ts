// CLI twin of the plugin's generator, for CI and plain `tsc`. Writes n8n-resolved.d.ts
// and prints every expression diagnostic; `--fail-on-error` exits 1 when there are any.
//   tsx gen-resolved.ts path/to/tsconfig.json [--fail-on-error]
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createExpressionService } from './service.ts';
import { collectResolved, renderResolved } from './scan.ts';

const args = process.argv.slice(2);
const failOnError = args.includes('--fail-on-error');
const configPath = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'tsconfig.json');
const dir = path.dirname(configPath);

const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
	...ts.sys,
	onUnRecoverableConfigFileDiagnostic: (d) => {
		throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
	},
})!;
const program = ts.createProgram(parsed.fileNames, parsed.options);
const service = createExpressionService({ ts, root: import.meta.dirname });
const { entries, reports } = collectResolved(ts, service, program);
const out = path.join(dir, 'n8n-resolved.d.ts');
writeFileSync(out, renderResolved(entries));
console.log(`wrote ${path.relative(process.cwd(), out)} (${entries.size} expressions)`);
for (const r of reports) console.log(`${path.relative(process.cwd(), r.file)}:${r.line}: ${r.message}`);
if (failOnError && reports.length > 0) process.exit(1);
