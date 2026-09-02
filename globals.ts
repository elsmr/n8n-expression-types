// Generates the runtime-dependent ambient declarations an n8n expression sees inside
// {{ }}: $json, $binary, $('Node'), $parameter, $vars and the fixed `$` roots.
// Runtime-independent shapes live in shapes.d.ts; extension methods in extensions.d.ts.

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type NodeRuntime = {
	json: Json;
	binaryKeys?: readonly string[];
	params?: Json;
};

/** Sample values. Types are derived from them. */
export type RuntimeTypes = {
	/** Data on the current input item: $json, $binary, $input, $item, $items(). */
	input: NodeRuntime;
	/** Executed nodes by name: $('Name'), $node['Name']. */
	nodes?: Record<string, NodeRuntime>;
	/** Current node's parameters: $parameter, $rawParameter. */
	parameters?: Json;
	/** Known variable names: $vars.<name>. */
	vars?: readonly string[];
	/** Known env var names: $env.<name>. Empty means "any string key". */
	env?: readonly string[];
};

/** Same information as type text, so it can also be built from a checker type. */
export type RuntimeShape = {
	inputJson: string;
	inputBinaryKeys?: readonly string[];
	nodes: Record<string, { json: string; binaryKeys?: readonly string[]; params?: string }>;
	parameters?: string;
	vars?: readonly string[];
	env?: readonly string[];
};

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

export const shapeFromValues = (rt: RuntimeTypes): RuntimeShape => ({
	inputJson: jsonType(rt.input.json),
	inputBinaryKeys: rt.input.binaryKeys,
	nodes: Object.fromEntries(
		Object.entries(rt.nodes ?? {}).map(([name, n]) => [
			name,
			{ json: jsonType(n.json), binaryKeys: n.binaryKeys, params: n.params === undefined ? undefined : jsonType(n.params) },
		]),
	),
	parameters: rt.parameters === undefined ? undefined : jsonType(rt.parameters),
	vars: rt.vars,
	env: rt.env,
});

const keyUnion = (keys: readonly string[] | undefined, fallback: string) =>
	keys && keys.length > 0 ? keys.map((k) => JSON.stringify(k)).join(' | ') : fallback;

const recordOf = (keys: readonly string[] | undefined, valueType: string) =>
	keys && keys.length > 0
		? `{ ${keys.map((k) => `${JSON.stringify(k)}: ${valueType}`).join('; ')} }`
		: `Record<string, ${valueType}>`;

const ANY_RECORD = 'Record<string, any>';

export const buildGlobals = (s: RuntimeShape): string => {
	const B = keyUnion(s.inputBinaryKeys, 'string');
	const P = s.parameters ?? ANY_RECORD;
	const nodeDataMap = Object.entries(s.nodes)
		.map(([name, n]) => `${JSON.stringify(name)}: N8nNodeData<${n.json}, ${keyUnion(n.binaryKeys, 'string')}, ${n.params ?? ANY_RECORD}>;`)
		.join('\n\t\t');

	return `
declare global {
	interface NodeDataMap {
		${nodeDataMap}
	}

	const $json: ${s.inputJson};
	/** @deprecated use $json */
	const $data: ${s.inputJson};
	const $binary: Record<${B}, N8nBinaryData>;
	const $input: N8nInput<${s.inputJson}, ${B}, ${P}>;
	const $thisItem: N8nItem<${s.inputJson}, ${B}>;
	function $<K extends keyof NodeDataMap>(nodeName: K, resolveFullItem?: boolean): NodeDataMap[K];
	function $(nodeName?: string, resolveFullItem?: boolean): N8nAnyNodeData;
	/** @deprecated use $('Node') */
	const $node: {
		[K in keyof NodeDataMap]: N8nLegacyNode<NodeDataMap[K]['item']['json'], string, NodeDataMap[K]['params']>;
	} & Record<string, N8nLegacyNode<${ANY_RECORD}, string, ${ANY_RECORD}>>;
	function $items(nodeName?: string, outputIndex?: number, runIndex?: number): Array<N8nItem<${ANY_RECORD}, string>>;
	/** @deprecated */
	function $item(itemIndex: number, runIndex?: number): any;

	const $parameter: ${P};
	const $rawParameter: ${P};
	const $vars: ${recordOf(s.vars, 'string')};
	const $env: ${recordOf(s.env, 'string')};
	const $secrets: Record<string, Record<string, any>>;

	const $prevNode: N8nPrevNode;
	const $workflow: N8nWorkflow;
	const $execution: N8nExecution;
	const $evaluation: { runId: string } | undefined;
	const $mode: N8nMode;
	const $itemIndex: number;
	const $runIndex: number;
	const $position: number;
	const $thisItemIndex: number;
	const $thisRunIndex: number;
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
	const $agentInfo: N8nAgentInfo;

	function $jmespath(data: Record<string, any> | any[], query: string): any;
	function $jmesPath(data: Record<string, any> | any[], query: string): any;
	function $evaluateExpression(expression: string, itemIndex?: number): any;
	function $fromAI(name: string, description?: string, type?: N8nFromAIType, defaultValue?: unknown): any;
	function $fromAi(name: string, description?: string, type?: N8nFromAIType, defaultValue?: unknown): any;
	function $fromai(name: string, description?: string, type?: N8nFromAIType, defaultValue?: unknown): any;
}
export {};
`;
};
