// Finds marked n8n expressions in a source file. Two markers, no fallback:
//   - a branded slot: the literal's contextual type is Expression<T, C>
//   - a call: expr('...'), expr.<context>('...'), or resolve(expressionVar, data)
//   - a type: Resolve<typeof expressionVar, typeof data>, checked without evaluating
// expr() never carries data; resolve() and Resolve<> are where data enters.
// Each hit carries the context, the shape to analyse against, and where to report.
import type TS from 'typescript';
import {
	emptyShape,
	isContextName,
	type ExpressionContext,
	type RuntimeShape,
} from '@n8n/expression-types';
import { shapeFromType } from './shape-from-type.ts';
import { enclosingParameters, enclosingValue } from './static-shape.ts';
import type { Analysis, ExpressionService } from './service.ts';
import { resolvedKey } from '@n8n/expression-types';

export type Found = {
	kind: 'slot' | 'call' | 'resolve';
	node: TS.StringLiteralLike;
	expression: string;
	/** Offset of the first character of the expression text in the file. */
	textStart: number;
	context: ExpressionContext;
	shape: RuntimeShape;
	/** Slot's declared value type, as text, when it is safe to check against. */
	expected?: string;
	/** Where to report for resolve() calls whose literal lives elsewhere. */
	reportAt?: { start: number; length: number };
	/** The data type at a resolve() site, as text, when it only uses portable names. */
	dataText?: string;
};

// Type text that only uses names every project resolves: primitives, literals, unions,
// arrays, objects, and a few built-in generics. Anything else is not portable.
const PORTABLE_NAMES = new Set(['Array', 'ReadonlyArray', 'Record', 'Partial', 'Readonly', 'Date']);
const portable = (text: string): string | undefined => {
	const stripped = text
		.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '""')
		.replace(/[\w$]+\s*\??:/g, ':'); // property keys are not type names
	const names = stripped.match(/\b[A-Z]\w*\b/g) ?? [];
	return names.every((n) => PORTABLE_NAMES.has(n)) ? text : undefined;
};

/** Expression<T, C> brand on a type or one of its union members. */
const brandOf = (ts: typeof TS, checker: TS.TypeChecker, type: TS.Type | undefined) => {
	if (!type) return undefined;
	for (const t of type.isUnion() ? type.types : [type]) {
		const brand = checker.getPropertyOfType(t, '__n8n');
		if (!brand) continue;
		const bt = checker.getNonNullableType(checker.getTypeOfSymbol(brand));
		const nameSym = checker.getPropertyOfType(bt, 'name');
		const val = checker.getPropertyOfType(bt, 'type');
		const nameType = nameSym && checker.getTypeOfSymbol(nameSym);
		if (!nameType?.isStringLiteral() || !isContextName(nameType.value) || !val) continue;
		return {
			context: nameType.value,
			expected: checker.typeToString(
				checker.getTypeOfSymbol(val),
				undefined,
				ts.TypeFormatFlags.NoTruncation,
			),
		};
	}
	return undefined;
};

const staticShape = (ts: typeof TS, node: TS.Node, context: ExpressionContext): RuntimeShape => ({
	...emptyShape(context),
	parameters: enclosingParameters(ts, node),
	value: context === 'routing' ? enclosingValue(ts, node) : undefined,
});

const exprCallContext = (ts: typeof TS, callee: TS.Expression): ExpressionContext | undefined => {
	if (ts.isIdentifier(callee) && callee.text === 'expr') return 'nodeParameter';
	if (
		ts.isPropertyAccessExpression(callee) &&
		ts.isIdentifier(callee.expression) &&
		callee.expression.text === 'expr'
	) {
		return isContextName(callee.name.text) ? callee.name.text : undefined;
	}
	return undefined;
};

