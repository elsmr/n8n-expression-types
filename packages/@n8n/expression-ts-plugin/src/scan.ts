// Finds marked n8n expressions in a source file. Markers only, no fallback:
//   - a branded slot: the literal's contextual type is Expression<T, C>
//   - a call: expr('...'), expr.<context>('...'), or resolve(expressionVar, data)
//   - a type: Resolve<typeof expressionVar, typeof data>, checked without evaluating
// expr() never carries data; resolve() and Resolve<> are where data enters.
// Each hit carries the context, the shape to analyse against, and where to report.
import type TS from 'typescript';
import {
	emptyShape,
	isContextName,
	resolvedKey,
	type ExpressionContext,
	type RuntimeShape,
} from '@n8n/expression-types';
import { shapeFromType } from './shape-from-type.ts';
import { enclosingParameters, enclosingValue } from './static-shape.ts';
import { SANDBOX_CODE, type Analysis, type ExpressionService } from './service.ts';

type Common = { expression: string; context: ExpressionContext; shape: RuntimeShape };
type Literal = Common & {
	node: TS.StringLiteralLike;
	/** Offset of the first character of the expression text in the file. */
	textStart: number;
};
export type Found =
	| (Literal & { kind: 'call' })
	| (Literal & {
			kind: 'slot';
			/** Slot's declared value type, as text, when it is safe to check against. */
			expected?: string;
	  })
	| (Common & {
			kind: 'resolve';
			/** The resolve()/Resolve<> site, where errors are reported. */
			node: TS.Node;
			/** The data type, as text, when it only uses portable names. */
			dataText?: string;
	  });

/** Items whose text sits in this file: everything the editor can point into. */
export const isLiteral = <F extends Found>(f: F): f is Extract<F, { textStart: number }> =>
	f.kind !== 'resolve';

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

/** Expression<T, C> brand on a type or one of its union members; `text` when it is an expr() literal. */
const brandOf = (ts: typeof TS, checker: TS.TypeChecker, type: TS.Type | undefined) => {
	if (!type) return undefined;
	for (const t of type.isUnion() ? type.types : [type]) {
		const brand = checker.getPropertyOfType(t, '__n8n');
		if (!brand) continue;
		const bt = checker.getNonNullableType(checker.getTypeOfSymbol(brand));
		const nameSym = checker.getPropertyOfType(bt, 'name');
		const val = checker.getPropertyOfType(bt, 'type');
		const textSym = checker.getPropertyOfType(bt, 'text');
		const nameType = nameSym && checker.getTypeOfSymbol(nameSym);
		const textType = textSym && checker.getTypeOfSymbol(textSym);
		if (!nameType?.isStringLiteral() || !isContextName(nameType.value) || !val) continue;
		return {
			context: nameType.value,
			text: textType?.isStringLiteral() ? textType.value : undefined,
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

export const findExpressions = (
	ts: typeof TS,
	sf: TS.SourceFile,
	checker: TS.TypeChecker,
): Found[] => {
	const found: Found[] = [];
	const literal = (node: TS.StringLiteralLike) => ({
		node,
		expression: node.text,
		textStart: node.getStart(sf) + 1,
	});

	// The text and context come from the Expr type of the argument, so the declaration can
	// live anywhere; the site itself is where errors are reported.
	const pushResolve = (exprType: TS.Type, dataType: TS.Type, site: TS.Node) => {
		const brand = brandOf(ts, checker, exprType);
		if (brand?.text === undefined) return;
		const shape = shapeFromType(ts, checker, dataType, brand.context);
		found.push({
			kind: 'resolve',
			node: site,
			expression: brand.text,
			context: shape.context,
			shape,
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
				found.push({
					kind: 'call',
					...literal(first),
					context: ctx,
					shape: staticShape(ts, first, ctx),
				});
				ts.forEachChild(node, visit);
				return;
			}
			if (ts.isIdentifier(callee) && callee.text === 'resolve' && first && second) {
				pushResolve(checker.getTypeAtLocation(first), checker.getTypeAtLocation(second), node);
			}
		} else if (
			ts.isTypeReferenceNode(node) &&
			ts.isIdentifier(node.typeName) &&
			node.typeName.text === 'Resolve'
		) {
			const [exprArg, dataArg] = node.typeArguments ?? [];
			if (exprArg && dataArg) {
				pushResolve(
					checker.getTypeFromTypeNode(exprArg),
					checker.getTypeFromTypeNode(dataArg),
					node,
				);
			}
		} else if (ts.isStringLiteralLike(node) && node.text.startsWith('=')) {
			const brand = brandOf(ts, checker, checker.getContextualType(node as TS.Expression));
			if (brand) {
				found.push({
					kind: 'slot',
					...literal(node),
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
 * TypeScript's own, so they read as ts(2339) in the editor; sandbox rules carry SANDBOX_CODE.
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
			...(code === SANDBOX_CODE ? { source: 'n8n' } : {}),
		});
		const errors = it.analysis.blocks.flatMap((b) => b.errors);
		// resolve() re-checks a literal declared elsewhere: report at the call.
		if (it.kind === 'resolve') {
			return errors.map((e) =>
				diag(
					it.node.getStart(),
					it.node.getWidth(),
					`${e.message} (in '${it.expression}' against this data)`,
					e.code,
				),
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
	const items = files.flatMap((sf) => findExpressions(ts, sf, checker).map(analysed(service)));
	return { entries: lookupEntries(items), diagnostics: diagnostics(ts, items) };
};

/** Pairs a found expression with its analysis; only slots have an expected type. */
export const analysed =
	(service: ExpressionService) =>
	<F extends Found>(f: F): F & { analysis: Analysis } => ({
		...f,
		analysis: service.analyze(f.expression, f.shape, f.kind === 'slot' ? f.expected : undefined),
	});
