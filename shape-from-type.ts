// Builds a RuntimeShape from the checker's type of a `runtime` value, so `resolve(expr,
// runtime)` can be analysed against whatever the second argument is typed as.
import type TS from 'typescript';
import type { RuntimeShape } from './globals.ts';

export const shapeFromType = (ts: typeof TS, checker: TS.TypeChecker, type: TS.Type): RuntimeShape | undefined => {
	const prop = (t: TS.Type, name: string): TS.Type | undefined => {
		const sym = checker.getPropertyOfType(t, name);
		return sym && checker.getTypeOfSymbol(sym);
	};
	const raw = (t: TS.Type) => checker.typeToString(t, undefined, ts.TypeFormatFlags.NoTruncation);

	// Samples are often `as const`; the expression should see string, not 'hello'.
	const text = (t: TS.Type): string => {
		if (t.isUnion()) return [...new Set(t.types.map(text))].join(' | ');
		if (t.isLiteral() || t.flags & ts.TypeFlags.BooleanLiteral) return raw(checker.getBaseTypeOfLiteralType(t));
		if (checker.isArrayType(t) || checker.isTupleType(t)) {
			const members = [...new Set(checker.getTypeArguments(t as TS.TypeReference).map(text))];
			return members.length === 0 ? 'unknown[]' : `Array<${members.join(' | ')}>`;
		}
		if (t.flags & ts.TypeFlags.Object && checker.getSignaturesOfType(t, ts.SignatureKind.Call).length === 0) {
			const props = checker.getPropertiesOfType(t);
			if (props.length > 0) {
				return `{ ${props.map((p) => `${JSON.stringify(p.name)}: ${text(checker.getTypeOfSymbol(p))}`).join('; ')} }`;
			}
		}
		return raw(t);
	};

	// ['a', 'b'] as const → ['a', 'b']; string[] → undefined (means "any key").
	const literals = (t: TS.Type | undefined): string[] | undefined => {
		if (!t || t.flags & ts.TypeFlags.Undefined) return undefined;
		const elements = checker.isTupleType(t)
			? checker.getTypeArguments(t as TS.TypeReference)
			: checker.isArrayType(t)
				? checker.getTypeArguments(t as TS.TypeReference)
				: [t];
		const flat = elements.flatMap((e) => (e.isUnion() ? e.types : [e]));
		return flat.every((e) => e.isStringLiteral()) ? flat.map((e) => (e as TS.StringLiteralType).value) : undefined;
	};

	const node = (t: TS.Type) => {
		const json = prop(t, 'json');
		if (!json) return undefined;
		const params = prop(t, 'params');
		return {
			json: text(json),
			binaryKeys: literals(prop(t, 'binaryKeys')),
			params: params && !(params.flags & ts.TypeFlags.Undefined) ? text(params) : undefined,
		};
	};

	const input = prop(type, 'input');
	const inputShape = input && node(input);
	if (!inputShape) return undefined;

	const nodesType = prop(type, 'nodes');
	const nodes = Object.fromEntries(
		(nodesType ? checker.getPropertiesOfType(nodesType) : []).flatMap((sym) => {
			const shape = node(checker.getTypeOfSymbol(sym));
			return shape ? [[sym.name, shape]] : [];
		}),
	);

	const parameters = prop(type, 'parameters');
	return {
		inputJson: inputShape.json,
		inputBinaryKeys: inputShape.binaryKeys,
		nodes,
		parameters: parameters && !(parameters.flags & ts.TypeFlags.Undefined) ? text(parameters) : undefined,
		vars: literals(prop(type, 'vars')),
		env: literals(prop(type, 'env')),
	};
};
