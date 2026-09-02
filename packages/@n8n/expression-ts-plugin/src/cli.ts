#!/usr/bin/env node
// n8n-expressions typegen [tsconfig] [--expression-errors=warn]   (default: ./tsconfig.json)
// Writes the expression lookup for a project and reports every expression diagnostic.
// Run it before plain `tsc`. Expression diagnostics fail the run unless
// --expression-errors=warn is passed.
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { createExpressionService } from './service.ts';
import { collectResolved, renderResolved } from './scan.ts';
import { lookupFile, writeLookup } from './lookup-file.ts';

const [command, ...args] = process.argv.slice(2);
if (command !== 'typegen') {
	console.error('usage: n8n-expressions typegen [tsconfig] [--expression-errors=warn]');
	process.exit(2);
}
const warnOnly = args.includes('--expression-errors=warn');
const configPath = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'tsconfig.json');
const projectDir = path.dirname(configPath);

const parsed = ts.getParsedCommandLineOfConfigFile(
	configPath,
	{},
	{
		...ts.sys,
		onUnRecoverableConfigFileDiagnostic: (d) => {
			throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
		},
	},
)!;
const program = ts.createProgram(parsed.fileNames, parsed.options);
const root = path.dirname(
	createRequire(import.meta.url).resolve('@n8n/expression-types/package.json'),
);
const service = createExpressionService({ ts, root });
const { entries, reports } = collectResolved(ts, service, program);
const written = writeLookup(projectDir, renderResolved(entries));

for (const r of reports)
	console.log(`${path.relative(process.cwd(), r.file)}:${r.line}: ${r.message}`);
console.log(
	`${written ? 'wrote' : 'unchanged'} ${path.relative(process.cwd(), lookupFile(projectDir))}: ${entries.size} expressions, ${reports.length} expression diagnostics`,
);
process.exit(reports.length > 0 && !warnOnly ? 1 : 0);
