// Generates the ambient declarations an n8n expression sees inside {{ }}.
//
// Sources, in order of trust:
//   - extension methods: `ExpressionExtensions` / `extendedFunctions` from n8n-workflow,
//     read from each function's `.doc` metadata at runtime (always current).
//   - root `$` globals: hand-written from packages/workflow/src/workflow-data-proxy.ts
//     (`base` object) and packages/core/.../get-additional-keys.ts.
//   - runtime-shaped parts ($json, $binary, $('Node'), $parameter, $vars): injected
//     through `RuntimeTypes`.

import { createRequire } from 'node:module';
import type { ExpressionExtensions as ExpressionExtensionsType } from 'n8n-workflow';

// n8n-workflow's ESM build trips on a named import from @n8n/tournament, so load the
// two extension modules from the CJS build instead.
const require = createRequire(import.meta.url);
const { ExpressionExtensions } = require('n8n-workflow/dist/cjs/extensions/index.js') as {
	ExpressionExtensions: typeof ExpressionExtensionsType;
};
const { extendedFunctions } = require('n8n-workflow/dist/cjs/extensions/extended-functions.js') as {
	extendedFunctions: Record<string, Function>;
};

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type NodeRuntime = {
	json: Json;
	binaryKeys?: string[];
	params?: Json;
	context?: Json;
};

export type RuntimeTypes = {
	/** Data on the current input item: $json, $binary, $input, $item, $items(). */
	input: NodeRuntime;
	/** Executed nodes by name: $('Name'), $node['Name']. */
	nodes?: Record<string, NodeRuntime>;
	/** Current node's parameters: $parameter, $rawParameter. */
	parameters?: Json;
	/** Known variable names: $vars.<name>. */
	vars?: string[];
	/** Known env var names: $env.<name>. Empty means "any string key". */
	env?: string[];
};

// ---------- value → type text ----------

