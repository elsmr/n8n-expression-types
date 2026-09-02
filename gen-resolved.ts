// CLI twin of the plugin's generator, for CI and plain `tsc`:
//   tsx gen-resolved.ts playground/tsconfig.json
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { shapeFromValues, type RuntimeTypes } from './globals.ts';
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

const runtimePath = path.join(dir, 'runtime.json');
const defaultRuntime: RuntimeTypes = existsSync(runtimePath)
	? JSON.parse(readFileSync(runtimePath, 'utf8'))
	: { input: { json: {} } };

const service = createExpressionService({ ts, root: import.meta.dirname });
const entries = collectResolved(ts, service, program, shapeFromValues(defaultRuntime));
const out = path.join(dir, 'n8n-resolved.d.ts');
writeFileSync(out, renderResolved(entries));
console.log(`wrote ${path.relative(process.cwd(), out)} (${entries.size} expressions)`);
