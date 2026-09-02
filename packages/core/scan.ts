// Finds marked n8n expressions in a source file. Two markers, no fallback:
//   - a branded slot: the literal's contextual type is Expression<T, C>
//   - a call: expr('...'), expr.<context>('...'), or resolve(expressionVar, data)
// Each hit carries the context, the shape to analyse against, and where to report.
import type TS from 'typescript';
import { EXPRESSION_CONTEXTS, emptyShape, type ExpressionContext, type RuntimeShape } from './globals.ts';
import { shapeFromType } from './shape-from-type.ts';
import { enclosingParameters, enclosingValue } from './static-shape.ts';
import type { Analysis, ExpressionService } from './service.ts';
import { resolvedKey } from './expr.ts';

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
};

const isContext = (s: string | undefined): s is ExpressionContext =>
	(EXPRESSION_CONTEXTS as readonly string[]).includes(s ?? '');

// Only primitives, literals, unions and arrays; anything named would not resolve in the virtual project.
const SAFE_EXPECTED = /^[\w\s|&'"<>[\](),.:?-]*$/;
const safeExpected = (text: string) => (SAFE_EXPECTED.test(text) && !/\b[A-Z]\w*\b(?!['"])/.test(text.replace(/'[^']*'|"[^"]*"/g, '')) ? text : undefined);

/** Expression<T, C> brand on a type or one of its union members. */
const brandOf = (ts: typeof TS, checker: TS.TypeChecker, type: TS.Type | undefined) => {
	if (!type) return undefined;
	for (const t of type.isUnion() ? type.types : [type]) {
		const brand = checker.getPropertyOfType(t, '__n8n');
		if (!brand) continue;
		const bt = checker.getNonNullableType(checker.getTypeOfSymbol(brand));
		const ctx = checker.getPropertyOfType(bt, 'context');
		const val = checker.getPropertyOfType(bt, 'type');
		const ctxType = ctx && checker.getTypeOfSymbol(ctx);
		if (!ctxType?.isStringLiteral() || !isContext(ctxType.value) || !val) continue;
		return { context: ctxType.value, expected: checker.typeToString(checker.getTypeOfSymbol(val), undefined, ts.TypeFormatFlags.NoTruncation) };
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
	if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'expr') {
		return isContext(callee.name.text) ? callee.name.text : undefined;
	}
	return undefined;
};

/** The literal behind an identifier declared as `const x = expr.<ctx>('...')`. */
const literalBehind = (ts: typeof TS, checker: TS.TypeChecker, arg: TS.Expression) => {
	if (ts.isStringLiteralLike(arg)) return { literal: arg, context: undefined };
	if (!ts.isIdentifier(arg)) return undefined;
	const decl = checker.getSymbolAtLocation(arg)?.valueDeclaration;
	if (!decl || !ts.isVariableDeclaration(decl) || !decl.initializer || !ts.isCallExpression(decl.initializer)) return undefined;
	const init = decl.initializer;
	const first = init.arguments[0];
	if (!first || !ts.isStringLiteralLike(first)) return undefined;
	return { literal: first, context: exprCallContext(ts, init.expression) };
};

export const findExpressions = (ts: typeof TS, sf: TS.SourceFile, checker: TS.TypeChecker): Found[] => {
	const found: Found[] = [];
	const push = (f: Omit<Found, 'expression' | 'textStart'>) =>
		found.push({ ...f, expression: f.node.text, textStart: f.node.getStart(sf) + 1 });

	const visit = (node: TS.Node) => {
		if (ts.isCallExpression(node)) {
			const callee = node.expression;
			const [first, second] = node.arguments;
			const ctx = first && exprCallContext(ts, callee);
			if (ctx && ts.isStringLiteralLike(first)) {
				const shape = second
					? shapeFromType(ts, checker, checker.getTypeAtLocation(second), ctx)
					: staticShape(ts, first, ctx);
				push({ kind: 'call', node: first, context: ctx, shape: { ...shape, context: ctx } });
				ts.forEachChild(node, visit);
				return;
			}
			if (ts.isIdentifier(callee) && callee.text === 'resolve' && first && second) {
				const behind = literalBehind(ts, checker, first);
				if (behind) {
					const context = behind.context ?? 'nodeParameter';
					const shape = shapeFromType(ts, checker, checker.getTypeAtLocation(second), context);
					push({
						kind: 'resolve',
						node: behind.literal,
						context: shape.context,
						shape,
						reportAt: { start: node.getStart(sf), length: node.getWidth(sf) },
					});
				}
			}
		} else if (ts.isStringLiteralLike(node) && node.text.startsWith('=')) {
			const brand = brandOf(ts, checker, checker.getContextualType(node as TS.Expression));
			if (brand) {
				push({
					kind: 'slot',
					node,
					context: brand.context,
					shape: staticShape(ts, node, brand.context),
					expected: safeExpected(brand.expected),
				});
			}
		}
		ts.forEachChild(node, visit);
	};
	visit(sf);
	return found;
};

/** Type text for the generated lookup: the value type, or an N8nInvalidExpression. */
export const resolvedType = (a: Analysis): string => {
	const error = a.blocks.flatMap((b) => b.errors)[0];
	return error ? `N8nInvalidExpression<${JSON.stringify(error.message)}>` : a.type;
};

export const renderResolved = (entries: Map<string, string>): string => {
	const lines = [...entries.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, type]) => `\t\t${JSON.stringify(key)}: ${type};`);
	return `// Generated from expr() calls. Do not edit.\ndeclare global {\n\tinterface N8nResolvedTypes {\n${lines.join('\n')}\n\t}\n}\nexport {};\n`;
};

/** Lookup entries for every expr() call in the given files. */
export const collectResolved = (
	ts: typeof TS,
	service: ExpressionService,
	program: TS.Program,
	files = program.getSourceFiles().filter((f) => !f.isDeclarationFile && !f.fileName.includes('/node_modules/')),
): Map<string, string> => {
	const checker = program.getTypeChecker();
	const entries = new Map<string, string>();
	for (const sf of files) {
		for (const f of findExpressions(ts, sf, checker)) {
			if (f.kind === 'call') entries.set(resolvedKey(f.context, f.expression), resolvedType(service.analyze(f.expression, f.shape)));
		}
	}
	return entries;
};
