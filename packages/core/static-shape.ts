// Shapes knowable from the surrounding TypeScript at definition time: $parameter from
// the enclosing node description's `properties`, $value from the enclosing property's
// `type`. Union of all properties; displayOptions and versions are ignored on purpose.
import type TS from 'typescript';

const SCALAR: Record<string, string> = {
	string: 'string',
	number: 'number',
	boolean: 'boolean',
	dateTime: 'string',
	color: 'string',
	hidden: 'string',
	json: 'any',
	notice: 'string',
	credentialsSelect: 'string',
	resourceLocator: '{ __rl: true; mode: string; value: string | number }',
	resourceMapper: '{ mappingMode: string; value: Record<string, any> | null; schema: any[] }',
	filter: '{ conditions: any[]; combinator: "and" | "or"; options: any }',
	assignmentCollection: '{ assignments: Array<{ id: string; name: string; value: any; type: string }> }',
};

const assignment = (ts: typeof TS, obj: TS.ObjectLiteralExpression, name: string) =>
	obj.properties.find(
		(p): p is TS.PropertyAssignment => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name,
	);

const stringProp = (ts: typeof TS, obj: TS.ObjectLiteralExpression, name: string): string | undefined => {
	const p = assignment(ts, obj, name);
	return p && ts.isStringLiteralLike(p.initializer) ? p.initializer.text : undefined;
};

const arrayProp = (ts: typeof TS, obj: TS.ObjectLiteralExpression, name: string): TS.ArrayLiteralExpression | undefined => {
	const p = assignment(ts, obj, name);
	return p && ts.isArrayLiteralExpression(p.initializer) ? p.initializer : undefined;
};

const optionValues = (ts: typeof TS, options: TS.ArrayLiteralExpression | undefined): string | undefined => {
	if (!options) return undefined;
	const values = options.elements.flatMap((e) => {
		if (!ts.isObjectLiteralExpression(e)) return ['any'];
		const p = assignment(ts, e, 'value');
		if (!p) return ['any'];
		const v = p.initializer;
		if (ts.isStringLiteralLike(v)) return [JSON.stringify(v.text)];
		if (ts.isNumericLiteral(v)) return [v.text];
		if (v.kind === ts.SyntaxKind.TrueKeyword || v.kind === ts.SyntaxKind.FalseKeyword) return [v.getText()];
		return ['any'];
	});
	return values.length > 0 && !values.includes('any') ? [...new Set(values)].join(' | ') : undefined;
};

/** Type text for one INodeProperties object literal. */
export const propertyType = (ts: typeof TS, prop: TS.ObjectLiteralExpression): string => {
	const type = stringProp(ts, prop, 'type') ?? 'string';
	const options = arrayProp(ts, prop, 'options');
	switch (type) {
		case 'options':
			return optionValues(ts, options) ?? 'string';
		case 'multiOptions':
			return `Array<${optionValues(ts, options) ?? 'string'}>`;
		case 'collection':
			return options ? `Partial<${propertiesType(ts, options)}>` : 'Record<string, any>';
		case 'fixedCollection': {
			if (!options) return 'Record<string, any>';
			const multiple = assignment(ts, prop, 'typeOptions')?.initializer.getText().includes('multipleValues') ?? false;
			const groups = options.elements.flatMap((e) => {
				if (!ts.isObjectLiteralExpression(e)) return [];
				const name = stringProp(ts, e, 'name');
				const values = arrayProp(ts, e, 'values');
				if (!name || !values) return [];
				const t = propertiesType(ts, values);
				return [`${JSON.stringify(name)}: ${multiple ? `Array<${t}>` : t}`];
			});
			return groups.length > 0 ? `{ ${groups.join('; ')} }` : 'Record<string, any>';
		}
		default:
			return SCALAR[type] ?? 'any';
	}
};

/** Type text for an INodeProperties[] array literal. Non-literal members make it open. */
export const propertiesType = (ts: typeof TS, properties: TS.ArrayLiteralExpression): string => {
	const members: string[] = [];
	let open = false;
	for (const e of properties.elements) {
		const name = ts.isObjectLiteralExpression(e) ? stringProp(ts, e, 'name') : undefined;
		if (!ts.isObjectLiteralExpression(e) || !name) {
			open = true;
			continue;
		}
		members.push(`${JSON.stringify(name)}: ${propertyType(ts, e)}`);
	}
	return `{ ${[...members, ...(open ? ['[key: string]: any'] : [])].join('; ')} }`;
};

/** Nearest enclosing object with a `properties` array: a node description. */
export const enclosingParameters = (ts: typeof TS, node: TS.Node): string | undefined => {
	for (let cur: TS.Node | undefined = node.parent; cur; cur = cur.parent) {
		if (ts.isObjectLiteralExpression(cur)) {
			const props = arrayProp(ts, cur, 'properties');
			if (props) return propertiesType(ts, props);
		}
	}
	return undefined;
};

/** Nearest enclosing object that looks like an INodeProperties (has name and type). */
export const enclosingValue = (ts: typeof TS, node: TS.Node): string | undefined => {
	for (let cur: TS.Node | undefined = node.parent; cur; cur = cur.parent) {
		if (ts.isObjectLiteralExpression(cur) && stringProp(ts, cur, 'name') && stringProp(ts, cur, 'type')) {
			return propertyType(ts, cur);
		}
	}
	return undefined;
};
