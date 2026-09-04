// What an n8n expression can see, per context, as TypeScript interfaces over a runtime
// sample `R`. The lambda form takes them as its parameter type; the string form gets them
// declared as globals in its virtual file (service.ts). A hole `R` does not fill is `H`:
// N8nLooseJson (any) at expr() time, `never` against resolve() data, where a hole is an error.
//
// Sources: packages/workflow/src/workflow-data-proxy.ts, packages/core/.../
// get-additional-keys.ts, routing-node.ts, request-helpers/pagination.ts.

export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export type NodeRuntime = {
	json: Json;
	binaryKeys?: readonly string[];
	params?: Json;
};

/** Sample values. Types are derived from them. Everything is optional: a hole is `H` in the context. */
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

// ---------- deriving types from a sample ----------

type Prop<R, K extends string> = K extends keyof R ? Exclude<R[K], undefined> : never;
type Or<V, Fallback> = [V] extends [never] ? Fallback : V;
/** The sample's type for `K`; the hole `H` when the sample has none. */
type Data<R, K extends string, H> = Or<Prop<R, K>, H>;
/** ['a', 'b'] as const → 'a' | 'b'; anything else means "any key", or no key when H is never. */
type Keys<K, H> = [K] extends [readonly (infer S extends string)[]]
	? [S] extends [never]
		? AnyKey<H>
		: S
	: AnyKey<H>;
type AnyKey<H> = [H] extends [never] ? never : string;

type Input<R> = Prop<R, 'input'>;
type Nodes<R> = Or<Prop<R, 'nodes'>, {}>;
type NodeData<N, H> = N8nNodeData<
	Data<N, 'json', H>,
	Keys<Prop<N, 'binaryKeys'>, H>,
	Data<N, 'params', H>
>;

// ---------- contexts ----------

interface CommonContext<R, H> {
	/** The current date and time as a Luxon DateTime, in the workflow timezone. */
	$now: DateTime;
	/** Today at midnight as a Luxon DateTime, in the workflow timezone. */
	$today: DateTime;
	/** Workflow variables, all strings. */
	$vars: Record<Keys<Prop<R, 'vars'>, H>, string>;
	/** Environment variables, when access is allowed. */
	$env: Record<Keys<Prop<R, 'env'>, H>, string>;
	/** External secrets by provider, when enabled. */
	$secrets: Record<string, Record<string, any>>;
	/** Data about the current execution: id, mode, resume URLs, customData. */
	$execution: N8nExecution;
	$evaluation: { runId: string } | undefined;
	/** How the workflow was started. */
	$mode: N8nMode;
	/** The current workflow: id, name, active. */
	$workflow: N8nWorkflow;
	/** Queries data with a JMESPath expression. */
	$jmespath(data: Record<string, any> | any[], query: string): any;
	/** @deprecated use $jmespath */
	$jmesPath(data: Record<string, any> | any[], query: string): any;
	/** Evaluates an expression string at runtime. Returns any. */
	$evaluateExpression(expression: string, itemIndex?: number): any;
}

