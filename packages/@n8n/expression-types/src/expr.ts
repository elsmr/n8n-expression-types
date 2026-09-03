/// <reference path="./shapes.d.ts" preserve="true" />
// expr() takes an n8n expression as a string or as a lambda over the context.
//
//   expr('={{ $now.toISO() }}')                   Expr<NodeParameterContext, "={{ $now.toISO() }}">
//   expr.routing('={{ $credentials.baseUrl }}')   Expr<RoutingContext, "...">
//   expr('={{ $pageCount }}')                     InvalidExpr<NodeParameterContext, "...">
//   expr(({ $json }) => $json.n * 2)              LambdaExpr<NodeParameterContext, number>
//   resolve(expression, data)                     the type against `data`
//   Resolve<typeof expression, typeof data>       same, type only
//
// String: TypeScript cannot parse it, so the types come from `N8nResolvedTypes`, a lookup
// the plugin writes while you type and `check` writes for CI. The text lives in the
// brand because it is the only key into that lookup. Until filled, `any`.
// Lambda: TypeScript checks the body against the context interface, runtime holes loose.
// It is serialised to `={{ body }}` with fn.toString(), so it is checked once, here;
// resolve() only returns the type it carries.
// At runtime expr() returns a string; evaluation is n8n's job.

import {
	contextNames,
	type ContextByName,
	type ContextName,
	type ContextType,
	type ExpressionContext,
	type NodeParameterContext,
	type RuntimeTypes,
} from './contexts.ts';

declare global {
	/**
	 * Filled by the generator, one entry per (context, text):
	 *   loose: the definition-time type, runtime holes unchecked
	 *   strict: [dataType, result] for every resolve()/Resolve<> site, matched structurally
	 * The index signature is what a missing key resolves to (`any`, no pairs). Looking keys
	 * up through `keyof` instead made checking quadratic in the number of entries.
	 */
	interface N8nResolvedTypes {
		[key: string]: { loose: any; strict: unknown[] };
	}
}

/**
 * `context` is invariant: contexts extend each other, and an expression written for the
 * larger one must not fill a slot for the smaller. `name` duplicates ContextName<C> so the
 * scanner can read it as a literal.
 */
type Mark<T, C, E> = { type: T; context: (c: C) => C; name: ContextName<C>; text: E };

/**
 * Slot declaration: a string that must be an expression yielding T in context C. The brand
 * is optional so a bare literal still fits; the plugin checks the literal. A value from
 * expr() carries the brand and is checked on T and C by TypeScript itself.
 */
export type Expression<T = unknown, C extends ContextType = NodeParameterContext> = string & {
	readonly __n8n?: Mark<T, C, string>;
};

type Marked<T, C, E> = string & { readonly __n8n: Mark<T, C, E> };

export type ResolvedKey<C extends ContextType, E extends string> = `${ContextName<C>}::${E}`;
export const resolvedKey = (context: string, expression: string) => `${context}::${expression}`;

type EntryOf<C extends ContextType, E extends string> = N8nResolvedTypes[ResolvedKey<C, E>];

type IsAny<T> = 0 extends 1 & T ? true : false;

/** Definition-time type: what the text yields with runtime holes loose. `any` until generated. */
export type Resolved<C extends ContextType, E extends string> = EntryOf<C, E>['loose'];

/** What expr() returns: the text E declared as an expression in context C. Its type is derived, not shown. */
export type Expr<C extends ContextType, E extends string> = Marked<Resolved<C, E>, C, E>;
/** Same, when the text is wrong in its context. The plugin or `check` says why. */
export type InvalidExpr<C extends ContextType, E extends string> = Marked<
	N8nInvalidExpression,
	C,
	E
>;
/** What expr(lambda) returns: the lambda serialised to expression text, yielding T. */
export type LambdaExpr<C extends ContextType, T> = Marked<T, C, string>;

type ExprResult<C extends ContextType, E extends string> = IsAny<Resolved<C, E>> extends true
	? Expr<C, E>
	: Resolved<C, E> extends N8nInvalidExpression
		? InvalidExpr<C, E>
		: Expr<C, E>;

// First pair whose data type is structurally identical to D.
type Match<Pairs, D> = Pairs extends [[infer K, infer T], ...infer Rest]
	? [D] extends [K]
		? [K] extends [D]
			? T
			: Match<Rest, D>
		: Match<Rest, D>
	: never;

type ExprFn<C extends ContextType> = {
	<const E extends string>(expression: E): ExprResult<C, E>;
	/**
	 * Must destructure the context (`({ $json, $ }) => ...`) and have an expression body.
	 * Serialised from compiled output: needs `target` >= ES2020 and no minifier, and a
	 * closure over a local compiles but breaks at runtime.
	 */
	<T>(fn: (ctx: C & N8nHelpers) => T): LambdaExpr<C, T>;
};

const serialise = (fn: Function) => {
	const source = fn.toString();
	const arrow = source.indexOf('=>');
	const params = source.slice(0, arrow).trim();
	const body = source.slice(arrow + 2).trim();
	if (!params.startsWith('({')) throw new Error('Destructure the context: ({ $json, $ }) => ...');
	if (body.startsWith('{')) throw new Error('Use an expression body, not a block');
	return `={{ ${body} }}`;
};

const make = <C extends ContextType>(): ExprFn<C> =>
	((expression: string | Function) =>
		typeof expression === 'function' ? serialise(expression) : expression) as ExprFn<C>;

type ExprByContext = { readonly [N in ExpressionContext]: ExprFn<ContextByName<N>> };

export const expr: ExprFn<NodeParameterContext> & ExprByContext = Object.assign(
	make<NodeParameterContext>(),
	Object.fromEntries(contextNames().map((n) => [n, make()])) as ExprByContext,
);

type AnyExpr = Expression<any, any>;
export type DataFor<C extends ContextType> = Omit<RuntimeTypes, 'context'> & {
	context?: ContextName<C>;
};
export type ContextOf<X> = X extends Expression<any, infer C extends ContextType> ? C : never;

/**
 * The type `X` yields against data `D`, from the generator's record of this exact pairing.
 * Unknown pairing (not generated yet, D is not portable, or X is a lambda) falls back to
 * the type X carries.
 */
export type Resolve<X extends AnyExpr, D> = X extends {
	readonly __n8n?: {
		type: infer T;
		context: (c: infer C extends ContextType) => any;
		text: infer E extends string;
	};
}
	? [Match<EntryOf<C, E>['strict'], D>] extends [never]
		? T
		: Match<EntryOf<C, E>['strict'], D>
	: never;

/** Evaluation belongs to n8n's Expression class; this carries the types only. */
export const resolve = <X extends AnyExpr, D extends DataFor<ContextOf<X>>>(
	_expression: X,
	_data: D,
): Resolve<X, D> => {
	throw new Error('resolve() is a typed stub; evaluate with n8n');
};
