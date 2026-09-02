// Drives the built plugin against playground/ with no editor and asserts what it shows.
// Run: pnpm test
import assert from 'node:assert/strict';
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

const text = (p: Array<{ text: string }> | undefined) => (p ?? []).map((x) => x.text).join('');
const open = (name: string) => {
	const fileName = path.join(projectDir, name);
	const src = files.get(fileName)!;
	const own = new Set(inner.getSemanticDiagnostics(fileName).map((d) => `${d.start}:${d.code}`));
	return {
		fileName,
		src,
		at: (needle: string, delta = 0) => {
			const i = src.indexOf(needle);
			assert.notEqual(i, -1, `needle not found: ${needle}`);
			return i + delta;
		},
		added: () =>
			ls
				.getSemanticDiagnostics(fileName)
				.filter((d) => !own.has(`${d.start}:${d.code}`))
				.map((d) => ts.flattenDiagnosticMessageText(d.messageText, ' ')),
		hover: (pos: number) => {
			const q = ls.getQuickInfoAtPosition(fileName, pos);
			return { display: text(q?.displayParts), doc: text(q?.documentation) };
		},
	};
};

let checks = 0;
const check = (label: string, fn: () => void) => {
	fn();
	checks++;
	console.log(`ok  ${label}`);
};

const strings = open('strings.ts');
const desc = open('node-description.ts');

check('unknown global for the context is a diagnostic', () =>
	assert.ok(strings.added().some((m) => m.startsWith("Cannot find name '$pageCount'"))));
check('n8n sandbox rules are diagnostics', () =>
	assert.ok(strings.added().some((m) => m.includes('constructor')) && strings.added().some((m) => m.includes('"$"'))));
check('resolve() sites report against their data', () =>
	assert.ok(strings.added().some((m) => m.startsWith("Property 'next' does not exist") && m.includes('against this data'))));
check('slot type mismatch is a diagnostic', () =>
	assert.ok(desc.added().some((m) => m.includes('slot expects number'))));
check('$parameter typo in a branded slot, typed from sibling properties', () =>
	assert.ok(desc.added().some((m) => m.includes("'operaton'") && m.includes("Did you mean 'operation'"))));

check('hover $json shows the sample-derived type', () =>
	assert.match(strings.hover(strings.at('$json.n }} for', 2)).display, /const \$json: \{[^}]*test: string/));
check('hover a method is TypeScript quick info', () =>
	assert.match(strings.hover(strings.at('.sum()', 2)).display, /Array<number>\.sum\(\): number/));
check('hover an n8n extension shows its docs', () =>
	assert.match(strings.hover(strings.at('$json.test.toTitleCase()', '$json.test.'.length + 2)).doc, /title case/));
check('hover {{ shows the block result type', () =>
	assert.match(strings.hover(strings.at("{{ $('Webhook')")).display, /^\(block\) .*: number$/));
check('hover the expr variable summarises resolution', () =>
	assert.match(strings.hover(strings.at('const orderId', 'const '.length + 2)).doc, /Resolves to `number`/));
check('hover $value in a routing slot', () =>
	assert.equal(desc.hover(desc.at('$value.trim', 2)).display, 'const $value: string'));

check('completions inside a block come from the data', () => {
	const c = ls.getCompletionsAtPosition(strings.fileName, strings.at('$json.user.name', '$json.user.'.length), undefined);
	assert.deepEqual(c?.entries.map((e) => e.name), ['emails', 'name']);
});
check('quick fix maps back into the literal', () => {
	const start = strings.at('toUppercase');
	const fixes = ls.getCodeFixesAtPosition(strings.fileName, start, start + 'toUppercase'.length, [2551], {}, {});
	assert.equal(fixes[0]?.description, "Change spelling to 'toUpperCase'");
	assert.equal(fixes[0]?.changes[0]?.textChanges[0]?.span.start, start);
});
check('signature help inside a block', () => {
	const s = ls.getSignatureHelpItems(desc.fileName, desc.at('$now.minus(', '$now.minus('.length), undefined);
	assert.match(text(s?.items[0]?.prefixDisplayParts), /minus\(/);
});
check('inlay hint after a resolved expression', () => {
	const hints = ls.provideInlayHints(strings.fileName, { start: 0, length: strings.src.length }, {});
	const end = strings.at('orderId }}"', 'orderId }}"'.length);
	assert.equal(hints.find((h) => h.position === end)?.text, ': number');
});

console.log(`\n${checks} checks passed`);
