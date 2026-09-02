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
	/** The current date and time as a Luxon DateTime, in the workflow timezone. */
	const $now: DateTime;
	/** Today at midnight as a Luxon DateTime, in the workflow timezone. */
	const $today: DateTime;
	/** Workflow variables, all strings. */
	const $vars: ${recordOf(s.vars, 'string')};
	/** Environment variables, when access is allowed. */
	const $env: ${recordOf(s.env, 'string')};
	/** External secrets by provider, when enabled. */
	const $secrets: Record<string, Record<string, any>>;
	/** Data about the current execution: id, mode, resume URLs, customData. */
	const $execution: N8nExecution;
	const $evaluation: { runId: string } | undefined;
	/** How the workflow was started. */
	const $mode: N8nMode;
	/** The current workflow: id, name, active. */
	const $workflow: N8nWorkflow;
	/** Queries data with a JMESPath expression. */
	function $jmespath(data: Record<string, any> | any[], query: string): any;
	function $jmesPath(data: Record<string, any> | any[], query: string): any;
	/** Evaluates an expression string at runtime. Returns any. */
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
	/** JSON data of the current input item. */
	const $json: ${J};
	/** @deprecated use $json */
	const $data: ${J};
	/** Binary data of the current input item, by property name. */
	const $binary: Record<${B}, N8nBinaryData>;
	/** The current node's input: item, first(), last(), all(), params. */
	const $input: N8nInput<${J}, ${B}, ${P}>;
	/** The current input item, json and binary. */
	const $thisItem: N8nItem<${J}, ${B}>;
	/** Output of another node in the workflow: item, first(), last(), all(), params, isExecuted. */
	function $<K extends keyof NodeDataMap>(nodeName: K, resolveFullItem?: boolean): NodeDataMap[K];
	function $(nodeName?: string, resolveFullItem?: boolean): N8nAnyNodeData;
	/** @deprecated use $('Node') */
	const $node: {
		[K in keyof NodeDataMap]: N8nLegacyNode<NodeDataMap[K]['item']['json'], string, NodeDataMap[K]['params']>;
	} & Record<string, N8nLegacyNode<${LOOSE}, string, ${LOOSE}>>;
	function $items(nodeName?: string, outputIndex?: number, runIndex?: number): Array<N8nItem<${LOOSE}, string>>;
	/** @deprecated */
	function $item(itemIndex: number, runIndex?: number): any;
	/** The current node's parameters, resolved. */
	const $parameter: ${P};
	const $rawParameter: ${P};
	/** Index of the item this expression runs for. */
	const $itemIndex: number;
	/** How many times the current node has run in this execution. */
	const $runIndex: number;
	const $position: number;
	const $thisItemIndex: number;
	const $thisRunIndex: number;
	/** The node the current input came from: name, outputIndex, runIndex. */
	const $prevNode: N8nPrevNode;
	/** Type version of the current node. */
	const $nodeVersion: number;
	const $nodeId: string;
	const $webhookId: string | undefined;
	/** @deprecated use $execution.id */
	const $executionId: string;
	/** @deprecated use $execution.resumeUrl */
	const $resumeWebhookUrl: string;
	/** Tool call context inside AI tool nodes. */
	const $tool: any;
	/** Tools and memory connected to the current AI Agent node. */
	const $agentInfo: N8nAgentInfo;
	function $getPairedItem(destinationNodeName: string, incomingSourceData: unknown, pairedItem: unknown): N8nItem<${LOOSE}, string> | null;
	/** In AI tool nodes: lets the model fill this value. */
	function $fromAI(name: string, description?: string, type?: N8nFromAIType, defaultValue?: unknown): any;
	function $fromAi(name: string, description?: string, type?: N8nFromAIType, defaultValue?: unknown): any;
	function $fromai(name: string, description?: string, type?: N8nFromAIType, defaultValue?: unknown): any;`;
};

// subtitle, outputs: getSimpleParameterValue with the node's parameters, no input data.
const description: Layer = (s) => `
	/** The current node's parameters, resolved. */
	const $parameter: ${or(s.parameters)};
	const $rawParameter: ${or(s.parameters)};
	const $nodeVersion: number;
	const $nodeId: string;
	const $self: ${or(s.credentials)};`;

// Declarative nodes (routing-node.ts): request, send, output and postReceive expressions.
const routing: Layer = (s) => `
	/** Decrypted credential fields of the credential used by this node. */
	const $credentials: ${or(s.credentials)};
	/** The current value of the parameter this routing expression belongs to. */
	const $value: ${or(s.value)};
	const $version: number;
	/** The HTTP response: body, headers, statusCode. */
	const $response: N8nHttpResponse<${or(s.response)}>;
	/** One item of the parsed response, in postReceive expressions. */
	const $responseItem: ${or(s.responseItem)};
	/** The HTTP request as sent: url, method, headers, qs, body. */
	const $request: N8nHttpRequest<${or(s.request)}>;
	const $self: ${or(s.credentials)};`;

// HTTP Request pagination (request-helpers/pagination.ts:95).
const pagination: Layer = (s) => `
	/** The HTTP request as sent: url, method, headers, qs, body. */
	const $request: N8nHttpRequest<${or(s.request)}>;
	/** The HTTP response: body, headers, statusCode. */
	const $response: N8nHttpResponse<${or(s.response)}>;
	const $version: number;
	/** Number of pages fetched so far, starting at 0. */
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
