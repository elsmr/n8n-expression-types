// Drives the built plugin against playground/ with no editor and prints what the editor
// would show. Run: pnpm smoke
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';

const init = createRequire(import.meta.url)('./entry.cjs') as (m: { typescript: typeof ts }) => {
	create(info: unknown): ts.LanguageService;
};

const projectDir = path.resolve(import.meta.dirname, '../../playground');
const parsed = ts.getParsedCommandLineOfConfigFile(path.join(projectDir, 'tsconfig.json'), {}, {
	...ts.sys,
	onUnRecoverableConfigFileDiagnostic: (d) => { throw new Error(String(d.messageText)); },
})!;

const files = new Map(parsed.fileNames.map((f) => [f, ts.sys.readFile(f) ?? ''] as const));
const host: ts.LanguageServiceHost = {
	getCompilationSettings: () => ({ ...parsed.options, plugins: undefined }),
	getScriptFileNames: () => [...files.keys()],
	getScriptVersion: () => '1',
	getScriptSnapshot: (f) => {
		const t = files.get(f) ?? ts.sys.readFile(f);
		return t === undefined ? undefined : ts.ScriptSnapshot.fromString(t);
	},
	getCurrentDirectory: () => projectDir,
	getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
	fileExists: ts.sys.fileExists,
	readFile: ts.sys.readFile,
	directoryExists: ts.sys.directoryExists,
	getDirectories: ts.sys.getDirectories,
	readDirectory: ts.sys.readDirectory,
};
const inner = ts.createLanguageService(host);
const ls = init({ typescript: ts }).create({
	languageService: inner,
	languageServiceHost: host,
	project: { getCurrentDirectory: () => projectDir, projectService: { logger: { info: () => {} } } },
	serverHost: ts.sys,
	config: {},
});

const one = (s: string | undefined, max = 110) => (s ?? '(none)').replace(/\s+/g, ' ').slice(0, max);
const parts = (p: Array<{ text: string }> | undefined) => p?.map((x) => x.text).join('');

const file = (name: string) => {
	const fileName = path.join(projectDir, name);
	const text = files.get(fileName)!;
	const sf = () => ls.getProgram()!.getSourceFile(fileName)!;
	const lineOf = (pos: number) => ts.getLineAndCharacterOfPosition(sf(), pos).line + 1;
	const at = (needle: string, delta = 0) => text.indexOf(needle) + delta;
	const own = new Set(inner.getSemanticDiagnostics(fileName).map((d) => `${d.start}:${d.code}`));

	console.log(`\n== ${name} ==`);
	console.log('Squiggles the plugin adds:');
	for (const d of ls.getSemanticDiagnostics(fileName).filter((d) => !own.has(`${d.start}:${d.code}`))) {
		console.log(`  L${lineOf(d.start!)}  ${one(ts.flattenDiagnosticMessageText(d.messageText, ' '))}`);
	}
	return {
		hover: (label: string, needle: string, delta = 0) => {
			const q = ls.getQuickInfoAtPosition(fileName, at(needle, delta));
			const doc = parts(q?.documentation);
			console.log(`  hover ${label.padEnd(22)} ${one(parts(q?.displayParts))}${doc ? `\n${' '.repeat(29)}${one(doc, 90)}` : ''}`);
		},
		complete: (label: string, needle: string, delta: number) => {
			const c = ls.getCompletionsAtPosition(fileName, at(needle, delta), undefined);
			console.log(`  complete ${label.padEnd(19)} ${c?.entries.slice(0, 8).map((e) => e.name).join(', ')}${(c?.entries.length ?? 0) > 8 ? ', ...' : ''}`);
		},
		fix: (needle: string) => {
			const start = at(needle);
			const fixes = ls.getCodeFixesAtPosition(fileName, start, start + needle.length, [2551], {}, {});
			console.log(`  quick fix on ${needle.padEnd(16)} ${fixes.map((f) => f.description).join('; ') || '(none)'}`);
		},
		hints: () => {
			const hs = ls.provideInlayHints(fileName, { start: 0, length: text.length }, {}).filter((h) => typeof h.text === 'string' && h.text.startsWith(': '));
			console.log(`  inlay hints after strings: ${hs.map((h) => `L${lineOf(h.position)}${h.text}`).join('  ')}`);
		},
		signature: (needle: string) => {
			const s = ls.getSignatureHelpItems(fileName, at(needle, needle.length), undefined)?.items[0];
			console.log(`  signature at ${needle.padEnd(16)} ${s ? one(parts(s.prefixDisplayParts.concat(s.parameters.flatMap((p) => p.displayParts)))) : '(none)'}`);
		},
	};
};

const desc = file('node-description.ts');
console.log('Hover and completions (no markers in this file; the slot types do the work):');
desc.hover('$parameter', '$parameter.operation +', 3);
desc.hover('$value', '$value.trim', 2);
desc.complete('after $value.', '$value.trim', '$value.'.length);
desc.signature('$now.minus(');

const strings = file('strings.ts');
console.log('Hover inside blocks is TypeScript\'s own, typed from the resolve() data:');
strings.hover('$json', '$json.n }} for', 2);
strings.hover('.user', '$json.user.name', '$json.'.length + 1);
strings.hover('.sum()', '.sum()', 2);
strings.hover('.toTitleCase()', '$json.test.toTitleCase()', '$json.test.'.length + 2);
strings.hover('{{ delimiter', "{{ $('Webhook')", 0);
strings.hover('the expr variable', 'const orderId', 'const '.length + 2);
strings.complete('after $json.user.', '$json.user.name', '$json.user.'.length);
strings.fix('toUppercase');
strings.hints();
