// Drives the built plugin against playground/ with no editor and asserts what it shows.
// Run: pnpm test
import assert from 'node:assert/strict';
import path from 'node:path';
import ts from 'typescript';
import { createRequire } from 'node:module';

const init = createRequire(import.meta.url)('./dist/index.cjs') as (m: {
	typescript: typeof ts;
}) => {
	create(info: unknown): ts.LanguageService;
};

const projectDir = path.resolve(import.meta.dirname, '../../../playground');
const parsed = ts.getParsedCommandLineOfConfigFile(
	path.join(projectDir, 'tsconfig.json'),
	{},
	{
		...ts.sys,
		onUnRecoverableConfigFileDiagnostic: (d) => {
			throw new Error(String(d.messageText));
		},
	},
)!;
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
	project: {
		getCurrentDirectory: () => projectDir,
		refreshDiagnostics: () => {},
		projectService: { logger: { info: () => {} }, getScriptInfo: () => undefined },
	},
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

const demo = open('demo.ts');
const desc = open('node-description.ts');

check('unknown global for the context is a diagnostic', () =>
	assert.ok(demo.added().some((m) => m.startsWith("Cannot find name '$pageCount'"))),
);
check('n8n sandbox rules are diagnostics', () =>
	assert.ok(
		demo.added().some((m) => m.includes('constructor')) &&
			demo.added().some((m) => m.includes('"$"')),
	),
);
check('resolve() sites report against their data', () =>
	assert.ok(
		demo
			.added()
			.some(
				(m) => m.startsWith("Property 'next' does not exist") && m.includes('against this data'),
			),
	),
);
check('slot type mismatch is a diagnostic', () =>
	assert.ok(desc.added().some((m) => m.includes('slot expects number'))),
);
check('$parameter typo in a branded slot, typed from sibling properties', () =>
	assert.ok(
		desc.added().some((m) => m.includes("'operaton'") && m.includes("Did you mean 'operation'")),
	),
);

check('hover $json in an expr() is loose: no data at the declaration', () =>
	assert.match(demo.hover(demo.at('$json.n }} for', 2)).display, /const \$json: any/),
);
check('hover $parameter in a slot is typed from sibling properties', () =>
	assert.match(
		desc.hover(desc.at('$parameter.operation + ', 2)).display,
		/const \$parameter: \{[^}]*resource: "order" \| "customer"/,
	),
);
check('hover a method is TypeScript quick info', () =>
	assert.match(demo.hover(demo.at('.sum()', 2)).display, /Array<\w+>\.sum\(\): number/),
);
check('hover an n8n extension shows its docs', () =>
	assert.match(
		demo.hover(demo.at('.beginningOf("month")', 3)).doc,
		/start of the given time period/,
	),
);
check('hover {{ shows the block result type', () =>
	assert.match(demo.hover(demo.at('{{ $pageCount >= 10')).display, /^\(block\) .*: boolean$/),
);
check('hover the expr variable summarises resolution', () =>
	assert.match(
		demo.hover(demo.at('const orderId', 'const '.length + 2)).doc,
		/Resolves to `number`/,
	),
);
check('hover $value in a routing slot', () =>
	assert.equal(desc.hover(desc.at('$value.trim', 2)).display, 'const $value: string'),
);

check('completions inside a block come from the shape', () => {
	const c = ls.getCompletionsAtPosition(
		desc.fileName,
		desc.at('$parameter.operation + ', '$parameter.'.length),
		undefined,
	);
	assert.deepEqual(
		c?.entries.map((e) => e.name).filter((n) => ['operation', 'resource'].includes(n)),
		['operation', 'resource'],
	);
});
check('quick fix maps back into the literal', () => {
	const start = demo.at('toISo');
	const fixes = ls.getCodeFixesAtPosition(
		demo.fileName,
		start,
		start + 'toISo'.length,
		[2551],
		{},
		{},
	);
	assert.equal(fixes[0]?.description, "Change spelling to 'toISO'");
	assert.equal(fixes[0]?.changes[0]?.textChanges[0]?.span.start, start);
});
check('signature help inside a block', () => {
	const s = ls.getSignatureHelpItems(
		desc.fileName,
		desc.at('$now.minus(', '$now.minus('.length),
		undefined,
	);
	assert.match(text(s?.items[0]?.prefixDisplayParts), /minus\(/);
});
check('inlay hint after an expression', () => {
	const hints = ls.provideInlayHints(demo.fileName, { start: 0, length: demo.src.length }, {});
	const end = demo.at("$pageCount >= 10 }}'", "$pageCount >= 10 }}'".length);
	assert.equal(hints.find((h) => h.position === end)?.text, ': boolean');
});

console.log(`\n${checks} checks passed`);
