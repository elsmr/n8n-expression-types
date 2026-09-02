/// <reference path="./shapes.d.ts" />
// String form.
//
//   expr('={{ $now.toISO() }}')                     Expression<string, 'nodeParameter'>
//   expr.routing('={{ $credentials.baseUrl }}')     Expression<any, 'routing'>: no data known here
//   resolve(expression, data)                       T, checked against `data`
//   Resolve<typeof expression, typeof data>         same check, type only
//
// Types come from `N8nResolvedTypes`, filled per (context, text) by the generator
// (gen-resolved.ts, or the language service plugin while you type). An expression that
// is resolve()d somewhere gets the type computed against that data; otherwise the type
// from what the surrounding code declares, with runtime holes loose. Until generated the
// type is `any`. At runtime expr() returns its argument; resolve() is n8n's job.

import {
	contextNames,
	type ContextByName,
	type ContextName,
	type ContextType,
	type ExpressionContext,
	type NodeParameterContext,
	type RuntimeTypes,
} from './globals.ts';

declare global {
	/**
	 * Filled by the generator, one entry per (context, text):
	 *   loose: the definition-time type, runtime holes unchecked
	 *   strict: [dataType, result] for every resolve()/Resolve<> site, matched structurally
	 */
	interface N8nResolvedTypes {}
}

type Entry = { loose: unknown; strict: unknown[] };
type Brand<T, C, E> = { readonly __n8n?: { type: T; context: C; text: E } };

/** Slot declaration: a string that must be an expression yielding T in context C. */
export type Expression<T = unknown, C extends ContextType = NodeParameterContext> = string & Brand<T, C, string>;

export type ResolvedKey<C extends ContextType, E extends string> = `${ContextName<C>}::${E}`;
export const resolvedKey = (context: string, expression: string) => `${context}::${expression}`;

type EntryOf<C extends ContextType, E extends string> =
	ResolvedKey<C, E> extends keyof N8nResolvedTypes
		? N8nResolvedTypes[ResolvedKey<C, E>] extends Entry
			? N8nResolvedTypes[ResolvedKey<C, E>]
			: never
		: never;

type IsAny<T> = 0 extends 1 & T ? true : false;

/** Definition-time type: what the text yields with runtime holes loose. `any` until generated. */
export type Resolved<C extends ContextType, E extends string> = [EntryOf<C, E>] extends [never] ? any : EntryOf<C, E>['loose'];

/** What expr() returns: the text E declared as an expression in context C. Its type is derived, not shown. */
export type Expr<C extends ContextType, E extends string> = string & Brand<Resolved<C, E>, C, E>;
/** Same, when the text is wrong in its context. The plugin or gen-resolved says why. */
export type InvalidExpr<C extends ContextType, E extends string> = string & Brand<N8nInvalidExpression, C, E>;

type ExprResult<C extends ContextType, E extends string> =
	IsAny<Resolved<C, E>> extends true
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

type ExprFn<C extends ContextType> = <const E extends string>(expression: E) => ExprResult<C, E>;

const make =
	<C extends ContextType>(_name: ContextName<C>): ExprFn<C> =>
	(expression) =>
		expression as ExprResult<C, typeof expression>;

type ExprByContext = { readonly [N in ExpressionContext]: ExprFn<ContextByName<N>> };

export const expr: ExprFn<NodeParameterContext> & ExprByContext = Object.assign(
	make<NodeParameterContext>('nodeParameter'),
	Object.fromEntries(contextNames().map((n) => [n, make(n)])) as ExprByContext,
);

type AnyExpr = string & Brand<any, any, any>;
export type DataFor<C extends ContextType> = Omit<RuntimeTypes, 'context'> & { context?: ContextName<C> };
export type ContextOf<X> = X extends Brand<any, infer C extends ContextType, any> ? C : never;

/**
 * The type `X` yields against data `D`, from the generator's record of this exact pairing.
 * Unknown pairing (not generated yet, or D is not portable) falls back to the loose type.
 */
export type Resolve<X extends AnyExpr, D> =
	X extends Brand<infer T, infer C extends ContextType, infer E extends string>
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
