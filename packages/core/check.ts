// `tsc` with the expression lookup injected, the way vue-tsc wraps tsc: plain tsc has no
// plugin hook, so this is how CI gets the flowing types without a generated file on disk.
// Also prints the expression diagnostics themselves; they fail the run unless
// --expression-errors=warn is passed (the playground shows errors on purpose).
//   tsx check.ts path/to/tsconfig.json [--expression-errors=warn] [--dump-lookup=path]
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createExpressionService } from './service.ts';
import { collectResolved, renderResolved } from './scan.ts';

const args = process.argv.slice(2);
const expressionErrorsWarn = args.includes('--expression-errors=warn');
const dumpLookup = args.find((a) => a.startsWith('--dump-lookup='))?.slice('--dump-lookup='.length);
const configPath = path.resolve(args.find((a) => !a.startsWith('--')) ?? 'tsconfig.json');
const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
	...ts.sys,
	onUnRecoverableConfigFileDiagnostic: (d) => {
		throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
	},
})!;

const LOOKUP = path.join(path.dirname(configPath), '__n8n-expressions-lookup__.d.ts');
let lookup = renderResolved(new Map());

const host = ts.createCompilerHost(parsed.options);
const fileExists = host.fileExists.bind(host);
const readFile = host.readFile.bind(host);
const getSourceFile = host.getSourceFile.bind(host);
host.fileExists = (f) => f === LOOKUP || fileExists(f);
host.readFile = (f) => (f === LOOKUP ? lookup : readFile(f));
host.getSourceFile = (f, lang, onError, shouldCreate) =>
	f === LOOKUP ? ts.createSourceFile(f, lookup, lang, true) : getSourceFile(f, lang, onError, shouldCreate);

// First program: find the expressions and type them. Second: the same program with the
// lookup filled in; unchanged files are reused from the first.
const first = ts.createProgram([LOOKUP, ...parsed.fileNames], parsed.options, host);
const service = createExpressionService({ ts, root: import.meta.dirname });
const { entries, reports } = collectResolved(ts, service, first);
lookup = renderResolved(entries);
if (dumpLookup) writeFileSync(dumpLookup, lookup);
const program = ts.createProgram([LOOKUP, ...parsed.fileNames], parsed.options, host, first);

const format = ts.formatDiagnosticsWithColorAndContext(
	ts.getPreEmitDiagnostics(program).filter((d) => d.file?.fileName !== LOOKUP),
	{ getCanonicalFileName: (f) => f, getCurrentDirectory: () => process.cwd(), getNewLine: () => '\n' },
);
if (format) console.log(format);
for (const r of reports) console.log(`${path.relative(process.cwd(), r.file)}:${r.line}: ${r.message}`);
const failed = format.length > 0 || (reports.length > 0 && !expressionErrorsWarn);
console.log(`${failed ? 'problems found' : 'ok'}: ${entries.size} expressions, ${reports.length} expression diagnostics`);
process.exit(failed ? 1 : 0);