export const jsonType = (v: Json): string => {
	if (v === null) return 'null';
	if (Array.isArray(v)) {
		const members = [...new Set(v.map(jsonType))];
		return members.length === 0 ? 'unknown[]' : `Array<${members.join(' | ')}>`;
	}
	if (typeof v === 'object') {
		const props = Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${jsonType(x)}`);
		return `{ ${props.join('; ')} }`;
	}
	return typeof v;
};

const keyUnion = (keys: string[] | undefined, fallback: string) =>
	keys && keys.length > 0 ? keys.map((k) => JSON.stringify(k)).join(' | ') : fallback;

const recordOf = (keys: string[] | undefined, valueType: string) =>
	keys && keys.length > 0
		? `{ ${keys.map((k) => `${JSON.stringify(k)}: ${valueType}`).join('; ')} }`
		: `Record<string, ${valueType}>`;

// ---------- extension methods from doc metadata ----------

type DocArg = { name: string; type?: string; optional?: boolean; variadic?: boolean };
type Doc = { name: string; returnType?: string; args?: DocArg[] };

// Doc type strings are informal; map the ones that occur to TS.
const docType = (t: string | undefined, self: string): string => {
	switch (t) {
		case undefined:
		case 'any':
			return 'any';
		case 'string':
		case 'number':
		case 'boolean':
		case 'object':
			return t;
		case 'Array':
			return self === 'Array' ? 'T[]' : 'any[]';
		case 'Object':
			return 'Record<string, any>';
		case 'DateTime':
		case 'Date':
			return t;
		case 'Function':
			return '(...args: any[]) => any';
		default:
			return /^[\w\s|<>,[\]]+$/.test(t) ? t : 'any';
	}
};

// Doc metadata says `any` where the real return is the element or key type.
const RETURN_OVERRIDES: Record<string, Record<string, string>> = {
	Array: { first: 'T', last: 'T', randomItem: 'T', unique: 'T[]', removeDuplicates: 'T[]', compact: 'T[]' },
	Object: { keys: 'string[]', values: 'any[]' },
};

const signature = (method: string, doc: Doc | undefined, self: string): string => {
	const args = (doc?.args ?? [])
		.map((a) => {
			const type = docType(a.type, self);
			return a.variadic ? `...${a.name}: ${type}[]` : `${a.name}${a.optional ? '?' : ''}: ${type}`;
		})
		.join(', ');
	const returnType = RETURN_OVERRIDES[self]?.[method] ?? docType(doc?.returnType, self);
	return `${method}(${args}): ${returnType};`;
};

const extensionMembers = (typeName: string): string[] => {
	const map = ExpressionExtensions.find((m) => m.typeName === typeName);
	if (!map) return [];
	return Object.entries(map.functions).map(([name, fn]) =>
		signature(name, (fn as { doc?: Doc }).doc, typeName),
	);
};

const extensionInterfaces = () => {
	const date = extensionMembers('Date').join('\n\t\t');
	return `
	interface String { ${extensionMembers('String').join(' ')} }
	interface Number { ${extensionMembers('Number').join(' ')} }
	interface Boolean { ${extensionMembers('Boolean').join(' ')} }
	interface Array<T> { ${extensionMembers('Array').join(' ')} }
	interface Object { ${extensionMembers('Object').join(' ')} }
	interface Date { ${date} }
`;
};

// Date extensions also apply to luxon DateTime (expression-extension.ts dispatches on isDateTime).
const luxonAugmentation = () => `
declare module 'luxon' {
	interface DateTime { ${extensionMembers('Date').join(' ')} }
}`;

// $min/$max/$average/$not/$ifEmpty come from extendedFunctions; $if is rewritten by the
// AST hook in expression-extension.ts, so it has no runtime doc.
const extendedFunctionDecls = () =>
	Object.entries(extendedFunctions)
		.filter(([name]) => name.startsWith('$'))
		.map(([name, fn]) => {
			const doc = (fn as { doc?: Doc }).doc;
			if (name === '$ifEmpty') return 'function $ifEmpty<V, E>(value: V, defaultValue: E): V | E;';
			if (name === '$not') return 'function $not(value: unknown): boolean;';
			return `function ${signature(name, doc ?? { name, returnType: 'number', args: [{ name: 'numbers', type: 'number', variadic: true }] }, 'root')}`;
		})
		.join('\n\t');

// ---------- root globals ----------

const nodeDataType = (n: NodeRuntime) =>
	`N8nNodeData<${jsonType(n.json)}, ${keyUnion(n.binaryKeys, 'string')}, ${n.params ? jsonType(n.params) : 'Record<string, any>'}>`;

export const buildGlobals = (rt: RuntimeTypes): string => {
	const nodes = Object.entries(rt.nodes ?? {});
	const nodeDataMap = nodes.map(([name, n]) => `${JSON.stringify(name)}: ${nodeDataType(n)};`).join('\n\t\t');
	const params = rt.parameters ? jsonType(rt.parameters) : 'Record<string, any>';

	return `
import type { DateTime, DurationUnit } from 'luxon';
${luxonAugmentation()}
declare global {
	${extensionInterfaces()}

	// ----- runtime-shaped (injected) -----
	type InputJson = ${jsonType(rt.input.json)};
	type InputBinaryKeys = ${keyUnion(rt.input.binaryKeys, 'string')};
	type NodeParams = ${params};
	interface NodeDataMap {
		${nodeDataMap}
	}
	const $vars: ${recordOf(rt.vars, 'string')};
	const $env: ${recordOf(rt.env, 'string')};

	// ----- fixed shapes (workflow-data-proxy.ts, get-additional-keys.ts) -----
	interface N8nBinaryData {
		data: string;
		mimeType: string;
		fileType?: string;
		fileName?: string;
		directory?: string;
		fileExtension?: string;
		fileSize?: string;
		id?: string;
	}
	interface N8nItem<J = InputJson, B extends string = InputBinaryKeys> {
		json: J;
		binary: Record<B, N8nBinaryData>;
		pairedItem?: { item: number; input?: number } | Array<{ item: number; input?: number }>;
	}
	interface N8nNodeData<J, B extends string, P> {
		item: N8nItem<J, B>;
		itemMatching(itemIndex: number): N8nItem<J, B>;
		pairedItem(itemIndex?: number): N8nItem<J, B>;
		first(branchIndex?: number, runIndex?: number): N8nItem<J, B>;
		last(branchIndex?: number, runIndex?: number): N8nItem<J, B>;
		all(branchIndex?: number, runIndex?: number): Array<N8nItem<J, B>>;
		context: Record<string, any>;
		params: P;
		isExecuted: boolean;
	}
	type AnyNodeData = N8nNodeData<Record<string, any>, string, Record<string, any>>;

	const $json: InputJson;
	/** @deprecated use $json */
	const $data: InputJson;
	const $binary: Record<InputBinaryKeys, N8nBinaryData>;
	const $input: {
		item: N8nItem;
		first(branchIndex?: number, runIndex?: number): N8nItem;
		last(branchIndex?: number, runIndex?: number): N8nItem;
		all(branchIndex?: number, runIndex?: number): N8nItem[];
		context: Record<string, any>;
		params: NodeParams;
	};
	function $<K extends keyof NodeDataMap>(nodeName: K, resolveFullItem?: boolean): NodeDataMap[K];
	function $(nodeName?: string, resolveFullItem?: boolean): AnyNodeData;
	/** @deprecated use $('Node') */
	const $node: {
		[K in keyof NodeDataMap]: NodeDataMap[K]['item'] & {
			parameter: NodeDataMap[K]['params'];
			context: Record<string, any>;
			runIndex: number;
		};
	} & Record<string, AnyNodeData['item'] & { parameter: Record<string, any>; context: Record<string, any>; runIndex: number }>;
	function $items(nodeName?: string, outputIndex?: number, runIndex?: number): N8nItem<Record<string, any>, string>[];
	/** @deprecated */
	function $item(itemIndex: number, runIndex?: number): any;

	const $parameter: NodeParams;
	const $rawParameter: NodeParams;
	const $prevNode: { name: string; outputIndex: number; runIndex: number };
	const $workflow: { id: string; name: string; active: boolean };
	const $execution: {
		id: string;
		mode: 'test' | 'production';
		resumeUrl: string;
		resumeFormUrl: string;
		customData?: {
			set(key: string, value: string): void;
			get(key: string): string;
			getAll(): Record<string, string>;
			setAll(values: Record<string, string>): void;
		};
	};
	const $evaluation: { runId: string } | undefined;
	const $secrets: Record<string, Record<string, any>>;
	const $mode: 'cli' | 'error' | 'integrated' | 'internal' | 'manual' | 'retry' | 'trigger' | 'webhook' | 'evaluation' | 'chat';
	const $itemIndex: number;
	const $runIndex: number;
	const $position: number;
	const $thisItemIndex: number;
	const $thisRunIndex: number;
	const $thisItem: N8nItem;
	const $nodeVersion: number;
	const $nodeId: string;
	const $webhookId: string | undefined;
	/** @deprecated use $execution.id */
	const $executionId: string;
	/** @deprecated use $execution.resumeUrl */
	const $resumeWebhookUrl: string;
	const $now: DateTime;
	const $today: DateTime;
	const $tool: any;
	const $agentInfo: {
		memoryConnectedToAgent: boolean;
		tools: Array<{ connected: boolean; name: string; type: string; resource?: string; operation?: string; hasCredentials?: boolean }>;
	};

	function $if<T, F = undefined>(condition: boolean, valueIfTrue: T, valueIfFalse?: F): T | F;
	${extendedFunctionDecls()}
	function $jmespath(data: Record<string, any> | any[], query: string): any;
	function $jmesPath(data: Record<string, any> | any[], query: string): any;
	function $evaluateExpression(expression: string, itemIndex?: number): any;
	function $fromAI(name: string, description?: string, type?: 'string' | 'number' | 'boolean' | 'json', defaultValue?: unknown): any;
	function $fromAi(name: string, description?: string, type?: 'string' | 'number' | 'boolean' | 'json', defaultValue?: unknown): any;
	function $fromai(name: string, description?: string, type?: 'string' | 'number' | 'boolean' | 'json', defaultValue?: unknown): any;
}
export {};
`;
};
