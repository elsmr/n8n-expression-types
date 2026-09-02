// Finds n8n expression literals in a source file and pairs each with the runtime
// shape it should be analysed against. Shared by the CLI generator and the plugin.
import type TS from 'typescript';
import type { RuntimeShape } from './globals.ts';
import { shapeFromType } from './shape-from-type.ts';
import type { Analysis, ExpressionService } from './service.ts';

export type Found = {
	node: TS.StringLiteral | TS.NoSubstitutionTemplateLiteral;
	expression: string;
	/** Offset of the first character of the expression text in the file. */
	textStart: number;
	/** True when the literal is the first argument of resolve(). */
	resolveCall: boolean;
	shape: RuntimeShape;
};

const isExpressionLiteral = (ts: typeof TS, node: TS.Node): node is TS.StringLiteral | TS.NoSubstitutionTemplateLiteral =>
	(ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text.startsWith('=');

const calleeName = (ts: typeof TS, node: TS.Node): string | undefined => {
	const parent = node.parent;
	if (ts.isCallExpression(parent) && parent.arguments[0] === node && ts.isIdentifier(parent.expression)) {
		return parent.expression.text;
	}
	if (ts.isTaggedTemplateExpression(parent) && ts.isIdentifier(parent.tag)) return parent.tag.text;
	return undefined;
};

export const findExpressions = (
	ts: typeof TS,
	sf: TS.SourceFile,
	checker: TS.TypeChecker,
	defaultShape: RuntimeShape,
): Found[] => {
	const found: Found[] = [];
	const visit = (node: TS.Node) => {
		if (isExpressionLiteral(ts, node)) {
			const callee = calleeName(ts, node);
			const resolveCall = callee === 'resolve';
			// Plain strings only count when they contain a block; the tag and resolve() always count.
			if (resolveCall || callee === 'n8n' || node.text.includes('{{')) {
				const runtimeArg = resolveCall ? (node.parent as TS.CallExpression).arguments[1] : undefined;
				const shape = (runtimeArg && shapeFromType(ts, checker, checker.getTypeAtLocation(runtimeArg))) ?? defaultShape;
				found.push({ node, expression: node.text, textStart: node.getStart(sf) + 1, resolveCall, shape });
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
		.map(([expr, type]) => `\t\t${JSON.stringify(expr)}: ${type};`);
	return `// Generated from resolve() calls. Do not edit.\ndeclare global {\n\tinterface N8nResolvedTypes {\n${lines.join('\n')}\n\t}\n}\nexport {};\n`;
};

export const collectResolved = (
	ts: typeof TS,
	service: ExpressionService,
	program: TS.Program,
	defaultShape: RuntimeShape,
	files = program.getSourceFiles().filter((f) => !f.isDeclarationFile && !f.fileName.includes('/node_modules/')),
): Map<string, string> => {
	const checker = program.getTypeChecker();
	const entries = new Map<string, string>();
	for (const sf of files) {
		for (const f of findExpressions(ts, sf, checker, defaultShape)) {
			if (f.resolveCall) entries.set(f.expression, resolvedType(service.analyze(f.expression, f.shape)));
		}
	}
	return entries;
};
