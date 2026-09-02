// Builds a RuntimeShape from the checker's type of the data passed to resolve() or
// Resolve<>, so the expression is analysed against whatever that argument is typed as.
import type TS from 'typescript';
import { isContextName, type ExpressionContext, type RuntimeShape } from './globals.ts';

export const shapeFromType = (
	ts: typeof TS,
	checker: TS.TypeChecker,
	type: TS.Type,
	fallbackContext: ExpressionContext,
): RuntimeShape => {
	const isUndefined = (t: TS.Type | undefined) => !t || !!(t.flags & ts.TypeFlags.Undefined);
	const prop = (t: TS.Type, name: string): TS.Type | undefined => {
		const sym = checker.getPropertyOfType(t, name);
		const r = sym && checker.getTypeOfSymbol(sym);
		return isUndefined(r) ? undefined : r;
	};
	const raw = (t: TS.Type) => checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation);

	// Samples are often `as const`; the expression should see string, not 'hello'.
	const text = (t: TS.Type): string => {
		if (t.isUnion()) return [...new Set(t.types.map(text))].join(' | ');
		if (t.isLiteral() || t.flags & ts.TypeFlags.BooleanLiteral)
			return raw(checker.getBaseTypeOfLiteralType(t));
		if (checker.isArrayType(t) || checker.isTupleType(t)) {
			const members = [...new Set(checker.getTypeArguments(t as TS.TypeReference).map(text))];
			return members.length === 0 ? 'unknown[]' : `Array<${members.join(' | ')}>`;
		}
		if (
			t.flags & ts.TypeFlags.Object &&
			checker.getSignaturesOfType(t, ts.SignatureKind.Call).length === 0
		) {
			const props = checker.getPropertiesOfType(t);
			if (props.length > 0) {
				return `{ ${props.map((p) => `${JSON.stringify(p.name)}: ${text(checker.getTypeOfSymbol(p))}`).join('; ')} }`;
			}
		}
		return raw(t);
	};
	const optText = (t: TS.Type | undefined) => (t ? text(t) : undefined);

	// ['a', 'b'] as const → ['a', 'b']; string[] → undefined (means "any key").
	const literals = (t: TS.Type | undefined): string[] | undefined => {
		if (!t) return undefined;
		const elements =
			checker.isTupleType(t) || checker.isArrayType(t)
				? checker.getTypeArguments(t as TS.TypeReference)
				: [t];
		const flat = elements.flatMap((e) => (e.isUnion() ? e.types : [e]));
		return flat.every((e) => e.isStringLiteral())
			? flat.map((e) => (e as TS.StringLiteralType).value)
			: undefined;
	};

	const contextType = prop(type, 'context');
	const contextValue = contextType?.isStringLiteral() ? contextType.value : undefined;
	const context = isContextName(contextValue) ? contextValue : fallbackContext;

	const input = prop(type, 'input');
	const nodesType = prop(type, 'nodes');
	const nodes = Object.fromEntries(
		(nodesType ? checker.getPropertiesOfType(nodesType) : []).flatMap((sym) => {
			const n = checker.getTypeOfSymbol(sym);
			const json = prop(n, 'json');
			return json
				? [
						[
							sym.name,
							{
								json: text(json),
								binaryKeys: literals(prop(n, 'binaryKeys')),
								params: optText(prop(n, 'params')),
							},
						] as const,
					]
				: [];
		}),
	);

	return {
		context,
		inputJson: input ? optText(prop(input, 'json')) : undefined,
		inputBinaryKeys: input ? literals(prop(input, 'binaryKeys')) : undefined,
		nodes,
		parameters: optText(prop(type, 'parameters')),
		credentials: optText(prop(type, 'credentials')),
		value: optText(prop(type, 'value')),
		response: optText(prop(type, 'response')),
		responseItem: optText(prop(type, 'responseItem')),
		request: optText(prop(type, 'request')),
		vars: literals(prop(type, 'vars')),
		env: literals(prop(type, 'env')),
	};
};
