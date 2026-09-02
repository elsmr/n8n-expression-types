// Generates the ambient declarations an n8n expression sees inside {{ }}.
//
// A context picks layers; a shape fills the runtime-dependent holes ($json, $parameter,
// $credentials, ...). A hole with no shape is N8nLooseJson (any): JSON-legal, unchecked.
// Runtime-independent shapes live in shapes.d.ts, extension methods in extensions.d.ts.
//
// Sources: packages/workflow/src/workflow-data-proxy.ts (`base`), packages/core/.../
// get-additional-keys.ts, routing-node.ts, request-helpers/pagination.ts.

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

// ---------- context registry ----------
//
// A context is a named set of layers. Type side: an interface registered on the global
// `N8nExpressionContexts`, so `Expr<NodeParameterContext, ...>` reads as a name and the
// lookup key is derived from `name`. Runtime side: `defineContext()` registers the same
// name with its layers for the tooling. Adding a context is one file doing both.

export interface ContextDefinition<Name extends string = string> {
	readonly name: Name;
	readonly layers: readonly LayerName[];
}

declare global {
	interface N8nExpressionContexts {}
}

export type ContextType = N8nExpressionContexts[keyof N8nExpressionContexts];
export type ExpressionContext = keyof N8nExpressionContexts & string;
export type ContextName<C> = C extends { readonly name: infer N extends string } ? N : never;
export type ContextByName<N extends ExpressionContext> = N8nExpressionContexts[N];

const registry = new Map<string, ContextDefinition>();

export const defineContext = <C extends ContextDefinition>(definition: C): C => {
	registry.set(definition.name, definition);
	return definition;
};

export const contextNames = (): ExpressionContext[] => [...registry.keys()] as ExpressionContext[];
export const isContextName = (s: string | undefined): s is ExpressionContext => registry.has(s ?? '');

export type NodeRuntime = {
	json: Json;
	binaryKeys?: readonly string[];
	params?: Json;
};

/** Sample values. Types are derived from them. Everything is optional: missing means loose. */
export type RuntimeTypes = {
	context?: ExpressionContext;
	/** Current input item: $json, $binary, $input, $item, $items(). */
	input?: NodeRuntime;
	/** Executed nodes by name: $('Name'), $node['Name']. */
	nodes?: Record<string, NodeRuntime>;
	/** Current node's parameters: $parameter, $rawParameter. */
	parameters?: Json;
	/** routing / credential: $credentials, $self */
	credentials?: Json;
	/** routing: $value */
	value?: Json;
	/** routing / httpPagination: $response.body, $request */
	response?: Json;
	responseItem?: Json;
	request?: Json;
	vars?: readonly string[];
	env?: readonly string[];
};

