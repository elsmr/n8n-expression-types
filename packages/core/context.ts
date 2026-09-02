// Lambda form: the expression is TypeScript instead of a string, so the checker
// types and validates it natively. `LambdaContext<R>` mirrors globals.ts at the
// type level, derived from the runtime sample `R`.
//
//   expression(({ $json, $ }) => $json.n * $('Webhook').item.json.body.orderId, runtime)
//     // serialises to "={{ $json.n * $('Webhook').item.json.body.orderId }}"
//
// Prototype: a closure over a local variable compiles and breaks at runtime, because the
// body is serialised with fn.toString(). Needs an AST rule before real use.

import type { Json, NodeRuntime, RuntimeTypes } from './globals.ts';

/** Sample values are literal ('hello', 3); the expression should see string, number. */
type Widen<T> = T extends string
	? string
	: T extends number
		? number
		: T extends boolean
			? boolean
			: T extends null
				? null
				: T extends readonly (infer E)[]
					? Array<Widen<E>>
					: T extends object
						? { -readonly [K in keyof T]: Widen<T[K]> }
						: T;

type Literals<K> = K extends readonly (infer S extends string)[]
	? [S] extends [never]
		? string
		: S
	: string;
type BinaryKeys<N> = N extends NodeRuntime ? Literals<N['binaryKeys']> : string;
type ParamsOf<P> = P extends Json ? Widen<P> : Record<string, any>;
type NodeData<N> = N extends NodeRuntime
	? N8nNodeData<Widen<N['json']>, BinaryKeys<N>, ParamsOf<N['params']>>
	: N8nAnyNodeData;
type Nodes<R extends RuntimeTypes> = R['nodes'] extends Record<string, NodeRuntime>
	? R['nodes']
	: {};
type InputOf<R extends RuntimeTypes> = R['input'] extends NodeRuntime
	? R['input']
	: { json: N8nLooseJson };
type Vars<K> = K extends readonly (infer S extends string)[]
	? [S] extends [never]
		? Record<string, string>
		: Record<S, string>
	: Record<string, string>;

export type LambdaContext<R extends RuntimeTypes> = {
	$json: Widen<InputOf<R>['json']>;
	/** @deprecated use $json */
	$data: Widen<InputOf<R>['json']>;
	$binary: Record<BinaryKeys<InputOf<R>>, N8nBinaryData>;
	$input: N8nInput<Widen<InputOf<R>['json']>, BinaryKeys<InputOf<R>>, ParamsOf<R['parameters']>>;
	$thisItem: N8nItem<Widen<InputOf<R>['json']>, BinaryKeys<InputOf<R>>>;
	$: (<K extends keyof Nodes<R>>(nodeName: K, resolveFullItem?: boolean) => NodeData<Nodes<R>[K]>) &
		((nodeName?: string, resolveFullItem?: boolean) => N8nAnyNodeData);
	/** @deprecated use $('Node') */
	$node: {
		[K in keyof Nodes<R>]: Nodes<R>[K] extends NodeRuntime
			? N8nLegacyNode<
					Widen<Nodes<R>[K]['json']>,
					BinaryKeys<Nodes<R>[K]>,
					ParamsOf<Nodes<R>[K]['params']>
				>
			: never;
	} & Record<string, N8nLegacyNode<Record<string, any>, string, Record<string, any>>>;
	$items: (
		nodeName?: string,
		outputIndex?: number,
		runIndex?: number,
	) => Array<N8nItem<Record<string, any>, string>>;
	/** @deprecated */
	$item: (itemIndex: number, runIndex?: number) => any;

	$parameter: ParamsOf<R['parameters']>;
	$rawParameter: ParamsOf<R['parameters']>;
	$vars: Vars<R['vars']>;
	$env: Vars<R['env']>;
	$secrets: Record<string, Record<string, any>>;

	$prevNode: N8nPrevNode;
	$workflow: N8nWorkflow;
	$execution: N8nExecution;
	$evaluation: { runId: string } | undefined;
	$mode: N8nMode;
	$itemIndex: number;
	$runIndex: number;
	$position: number;
	$thisItemIndex: number;
	$thisRunIndex: number;
	$nodeVersion: number;
	$nodeId: string;
	$webhookId: string | undefined;
	/** @deprecated use $execution.id */
	$executionId: string;
	/** @deprecated use $execution.resumeUrl */
	$resumeWebhookUrl: string;
	$now: DateTime;
	$today: DateTime;
	$tool: any;
	$agentInfo: N8nAgentInfo;

	$if: <T, F = undefined>(condition: boolean, valueIfTrue: T, valueIfFalse?: F) => T | F;
	$ifEmpty: <V, E>(value: V, defaultValue: E) => V | E;
	$min: (...numbers: number[]) => number;
	$max: (...numbers: number[]) => number;
	$average: (...numbers: number[]) => number;
	$not: (value: unknown) => boolean;
	$jmespath: (data: Record<string, any> | any[], query: string) => any;
	$jmesPath: (data: Record<string, any> | any[], query: string) => any;
	$evaluateExpression: (expression: string, itemIndex?: number) => any;
	$fromAI: (
		name: string,
		description?: string,
		type?: N8nFromAIType,
		defaultValue?: unknown,
	) => any;
	$fromAi: (
		name: string,
		description?: string,
		type?: N8nFromAIType,
		defaultValue?: unknown,
	) => any;
	$fromai: (
		name: string,
		description?: string,
		type?: N8nFromAIType,
		defaultValue?: unknown,
	) => any;
};

/** An n8n expression string produced from a lambda, remembering the type it evaluates to. */
export type LambdaExpression<T> = string & { readonly __n8nType?: T };

/**
 * Types the lambda against `runtime` and serialises it to an `={{ }}` string.
 * The lambda must destructure the context (`({ $json, $ }) => ...`) and have an
 * expression body, so the body is already valid n8n expression syntax.
 */
export const expression = <const R extends RuntimeTypes, T>(
	fn: (ctx: LambdaContext<R>) => T,
	_runtime: R,
): LambdaExpression<T> => {
	const source = fn.toString();
	const arrow = source.indexOf('=>');
	const params = source.slice(0, arrow).trim();
	const body = source.slice(arrow + 2).trim();
	if (!params.startsWith('({')) throw new Error('Destructure the context: ({ $json, $ }) => ...');
	if (body.startsWith('{')) throw new Error('Use an expression body, not a block');
	return `={{ ${body} }}`;
};
