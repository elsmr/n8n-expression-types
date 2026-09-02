// Types, diagnostics and completions for n8n expressions with arbitrary JS inside {{ }}.
// Drives the TypeScript language service over a virtual file: each block body becomes
// `const __rN = (<body>);` next to the generated globals from ./globals.ts.

import ts from 'typescript';
import { buildGlobals, type Json, type RuntimeTypes } from './globals.ts';

// Virtual files live in this dir so `luxon` resolves from ./node_modules.
const ROOT = import.meta.dirname;
const GLOBALS_FILE = `${ROOT}/__expr__/globals.d.ts`;
const EXPR_FILE = `${ROOT}/__expr__/expr.ts`;

// ---------- expression → virtual file ----------

type Block = { body: string; start: number; end: number; fileStart: number };

const BLOCK = /\{\{([\s\S]*?)\}\}/g;

// Mirrors @n8n/tournament ExpressionBuilder: one text-less block returns its value,
// anything else concatenates to a string.
const compile = (expression: string) => {
	if (!expression.startsWith('=')) return { blocks: [] as Block[], source: '', hasText: true };
	const body = expression.slice(1);
	const blocks: Block[] = [];
	const lines: string[] = [];
	for (const m of body.matchAll(BLOCK)) {
		const i = blocks.length;
		const prefix = `const __r${i} = (`;
		const fileStart = lines.join('\n').length + (i > 0 ? 1 : 0) + prefix.length;
		blocks.push({ body: m[1], start: m.index + 1, end: m.index + 1 + m[0].length, fileStart });
		lines.push(`${prefix}${m[1]});`);
	}
	const hasText = body.replace(BLOCK, '').length > 0;
	return { blocks, source: lines.join('\n'), hasText };
};

// ---------- language service over virtual + real fs ----------

const files = new Map<string, string>();
const versions = new Map<string, number>();
const set = (name: string, text: string) => {
	if (files.get(name) === text) return;
	files.set(name, text);
	versions.set(name, (versions.get(name) ?? 0) + 1);
};

const options: ts.CompilerOptions = {
	strict: true,
	target: ts.ScriptTarget.ESNext,
	lib: ['lib.es2023.d.ts'],
	module: ts.ModuleKind.ESNext,
	moduleResolution: ts.ModuleResolutionKind.Bundler,
	types: [],
	noEmit: true,
};

const host: ts.LanguageServiceHost = {
	getCompilationSettings: () => options,
	getScriptFileNames: () => [...files.keys()],
	getScriptVersion: (f) => String(versions.get(f) ?? 0),
	getScriptSnapshot: (f) => {
		const text = files.get(f) ?? ts.sys.readFile(f);
		return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
	},
	getCurrentDirectory: () => ROOT,
	getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
	fileExists: (f) => files.has(f) || ts.sys.fileExists(f),
	readFile: (f) => files.get(f) ?? ts.sys.readFile(f),
	directoryExists: ts.sys.directoryExists,
	getDirectories: ts.sys.getDirectories,
	readDirectory: ts.sys.readDirectory,
};

const service = ts.createLanguageService(host, ts.createDocumentRegistry());

const load = (expression: string, runtime: RuntimeTypes) => {
	set(GLOBALS_FILE, buildGlobals(runtime));
	const compiled = compile(expression);
	set(EXPR_FILE, compiled.source);
	return compiled;
};

// ---------- public API ----------

export type Analysis = {
	type: string;
	blocks: Array<{ body: string; type: string; errors: string[] }>;
};

export const analyze = (expression: string, runtime: RuntimeTypes): Analysis => {
	const { blocks, hasText } = load(expression, runtime);
	if (blocks.length === 0) return { type: JSON.stringify(expression), blocks: [] };

	const program = service.getProgram()!;
	const checker = program.getTypeChecker();
	const sf = program.getSourceFile(EXPR_FILE)!;
	const diags = [...service.getSyntacticDiagnostics(EXPR_FILE), ...service.getSemanticDiagnostics(EXPR_FILE)];

	const typed = blocks.map((b, i) => {
		const stmt = sf.statements[i] as ts.VariableStatement;
		const decl = stmt.declarationList.declarations[0];
		const type = checker.typeToString(checker.getTypeAtLocation(decl.name), undefined, ts.TypeFormatFlags.NoTruncation);
		const errors = diags
			.filter((d) => d.start !== undefined && d.start >= stmt.getStart(sf) && d.start <= stmt.getEnd())
			.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
		return { body: b.body, type, errors };
	});

	const type = !hasText && typed.length === 1 ? typed[0].type : 'string';
	return { type, blocks: typed };
};

/** `offset` is a cursor position inside `expression`. */
export const completionsAt = (expression: string, offset: number, runtime: RuntimeTypes): string[] => {
	const { blocks } = load(expression, runtime);
	const block = blocks.find((b) => offset >= b.start + 2 && offset <= b.end - 2);
	if (!block) return [];
	const pos = block.fileStart + (offset - (block.start + 2));
	const result = service.getCompletionsAtPosition(EXPR_FILE, pos, {});
	return (result?.entries ?? [])
		.filter((e) => e.kind !== ts.ScriptElementKind.warning && e.kind !== ts.ScriptElementKind.keyword)
		.map((e) => e.name);
};

/** The generated declaration file, for inspection or for feeding a browser vfs. */
export const globalsFor = (runtime: RuntimeTypes) => buildGlobals(runtime);

export type { Json, RuntimeTypes };