/** Node parameter values: runs per item with $json, $input, $('Node'), ... */
export interface NodeParameterContext<R = {}, H = N8nLooseJson> extends CommonContext<R, H> {
	/** JSON data of the current input item. */
	$json: Data<Input<R>, 'json', H>;
	/** @deprecated use $json */
	$data: Data<Input<R>, 'json', H>;
	/** Binary data of the current input item, by property name. */
	$binary: Record<Keys<Prop<Input<R>, 'binaryKeys'>, H>, N8nBinaryData>;
	/** The current node's input: item, first(), last(), all(), params. */
	$input: N8nInput<
		Data<Input<R>, 'json', H>,
		Keys<Prop<Input<R>, 'binaryKeys'>, H>,
		Data<R, 'parameters', H>
	>;
	/** The current input item, json and binary. */
	$thisItem: N8nItem<Data<Input<R>, 'json', H>, Keys<Prop<Input<R>, 'binaryKeys'>, H>>;
	/** Output of another node in the workflow: item, first(), last(), all(), params, isExecuted. */
	$<K extends keyof Nodes<R>>(nodeName: K, resolveFullItem?: boolean): NodeData<Nodes<R>[K], H>;
	$(nodeName?: string, resolveFullItem?: boolean): [H] extends [never] ? never : N8nAnyNodeData;
	/** @deprecated use $('Node') */
	$node: {
		[K in keyof Nodes<R>]: N8nLegacyNode<
			Data<Nodes<R>[K], 'json', H>,
			Keys<Prop<Nodes<R>[K], 'binaryKeys'>, H>,
			Data<Nodes<R>[K], 'params', H>
		>;
	} & Record<AnyKey<H>, N8nLegacyNode<N8nLooseJson, string, N8nLooseJson>>;
	$items(
		nodeName?: string,
		outputIndex?: number,
		runIndex?: number,
	): Array<N8nItem<N8nLooseJson, string>>;
	/** @deprecated */
	$item(itemIndex: number, runIndex?: number): any;
	/** The current node's parameters, resolved. */
	$parameter: Data<R, 'parameters', H>;
	$rawParameter: Data<R, 'parameters', H>;
	/** Index of the item this expression runs for. */
	$itemIndex: number;
	/** How many times the current node has run in this execution. */
	$runIndex: number;
	$position: number;
	$thisItemIndex: number;
	$thisRunIndex: number;
	/** The node the current input came from: name, outputIndex, runIndex. */
	$prevNode: N8nPrevNode;
	/** Type version of the current node. */
	$nodeVersion: number;
	$nodeId: string;
	$webhookId: string | undefined;
	/** @deprecated use $execution.id */
	$executionId: string;
	/** @deprecated use $execution.resumeUrl */
	$resumeWebhookUrl: string;
	/** Tool call context inside AI tool nodes. */
	$tool: any;
	/** Tools and memory connected to the current AI Agent node. */
	$agentInfo: N8nAgentInfo;
	$getPairedItem(
		destinationNodeName: string,
		incomingSourceData: unknown,
		pairedItem: unknown,
	): N8nItem<N8nLooseJson, string> | null;
	/** In AI tool nodes: lets the model fill this value. */
	$fromAI(name: string, description?: string, type?: N8nFromAIType, defaultValue?: unknown): any;
	/** @deprecated use $fromAI */
	$fromAi(name: string, description?: string, type?: N8nFromAIType, defaultValue?: unknown): any;
	/** @deprecated use $fromAI */
	$fromai(name: string, description?: string, type?: N8nFromAIType, defaultValue?: unknown): any;
}

/** HTTP Request pagination options (request-helpers/pagination.ts). */
export interface HttpPaginationContext<R = {}, H = N8nLooseJson>
	extends NodeParameterContext<R, H> {
	/** The HTTP request as sent: url, method, headers, qs, body. */
	$request: N8nHttpRequest<Data<R, 'request', H>>;
	/** The HTTP response: body, headers, statusCode. */
	$response: N8nHttpResponse<Data<R, 'response', H>>;
	$version: number;
	/** Number of pages fetched so far, starting at 0. */
	$pageCount: number;
}

/** Declarative node routing (routing-node.ts): request, send, output and postReceive expressions. */
export interface RoutingContext<R = {}, H = N8nLooseJson> extends NodeParameterContext<R, H> {
	/** Decrypted credential fields of the credential used by this node. */
	$credentials: Data<R, 'credentials', H>;
	/** The current value of the parameter this routing expression belongs to. */
	$value: Data<R, 'value', H>;
	$version: number;
	/** The HTTP response: body, headers, statusCode. */
	$response: N8nHttpResponse<Data<R, 'response', H>>;
	/** One item of the parsed response, in postReceive expressions. */
	$responseItem: Data<R, 'responseItem', H>;
	/** The HTTP request as sent: url, method, headers, qs, body. */
	$request: N8nHttpRequest<Data<R, 'request', H>>;
	$self: Data<R, 'credentials', H>;
}