/** The literal behind an identifier declared as `const x = expr.<ctx>('...')`. */
const literalBehind = (ts: typeof TS, checker: TS.TypeChecker, arg: TS.Expression) => {
	if (ts.isStringLiteralLike(arg)) return { literal: arg, context: undefined };
	if (!ts.isIdentifier(arg)) return undefined;
	const symbol = checker.getSymbolAtLocation(arg);
	// Imported names are aliases; follow them to the declaring const.
	const target =
		symbol && symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
	const decl = target?.valueDeclaration;
	if (
		!decl ||
		!ts.isVariableDeclaration(decl) ||
		!decl.initializer ||
		!ts.isCallExpression(decl.initializer)
	)
		return undefined;
	const init = decl.initializer;
	const first = init.arguments[0];
	if (!first || !ts.isStringLiteralLike(first)) return undefined;
	return { literal: first, context: exprCallContext(ts, init.expression) };
};

export const findExpressions = (
	ts: typeof TS,
	sf: TS.SourceFile,
	checker: TS.TypeChecker,
): Found[] => {
	const found: Found[] = [];
	const push = (f: Omit<Found, 'expression' | 'textStart'>) =>
		found.push({ ...f, expression: f.node.text, textStart: f.node.getStart(sf) + 1 });

	const pushResolve = (
		behind: { literal: TS.StringLiteralLike; context: ExpressionContext | undefined },
		dataType: TS.Type,
		site: TS.Node,
	) => {
		const context = behind.context ?? 'nodeParameter';
		const shape = shapeFromType(ts, checker, dataType, context);
		push({
			kind: 'resolve',
			node: behind.literal,
			context: shape.context,
			shape,
			reportAt: { start: site.getStart(sf), length: site.getWidth(sf) },
			dataText: portable(
				checker.typeToString(dataType, undefined, ts.TypeFormatFlags.NoTruncation),
			),
		});
	};

	const visit = (node: TS.Node) => {
		if (ts.isCallExpression(node)) {
			const callee = node.expression;
			const [first, second] = node.arguments;
			const ctx = first && exprCallContext(ts, callee);
			if (ctx && ts.isStringLiteralLike(first)) {
				push({ kind: 'call', node: first, context: ctx, shape: staticShape(ts, first, ctx) });
				ts.forEachChild(node, visit);
				return;
			}
			if (ts.isIdentifier(callee) && callee.text === 'resolve' && first && second) {
				const behind = literalBehind(ts, checker, first);
				if (behind) {
					pushResolve(behind, checker.getTypeAtLocation(second), node);
				}
			}
		} else if (
			ts.isTypeReferenceNode(node) &&
			ts.isIdentifier(node.typeName) &&
			node.typeName.text === 'Resolve'
		) {
			const [exprArg, dataArg] = node.typeArguments ?? [];
			if (exprArg && dataArg && ts.isTypeQueryNode(exprArg) && ts.isIdentifier(exprArg.exprName)) {
				const behind = literalBehind(ts, checker, exprArg.exprName);
				if (behind) pushResolve(behind, checker.getTypeFromTypeNode(dataArg), node);
			}
		} else if (ts.isStringLiteralLike(node) && node.text.startsWith('=')) {
			const brand = brandOf(ts, checker, checker.getContextualType(node as TS.Expression));
			if (brand) {
				push({
					kind: 'slot',
					node,
					context: brand.context,
					shape: staticShape(ts, node, brand.context),
					expected: portable(brand.expected),
				});
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return found;
};

/**
 * Type text for the lookup: the value type, or an error type. Without data an error means
 * the text is invalid; against data it means the data does not fit. The messages
 * themselves are diagnostics (plugin, check), not types.
 */
export const resolvedType = (
	a: Analysis,
	against: 'definition' | 'data' = 'definition',
): string => {
	const failed = a.blocks.some((b) => b.errors.length > 0) || !!a.slotError;
	if (!failed) return a.type;
	return against === 'data' ? 'N8nResolveError' : 'N8nInvalidExpression';
};

export type LookupEntry = { loose?: string; strict: Array<[dataText: string, type: string]> };

/** Each distinct data type once, as a local alias; entries would otherwise repeat kilobytes of it. */
export const renderResolved = (entries: Map<string, LookupEntry>): string => {
	const aliases = new Map<string, string>();
	const alias = (dataText: string) => {
		const existing = aliases.get(dataText);
		if (existing) return existing;
		const name = `D${aliases.size}`;
		aliases.set(dataText, name);
		return name;
	};
	const lines = [...entries.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, e]) => {
			const strict = e.strict.map(([d, t]) => `[${alias(d)}, ${t}]`).join(', ');
			return `\t\t${JSON.stringify(key)}: { loose: ${e.loose ?? 'any'}; strict: [${strict}] };`;
		});
	const aliasLines = [...aliases.entries()].map(([text, name]) => `type ${name} = ${text};`);
	return [
		'// Generated from expr() and resolve() sites by @n8n/expression-types. Do not edit.',
		...aliasLines,
		'declare global {',
		'\tinterface N8nResolvedTypes {',
		...lines,
		'\t}',
		'}',
		'export {};',
		'',
	].join('\n');
};

/**
 * Lookup entries from analysed items: the loose type from the expr() declaration, and
 * one [dataType, result] pair per resolve()/Resolve<> site whose data type is portable.
 */
export const lookupEntries = (
	items: Array<Found & { analysis: Analysis }>,
): Map<string, LookupEntry> => {
	const out = new Map<string, LookupEntry>();
	const entry = (key: string) => out.get(key) ?? out.set(key, { strict: [] }).get(key)!;
	for (const it of items) {
		if (it.kind === 'slot') continue;
		const key = resolvedKey(it.context, it.expression);
		if (it.kind === 'call') entry(key).loose = resolvedType(it.analysis);
		else if (it.dataText && !entry(key).strict.some(([d]) => d === it.dataText)) {
			entry(key).strict.push([it.dataText, resolvedType(it.analysis, 'data')]);
		}
	}
	// An expression that is invalid on its own cannot resolve against anything.
	for (const e of out.values()) {
		if (e.loose === 'N8nInvalidExpression') e.strict = e.strict.map(([d]) => [d, e.loose!]);
	}
	return out;
};

/**
 * TypeScript diagnostics for analysed items, shared by the plugin and the CLI. Same codes as
 * TypeScript's own, so they read as ts(2339) in the editor; sandbox rules are 90001.
 */
export const diagnostics = (
	ts: typeof TS,
	items: Array<Found & { analysis: Analysis }>,
): TS.Diagnostic[] =>
	items.flatMap((it) => {
		const file = it.node.getSourceFile();
		const diag = (
			start: number,
			length: number,
			messageText: string,
			code: number,
		): TS.Diagnostic => ({
			file,
			start,
			length,
			messageText,
			category: ts.DiagnosticCategory.Error,
			code,
			...(code === 90001 ? { source: 'n8n' } : {}),
		});
		const errors = it.analysis.blocks.flatMap((b) => b.errors);
		// resolve() re-checks a literal declared elsewhere: report at the call.
		if (it.reportAt) {
			const { start, length } = it.reportAt;
			return errors.map((e) =>
				diag(start, length, `${e.message} (in '${it.expression}' against this data)`, e.code),
			);
		}
		const inBlocks = errors.map((e) =>
			diag(it.textStart + e.start, Math.max(e.end - e.start, 1), e.message, e.code),
		);
		const slot = it.analysis.slotError
			? [diag(it.node.getStart(), it.node.getWidth(), it.analysis.slotError, 2322)]
			: [];
		return [...inBlocks, ...slot];
	});

/** The files worth scanning: the project's own sources. */
export const projectFiles = (program: TS.Program) =>
	program
		.getSourceFiles()
		.filter((f) => !f.isDeclarationFile && !f.fileName.includes('/node_modules/'));

/** Lookup entries and diagnostics for the given files. */
export const collectResolved = (
	ts: typeof TS,
	service: ExpressionService,
	program: TS.Program,
	files = projectFiles(program),
) => {
	const checker = program.getTypeChecker();
	const items = files.flatMap((sf) =>
		findExpressions(ts, sf, checker).map((f) => ({
			...f,
			analysis: service.analyze(f.expression, f.shape, f.expected),
		})),
	);
	return { entries: lookupEntries(items), diagnostics: diagnostics(ts, items) };
};
