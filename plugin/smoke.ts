// Drives the built plugin against playground/ without an editor.
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';

const init = createRequire(import.meta.url)('./entry.cjs') as (m: { typescript: typeof ts }) => {
	create(info: unknown): ts.LanguageService;
};

const projectDir = path.resolve(import.meta.dirname, '../playground');
const configPath = path.join(projectDir, 'tsconfig.json');
const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, {
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
const logs: string[] = [];
const ls = init({ typescript: ts }).create({
	languageService: inner,
	languageServiceHost: host,
	project: { getCurrentDirectory: () => projectDir, projectService: { logger: { info: (m: string) => logs.push(m) } } },
	serverHost: ts.sys,
	config: {},
});

const file = path.join(projectDir, 'strings.ts');
const text = files.get(file)!;
const diags = ls.getSemanticDiagnostics(file).filter((d) => d.source === 'n8n-expression');
console.log('diagnostics:');
for (const d of diags) {
	const { line } = ts.getLineAndCharacterOfPosition(ls.getProgram()!.getSourceFile(file)!, d.start!);
	console.log(`  L${line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
}

const at = (needle: string, delta = 0) => text.indexOf(needle) + delta;
const hover = ls.getQuickInfoAtPosition(file, at('body.orderId', 6));
console.log('\nhover on orderId:', hover?.displayParts?.map((p) => p.text).join(''));

const completions = ls.getCompletionsAtPosition(file, at('$json.user.name', '$json.user.'.length), undefined);
console.log('\ncompletions after $json.user.:', completions?.entries.map((e) => e.name).join(', '));

const plain = at("$json.test.toTitleCase()", '$json.test.'.length);
const c2 = ls.getCompletionsAtPosition(file, plain, undefined);
console.log('completions after $json.test. (plain literal, runtime.json):', c2?.entries.slice(0, 8).map((e) => e.name).join(', '), '...');

const hints = ls.provideInlayHints(file, { start: 0, length: text.length }, {});
console.log('\ninlay hints:');
for (const h of hints) {
	const { line } = ts.getLineAndCharacterOfPosition(ls.getProgram()!.getSourceFile(file)!, h.position);
	console.log(`  L${line + 1} ${typeof h.text === 'string' ? h.text : ''}`);
}
console.log('\nlogs:', logs.join(' | '));