/** Same information as type text, so it can also be built from a checker type. */
export type RuntimeShape = {
	context: ExpressionContext;
	inputJson?: string;
	inputBinaryKeys?: readonly string[];
	nodes: Record<string, { json: string; binaryKeys?: readonly string[]; params?: string }>;
	parameters?: string;
	credentials?: string;
	value?: string;
	response?: string;
	responseItem?: string;
	request?: string;
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

const opt = (v: Json | undefined) => (v === undefined ? undefined : jsonType(v));

export const shapeFromValues = (rt: RuntimeTypes): RuntimeShape => ({
	context: rt.context ?? 'nodeParameter',
	inputJson: opt(rt.input?.json),
	inputBinaryKeys: rt.input?.binaryKeys,
	nodes: Object.fromEntries(
		Object.entries(rt.nodes ?? {}).map(([name, n]) => [
			name,
			{ json: jsonType(n.json), binaryKeys: n.binaryKeys, params: opt(n.params) },
		]),
	),
	parameters: opt(rt.parameters),
	credentials: opt(rt.credentials),
	value: opt(rt.value),
	response: opt(rt.response),
	responseItem: opt(rt.responseItem),
	request: opt(rt.request),
	vars: rt.vars,
	env: rt.env,
});

export const emptyShape = (context: ExpressionContext = 'nodeParameter'): RuntimeShape => ({ context, nodes: {} });

// ---------- layers ----------

const LOOSE = 'N8nLooseJson';
const or = (text: string | undefined) => text ?? LOOSE;

const keyUnion = (keys: readonly string[] | undefined, fallback: string) =>
	keys && keys.length > 0 ? keys.map((k) => JSON.stringify(k)).join(' | ') : fallback;

const recordOf = (keys: readonly string[] | undefined, valueType: string) =>
	keys && keys.length > 0
		? `{ ${keys.map((k) => `${JSON.stringify(k)}: ${valueType}`).join('; ')} }`
		: `Record<string, ${valueType}>`;

type Layer = (s: RuntimeShape) => string;

const core: Layer = (s) => `
	const $now: DateTime;
	const $today: DateTime;
	const $vars: ${recordOf(s.vars, 'string')};
	const $env: ${recordOf(s.env, 'string')};
	const $secrets: Record<string, Record<string, any>>;
	const $execution: N8nExecution;
	const $evaluation: { runId: string } | undefined;
	const $mode: N8nMode;
	const $workflow: N8nWorkflow;
	function $jmespath(data: Record<string, any> | any[], query: string): any;
	function $jmesPath(data: Record<string, any> | any[], query: string): any;
	function $evaluateExpression(expression: string, itemIndex?: number): any;`;

const item: Layer = (s) => {
	const J = or(s.inputJson);
	const B = keyUnion(s.inputBinaryKeys, 'string');
	const P = or(s.parameters);
	const nodeDataMap = Object.entries(s.nodes)
		.map(([name, n]) => `${JSON.stringify(name)}: N8nNodeData<${n.json}, ${keyUnion(n.binaryKeys, 'string')}, ${or(n.params)}>;`)
		.join('\n\t\t');
	return `
	interface NodeDataMap {
		${nodeDataMap}
	}
	const $json: ${J};
	/** @deprecated use $json */
	const $data: ${J};
	const $binary: Record<${B}, N8nBinaryData>;
	const $input: N8nInput<${J}, ${B}, ${P}>;
	const $thisItem: N8nItem<${J}, ${B}>;
	function $<K extends keyof NodeDataMap>(nodeName: K, resolveFullItem?: boolean): NodeDataMap[K];
	function $(nodeName?: string, resolveFullItem?: boolean): N8nAnyNodeData;
	/** @deprecated use $('Node') */
	const $node: {
		[K in keyof NodeDataMap]: N8nLegacyNode<NodeDataMap[K]['item']['json'], string, NodeDataMap[K]['params']>;
	} & Record<string, N8nLegacyNode<${LOOSE}, string, ${LOOSE}>>;
	function $items(nodeName?: string, outputIndex?: number, runIndex?: number): Array<N8nItem<${LOOSE}, string>>;
	/** @deprecated */
	function $item(itemIndex: number, runIndex?: number): any;
	const $parameter: ${P};
	const $rawParameter: ${P};
	const $itemIndex: number;
	const $runIndex: number;
	const $position: number;
	const $thisItemIndex: number;
	const $thisRunIndex: number;
	const $prevNode: N8nPrevNode;
	const $nodeVersion: number;
	const $nodeId: string;
	const $webhookId: string | undefined;
	/** @deprecated use $execution.id */
	const $executionId: string;
	/** @deprecated use $execution.resumeUrl */
	const $resumeWebhookUrl: string;
	const $tool: any;
	const $agentInfo: N8nAgentInfo;
	function $getPairedItem(destinationNodeName: string, incomingSourceData: unknown, pairedItem: unknown): N8nItem<${LOOSE}, string> | null;
	function $fromAI(name: string, description?: string, type?: N8nFromAIType, defaultValue?: unknown): any;
	function $fromAi(name: string, description?: string, type?: N8nFromAIType, defaultValue?: unknown): any;
	function $fromai(name: string, description?: string, type?: N8nFromAIType, defaultValue?: unknown): any;`;
};

// subtitle, outputs: getSimpleParameterValue with the node's parameters, no input data.
const description: Layer = (s) => `
	const $parameter: ${or(s.parameters)};
	const $rawParameter: ${or(s.parameters)};
	const $nodeVersion: number;
	const $nodeId: string;
	const $self: ${or(s.credentials)};`;

// Declarative nodes (routing-node.ts): request, send, output and postReceive expressions.
const routing: Layer = (s) => `
	const $credentials: ${or(s.credentials)};
	const $value: ${or(s.value)};
	const $version: number;
	const $response: N8nHttpResponse<${or(s.response)}>;
	const $responseItem: ${or(s.responseItem)};
	const $request: N8nHttpRequest<${or(s.request)}>;
	const $self: ${or(s.credentials)};`;

// HTTP Request pagination (request-helpers/pagination.ts:95).
const pagination: Layer = (s) => `
	const $request: N8nHttpRequest<${or(s.request)}>;
	const $response: N8nHttpResponse<${or(s.response)}>;
	const $version: number;
	const $pageCount: number;`;

// Credential fields: getAdditionalKeys(isCredential) gives $vars/$secrets; $self is the credential.
const credential: Layer = (s) => `
	const $self: ${or(s.credentials)};`;

export const LAYERS = { core, item, description, routing, pagination, credential };
export type LayerName = keyof typeof LAYERS;

export const buildGlobals = (s: RuntimeShape): string => {
	const definition = registry.get(s.context);
	if (!definition) throw new Error(`Unknown expression context "${s.context}"`);
	return `\ndeclare global {${definition.layers.map((l) => LAYERS[l](s)).join('\n')}\n}\nexport {};\n`;
};

/** Names declared by a context, for the drift check. */
export const declaredNames = (context: ExpressionContext): string[] =>
	[...buildGlobals(emptyShape(context)).matchAll(/(?:const|function) (\$\w*)/g)].map((m) => m[1]);

// ---------- built-in contexts ----------

export interface NodeParameterContext extends ContextDefinition<'nodeParameter'> {}
export interface HttpPaginationContext extends ContextDefinition<'httpPagination'> {}
export interface RoutingContext extends ContextDefinition<'routing'> {}
export interface DescriptionContext extends ContextDefinition<'description'> {}
export interface CredentialContext extends ContextDefinition<'credential'> {}

declare global {
	interface N8nExpressionContexts {
		nodeParameter: NodeParameterContext;
		httpPagination: HttpPaginationContext;
		routing: RoutingContext;
		description: DescriptionContext;
		credential: CredentialContext;
	}
}

/** Node parameter values: runs per item with $json, $input, $('Node'), ... */
export const nodeParameterContext = defineContext<NodeParameterContext>({ name: 'nodeParameter', layers: ['core', 'item'] });
/** HTTP Request pagination options: adds $request, $response, $version, $pageCount. */
export const httpPaginationContext = defineContext<HttpPaginationContext>({ name: 'httpPagination', layers: ['core', 'item', 'pagination'] });
/** Declarative node routing: adds $credentials, $value, $response, $responseItem, $request, $self. */
export const routingContext = defineContext<RoutingContext>({ name: 'routing', layers: ['core', 'item', 'routing'] });
/** Node description fields (subtitle, outputs): $parameter, no item data. */
export const descriptionContext = defineContext<DescriptionContext>({ name: 'description', layers: ['core', 'description'] });
/** Credential fields: $self, $secrets, $vars. */
export const credentialContext = defineContext<CredentialContext>({ name: 'credential', layers: ['core', 'credential'] });
