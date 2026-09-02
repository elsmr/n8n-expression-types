// Drives the built plugin against playground/ without an editor.
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';

const init = createRequire(import.meta.url)('./entry.cjs') as (m: { typescript: typeof ts }) => {
	create(info: unknown): ts.LanguageService;
};

const projectDir = path.resolve(import.meta.dirname, '../../playground');
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
console.log('  (type-only Resolve<> diagnostics appear above at their line)');
const show = (label: string, q: ts.QuickInfo | undefined) =>
	console.log(`  ${label}: ${q?.displayParts?.map((p) => p.text).join('').replace(/\n/g, ' ') ?? '(none)'}`);
console.log('\nhover (strings.ts):');
show('$json', ls.getQuickInfoAtPosition(file, at('$json.n }} for', 2)));
show('.user', ls.getQuickInfoAtPosition(file, at('$json.user.name', '$json.'.length + 1)));
show('$input.all', ls.getQuickInfoAtPosition(file, at('$input.all()', '$input.'.length + 1)));
show('.sum()', ls.getQuickInfoAtPosition(file, at('.sum()', 2)));
show('{{ delimiter', ls.getQuickInfoAtPosition(file, at("{{ $('Webhook')", 0)));
show('}} delimiter', ls.getQuickInfoAtPosition(file, at("orderId }}", 'orderId '.length + 1)));
show('text outside blocks', ls.getQuickInfoAtPosition(file, at('=Order', 2)));
show('$pageCount (invalid)', ls.getQuickInfoAtPosition(file, at('$pageCount }}', 2)));
show('.toTitleCase (docs)', ls.getQuickInfoAtPosition(file, at('$json.test.toTitleCase()', '$json.test.'.length + 2)));
const doc = ls.getQuickInfoAtPosition(file, at('$json.test.toTitleCase()', '$json.test.'.length + 2))?.documentation?.map((p) => p.text).join('');
console.log('  .toTitleCase documentation:', doc?.slice(0, 120));
const descFile = path.join(projectDir, 'node-description.ts');
const dt = files.get(descFile)!;
const sig = ls.getSignatureHelpItems(descFile, dt.indexOf('$now.minus(') + '$now.minus('.length, undefined);
console.log('  signature help at $now.minus(:', sig?.items[0] ? sig.items[0].prefixDisplayParts.concat(sig.items[0].parameters.flatMap((p) => p.displayParts)).map((p) => p.text).join('').slice(0, 80) : '(none)');

const completions = ls.getCompletionsAtPosition(file, at('$json.user.name', '$json.user.'.length), undefined);
console.log('\ncompletions after $json.user.:', completions?.entries.map((e) => e.name).join(', '));

const desc = path.join(projectDir, 'node-description.ts');
const descText = files.get(desc)!;
console.log('\nnode-description.ts (branded slots):');
for (const d of ls.getSemanticDiagnostics(desc).filter((d) => d.source === 'n8n-expression')) {
	const { line } = ts.getLineAndCharacterOfPosition(ls.getProgram()!.getSourceFile(desc)!, d.start!);
	console.log(`  L${line + 1}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
}
const h2 = ls.getQuickInfoAtPosition(desc, descText.indexOf('$parameter.operation +') + 3);
const h3 = ls.getQuickInfoAtPosition(desc, descText.indexOf('$value.trim') + 2);
console.log('  hover $value:', h3?.displayParts?.map((p) => p.text).join('').split('\n')[0]);
console.log('  hover $parameter:', h2?.displayParts?.map((p) => p.text).join('').split('\n')[0]);
const c3 = ls.getCompletionsAtPosition(desc, descText.indexOf('$value.trim') + '$value.'.length, undefined);
console.log('  completions after $value. :', c3?.entries.slice(0, 6).map((e) => e.name).join(', '), '...');

const hints = ls.provideInlayHints(file, { start: 0, length: text.length }, {});
console.log('\ninlay hints:');
for (const h of hints) {
	const { line } = ts.getLineAndCharacterOfPosition(ls.getProgram()!.getSourceFile(file)!, h.position);
	console.log(`  L${line + 1} ${typeof h.text === 'string' ? h.text : ''}`);
}
console.log('\nlogs:', logs.join(' | '));
