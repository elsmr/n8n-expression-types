// Types, diagnostics and completions for n8n expressions with arbitrary JS inside {{ }}.
// Drives a TypeScript language service over a virtual file: each block body becomes
// `const __rN = (<body>);` next to the generated globals and extensions.d.ts.
//
// `ts` is injected so the same code runs inside tsserver (a plugin must use the
// instance it is handed) and in a standalone script.

import type TS from 'typescript';
import { buildGlobals, type Json, type RuntimeShape, type RuntimeTypes } from './globals.ts';

export type Options = {
	ts: typeof TS;
	/** Directory holding node_modules (for luxon types), shapes.d.ts and extensions.d.ts. */
	root: string;
};

export type BlockAnalysis = {
	body: string;
	/** Offsets of the body inside the expression string. */
	start: number;
	end: number;
	type: string;
	errors: Array<{ message: string; start: number; end: number; code: number }>;
};

export type Analysis = {
	type: string;
	blocks: BlockAnalysis[];
	/** Set when `expected` was given and the expression's type is not assignable to it. */
	slotError?: string;
};

type Block = { body: string; start: number; end: number; fileStart: number };

const BLOCK = /\{\{([\s\S]*?)\}\}/g;

// Mirrors @n8n/tournament ExpressionBuilder: one text-less block returns its value,
// anything else concatenates to a string.
export const compile = (expression: string) => {
	if (!expression.startsWith('=')) return { blocks: [] as Block[], source: '', hasText: true };
	const body = expression.slice(1);
	const blocks: Block[] = [];
	const lines: string[] = [];
	for (const m of body.matchAll(BLOCK)) {
		const i = blocks.length;
		const prefix = `const __r${i} = (`;
		const fileStart = lines.join('\n').length + (i > 0 ? 1 : 0) + prefix.length;
		const start = m.index + 1 + 2;
		blocks.push({ body: m[1], start, end: start + m[1].length, fileStart });
		lines.push(`${prefix}${m[1]});`);
	}
	const hasText = body.replace(BLOCK, '').length > 0;
	return { blocks, source: lines.join('\n'), hasText };
};

