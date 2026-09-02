// String form.
//
//   expr('={{ $json.n * 2 }}')                     Expression<number, 'nodeParameter'>
//   expr.routing('={{ $credentials.baseUrl }}')     Expression<any, 'routing'>
//   expr('={{ $json.n }}', runtime)                 strict against the sample's shape
//   resolve(expression, data)                       T; the plugin re-checks against `data`
//
// Types come from `N8nResolvedTypes`, filled per (context, text) by the generator
// (gen-resolved.ts, or the language service plugin while you type). Until generated the
// type is `any`. At runtime expr() returns its argument; resolve() is n8n's job.

import { EXPRESSION_CONTEXTS, type ExpressionContext, type RuntimeTypes } from './globals.ts';

declare global {
	interface N8nResolvedTypes {}
}

/** An n8n expression string that evaluates to T in context C. */
export type Expression<T = unknown, C extends ExpressionContext = 'nodeParameter'> = string & {
	readonly __n8n?: { type: T; context: C };
};

export type ResolvedKey<C extends string, E extends string> = `${C}::${E}`;
export type Resolved<C extends ExpressionContext, E extends string> =
	ResolvedKey<C, E> extends keyof N8nResolvedTypes ? N8nResolvedTypes[ResolvedKey<C, E>] : any;

export const resolvedKey = (context: string, expression: string) => `${context}::${expression}`;

type ExprFn<C extends ExpressionContext> = <const E extends string>(
	expression: E,
	runtime?: RuntimeTypes,
) => Expression<Resolved<C, E>, C>;

const make =
	<C extends ExpressionContext>(_context: C): ExprFn<C> =>
	(expression) =>
		expression as Expression<any, C>;

export const expr: ExprFn<'nodeParameter'> & { readonly [C in ExpressionContext]: ExprFn<C> } = Object.assign(
	make('nodeParameter'),
	Object.fromEntries(EXPRESSION_CONTEXTS.map((c) => [c, make(c)])) as { [C in ExpressionContext]: ExprFn<C> },
);

export type DataFor<C extends ExpressionContext> = Omit<RuntimeTypes, 'context'> & { context?: C };

/** Evaluation belongs to n8n's Expression class; this carries the types only. */
export const resolve = <T, C extends ExpressionContext>(_expression: Expression<T, C>, _data: DataFor<C>): T => {
	throw new Error('resolve() is a typed stub; evaluate with n8n');
};
