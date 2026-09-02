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

import { EXPRESSION_CONTEXTS, type ExpressionContext, type RuntimeTypes } from './globals.ts';

declare global {
	/**
	 * Filled by the generator, one entry per (context, text):
	 *   loose: the definition-time type, runtime holes unchecked
	 *   strict: [dataType, result] for every resolve()/Resolve<> site, matched structurally
	 */
	interface N8nResolvedTypes {}
}

type Entry = { loose: unknown; strict: unknown[] };

/** An n8n expression string that evaluates to T in context C. `E` remembers the text. */
export type Expression<T = unknown, C extends ExpressionContext = 'nodeParameter', E extends string = string> = string & {
	readonly __n8n?: { type: T; context: C; text: E };
};

export type ResolvedKey<C extends string, E extends string> = `${C}::${E}`;
export const resolvedKey = (context: string, expression: string) => `${context}::${expression}`;

type EntryOf<C extends ExpressionContext, E extends string> =
	ResolvedKey<C, E> extends keyof N8nResolvedTypes
		? N8nResolvedTypes[ResolvedKey<C, E>] extends Entry
			? N8nResolvedTypes[ResolvedKey<C, E>]
			: never
		: never;

/** Definition-time type: what the text yields with runtime holes loose. `any` until generated. */
export type Resolved<C extends ExpressionContext, E extends string> = [EntryOf<C, E>] extends [never] ? any : EntryOf<C, E>['loose'];

// First pair whose data type is structurally identical to D.
type Match<Pairs, D> = Pairs extends [[infer K, infer T], ...infer Rest]
	? [D] extends [K]
		? [K] extends [D]
			? T
			: Match<Rest, D>
		: Match<Rest, D>
	: never;

type ExprFn<C extends ExpressionContext> = <const E extends string>(expression: E) => Expression<Resolved<C, E>, C, E>;

const make =
	<C extends ExpressionContext>(_context: C): ExprFn<C> =>
	(expression) =>
		expression as Expression<any, C, typeof expression>;

export const expr: ExprFn<'nodeParameter'> & { readonly [C in ExpressionContext]: ExprFn<C> } = Object.assign(
	make('nodeParameter'),
	Object.fromEntries(EXPRESSION_CONTEXTS.map((c) => [c, make(c)])) as { [C in ExpressionContext]: ExprFn<C> },
);

export type DataFor<C extends ExpressionContext> = Omit<RuntimeTypes, 'context'> & { context?: C };
export type ContextOf<X> = X extends Expression<any, infer C, any> ? C : never;

/**
 * The type `X` yields against data `D`, from the generator's record of this exact pairing.
 * Unknown pairing (not generated yet, or D is not portable) falls back to the loose type.
 */
export type Resolve<X extends Expression<any, any, any>, D> =
	X extends Expression<infer T, infer C extends ExpressionContext, infer E extends string>
		? [Match<EntryOf<C, E>['strict'], D>] extends [never]
			? T
			: Match<EntryOf<C, E>['strict'], D>
		: never;

/** Evaluation belongs to n8n's Expression class; this carries the types only. */
export const resolve = <X extends Expression<any, any, any>, D extends DataFor<ContextOf<X>>>(
	_expression: X,
	_data: D,
): Resolve<X, D> => {
	throw new Error('resolve() is a typed stub; evaluate with n8n');
};