/** Node description fields (subtitle, outputs): the node's parameters, no item data. */
export interface DescriptionContext<R = {}, H = N8nLooseJson> extends CommonContext<R, H> {
	/** The current node's parameters, resolved. */
	$parameter: Data<R, 'parameters', H>;
	$rawParameter: Data<R, 'parameters', H>;
	$nodeVersion: number;
	$nodeId: string;
	$self: Data<R, 'credentials', H>;
}

/** Credential fields: $self is the credential; $vars and $secrets from the common set. */
export interface CredentialContext<R = {}, H = N8nLooseJson> extends CommonContext<R, H> {
	$self: Data<R, 'credentials', H>;
}

// ---------- registry ----------
//
// Type side: the global map below, open for merging. Runtime side: the names list, so
// expr.<name>() exists.

declare global {
	interface N8nExpressionContexts<R, H = N8nLooseJson> {
		nodeParameter: NodeParameterContext<R, H>;
		httpPagination: HttpPaginationContext<R, H>;
		routing: RoutingContext<R, H>;
		description: DescriptionContext<R, H>;
		credential: CredentialContext<R, H>;
	}
}

export type ExpressionContext = keyof N8nExpressionContexts<{}> & string;
export type ContextByName<
	N extends ExpressionContext,
	R = {},
	H = N8nLooseJson,
> = N8nExpressionContexts<R, H>[N];
export type ContextType = ContextByName<ExpressionContext>;
/** The registry key of a context interface. Mutual `extends`, since contexts extend each other. */
export type ContextName<C> = {
	[N in ExpressionContext]: ContextByName<N> extends C
		? C extends ContextByName<N>
			? N
			: never
		: never;
}[ExpressionContext];

export const contextNames: readonly ExpressionContext[] = [
	'nodeParameter',
	'httpPagination',
	'routing',
	'description',
	'credential',
];
export const isContextName = (s: string | undefined): s is ExpressionContext =>
	(contextNames as readonly (string | undefined)[]).includes(s);

// ---------- shape as type text ----------

/** RuntimeTypes with every value already rendered as type text, so the checker's types fit too. */
export type RuntimeShape = {
	context: ExpressionContext;
	/** From resolve() data: holes are `never`, so reaching into them is an error. */
	strict?: boolean;
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

export const emptyShape = (context: ExpressionContext = 'nodeParameter'): RuntimeShape => ({
	context,
	nodes: {},
});

/** The shape as the `R` type argument for its context interface. */
export const renderShape = (s: RuntimeShape): string => {
	const tuple = (keys: readonly string[] | undefined) =>
		keys && keys.length > 0 ? `[${keys.map((k) => JSON.stringify(k)).join(', ')}]` : undefined;
	const node = (n: { json: string; binaryKeys?: readonly string[]; params?: string }) =>
		object([
			['json', n.json],
			['binaryKeys', tuple(n.binaryKeys)],
			['params', n.params],
		]);
	const object = (props: Array<[string, string | undefined]>) =>
		`{ ${props.flatMap(([k, v]) => (v ? [`${k}: ${v}`] : [])).join('; ')} }`;
	return object([
		[
			'input',
			object([
				['json', s.inputJson],
				['binaryKeys', tuple(s.inputBinaryKeys)],
			]),
		],
		['nodes', object(Object.entries(s.nodes).map(([k, n]) => [JSON.stringify(k), node(n)]))],
		['parameters', s.parameters],
		['credentials', s.credentials],
		['value', s.value],
		['response', s.response],
		['responseItem', s.responseItem],
		['request', s.request],
		['vars', tuple(s.vars)],
		['env', tuple(s.env)],
	]);
};