export const createExpressionService = ({ ts, root }: Options) => {
	const GLOBALS_FILE = `${root}/__expr__/globals.d.ts`;
	const EXPR_FILE = `${root}/__expr__/expr.ts`;
	const LIB_FILES = [`${root}/shapes.d.ts`, `${root}/extensions.d.ts`];

	const files = new Map<string, string>();
	const versions = new Map<string, number>();
	const set = (name: string, text: string) => {
		if (files.get(name) === text) return;
		files.set(name, text);
		versions.set(name, (versions.get(name) ?? 0) + 1);
	};

	const options: TS.CompilerOptions = {
		strict: true,
		target: ts.ScriptTarget.ESNext,
		lib: ['lib.es2023.d.ts'],
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		types: [],
		noEmit: true,
	};

	const host: TS.LanguageServiceHost = {
		getCompilationSettings: () => options,
		getScriptFileNames: () => [...files.keys(), ...LIB_FILES],
		getScriptVersion: (f) => String(versions.get(f) ?? 0),
		getScriptSnapshot: (f) => {
			const text = files.get(f) ?? ts.sys.readFile(f);
			return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
		},
		getCurrentDirectory: () => root,
		getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
		fileExists: (f) => files.has(f) || ts.sys.fileExists(f),
		readFile: (f) => files.get(f) ?? ts.sys.readFile(f),
		directoryExists: ts.sys.directoryExists,
		getDirectories: ts.sys.getDirectories,
		readDirectory: ts.sys.readDirectory,
	};

	const service = ts.createLanguageService(host, ts.createDocumentRegistry());

	// `expected` adds a final assignment so the checker reports slot mismatches.
	const load = (expression: string, shape: RuntimeShape, expected?: string) => {
		set(GLOBALS_FILE, buildGlobals(shape));
		const compiled = compile(expression);
		const single = !compiled.hasText && compiled.blocks.length === 1;
		const check = expected ? `\nconst __expected: ${expected} = ${single ? '__r0' : "'' as string"};` : '';
		set(EXPR_FILE, compiled.source + check);
		return compiled;
	};

	const analyze = (expression: string, shape: RuntimeShape, expected?: string): Analysis => {
		const { blocks, hasText } = load(expression, shape, expected);
		if (blocks.length === 0) return { type: JSON.stringify(expression), blocks: [] };

		const program = service.getProgram()!;
		const checker = program.getTypeChecker();
		const sf = program.getSourceFile(EXPR_FILE)!;
		const diags = [...service.getSyntacticDiagnostics(EXPR_FILE), ...service.getSemanticDiagnostics(EXPR_FILE)];

		const typed = blocks.map((b, i) => {
			const stmt = sf.statements[i] as TS.VariableStatement;
			const decl = stmt.declarationList.declarations[0];
			const type = checker.typeToString(
				checker.getTypeAtLocation(decl.name),
				undefined,
				ts.TypeFormatFlags.NoTruncation,
			);
			const toExpr = (fileOffset: number) => Math.min(Math.max(fileOffset - b.fileStart, 0), b.body.length) + b.start;
			const errors = diags
				.filter((d) => d.start !== undefined && d.start >= stmt.getStart(sf) && d.start <= stmt.getEnd())
				.map((d) => ({
					message: ts.flattenDiagnosticMessageText(d.messageText, '\n'),
					start: toExpr(d.start!),
					end: toExpr(d.start! + (d.length ?? 1)),
					code: d.code,
				}));
			return { body: b.body, start: b.start, end: b.end, type, errors };
		});

		const type = !hasText && typed.length === 1 ? typed[0].type : 'string';
		const checkStmt = expected ? sf.statements[blocks.length] : undefined;
		const slotError = checkStmt
			? diags
					.filter((d) => d.start !== undefined && d.start >= checkStmt.getStart(sf) && d.start <= checkStmt.getEnd())
					.map(() => `Expression yields ${type}, slot expects ${expected}.`)[0]
			: undefined;
		return { type, blocks: typed, ...(slotError ? { slotError } : {}) };
	};

	/** `offset` is a cursor position inside `expression`. */
	const completionsAt = (expression: string, offset: number, shape: RuntimeShape): TS.CompletionEntry[] => {
		const { blocks } = load(expression, shape);
		const block = blocks.find((b) => offset >= b.start && offset <= b.end);
		if (!block) return [];
		const pos = block.fileStart + (offset - block.start);
		const result = service.getCompletionsAtPosition(EXPR_FILE, pos, {});
		return (result?.entries ?? []).filter(
			(e) => e.kind !== ts.ScriptElementKind.warning && e.kind !== ts.ScriptElementKind.keyword,
		);
	};

	/**
	 * Loads the expression and exposes the inner language service with position mapping,
	 * so callers can forward quick info, signature help or completion details for a token.
	 */
	const virtual = (expression: string, shape: RuntimeShape) => {
		const { blocks } = load(expression, shape);
		const blockAt = (offset: number) => blocks.find((b) => offset >= b.start && offset <= b.end);
		return {
			fileName: EXPR_FILE,
			languageService: service,
			blocks,
			blockAt,
			/** Expression offset → virtual file position, when inside a block. */
			toFile: (offset: number) => {
				const b = blockAt(offset);
				return b ? b.fileStart + (offset - b.start) : undefined;
			},
			/** Virtual file span → expression span, clipped to the block it belongs to. */
			toExpression: (span: TS.TextSpan): TS.TextSpan | undefined => {
				const b = blocks.find((b) => span.start >= b.fileStart && span.start <= b.fileStart + b.body.length);
				if (!b) return undefined;
				const start = b.start + (span.start - b.fileStart);
				return { start, length: Math.min(span.length, b.end - start) };
			},
		};
	};

	return { analyze, completionsAt, virtual, globalsFor: buildGlobals };
};

export type ExpressionService = ReturnType<typeof createExpressionService>;
export type { Json, RuntimeShape, RuntimeTypes };
