// CLI twin of the plugin's generator, for CI and plain `tsc`:
//   tsx gen-resolved.ts path/to/tsconfig.json
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createExpressionService } from './service.ts';
import { collectResolved, renderResolved } from './scan.ts';

const configPath = path.resolve(process.argv[2] ?? 'tsconfig.json');
const dir = path.dirname(configPath);

const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
	...ts.sys,
	onUnRecoverableConfigFileDiagnostic: (d) => {
		throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
	},
})!;
const program = ts.createProgram(parsed.fileNames, parsed.options);
const service = createExpressionService({ ts, root: import.meta.dirname });
const entries = collectResolved(ts, service, program);
const out = path.join(dir, 'n8n-resolved.d.ts');
writeFileSync(out, renderResolved(entries));
console.log(`wrote ${path.relative(process.cwd(), out)} (${entries.size} expressions)`);
