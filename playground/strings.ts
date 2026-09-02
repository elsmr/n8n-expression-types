// String form. expr() marks the literal and names the context. Data only enters through
// resolve(); the plugin (or `pnpm gen-resolved`) writes n8n-resolved.d.ts so the types
// flow: strict where a resolve() exists for the expression, loose otherwise.
import { expr, resolve, type Resolve } from '@n8n/expression-types';
import { pagination, runtime } from './runtime.ts';

// No shape: runtime data is loose, so anything under $json typechecks. Globals still do.
export const loose = expr('={{ $json.whatever.you.like.toTitleCase() }}');        // Expr<NodeParameterContext, "...">
export const badGlobal = expr('={{ $pageCount }}');
export const unsafe = expr('={{ $json.constructor.name + $.length }}');                // n8n sandbox: .constructor, bare $                                  // InvalidExpr<NodeParameterContext, "...">: not in this context
export const paged = expr.httpPagination('={{ $response.body.next ?? $request.url }}'); // Expr<HttpPaginationContext, "...">

// Declared without data: definition-time types, runtime holes loose.
export const orderId = expr("={{ $('Webhook').item.json.body.orderId }}");
export const subject = expr('=Order {{ $json.n }} for {{ $json.user.name }}');
export const total = expr('={{ $input.all().map((i) => i.json.n).sum() }}');
export const nextUrl = expr.httpPagination('={{ $response.body.next }}');
export const typo = expr('={{ $json.test.toUppercase() }}');                        // valid here: $json.test is loose
export const nullable = expr('={{ $json.nothing.x }}');
export const title = expr('={{ $json.test.toTitleCase() }}');
export const stamp = expr('={{ $now.toISO() }}');                                    // Resolve<typeof stamp, {}> is string | null
export const now = expr('={{ $now }}');                                             // a DateTime, no runtime hole

// Type only: the type an expression yields against specific data, without evaluating.
export type NextUrl = Resolve<typeof nextUrl, typeof pagination>;                      // string
export type NoNext = Resolve<typeof nextUrl, { context: 'httpPagination'; response: { items: number[] } }>; // N8nResolveError
export type BadGlobal = Resolve<typeof badGlobal, typeof runtime>;                      // N8nInvalidExpression: wrong regardless of data
export type Subject = Resolve<typeof subject, typeof runtime>;                          // string
export type OrderId = Resolve<typeof orderId, typeof runtime>;                          // number

// Evaluation: data enters here. The plugin checks each expression against it.
export const check = () => {
	const a = resolve(orderId, runtime);
	const b: string = resolve(subject, runtime);
	const c: number = resolve(total, runtime);
	const t: string = resolve(title, runtime);
	const d: string = resolve(nextUrl, pagination);
	// @ts-expect-error 'next' does not exist on this body: N8nResolveError<...>
	const e: string = resolve(nextUrl, { ...pagination, response: { items: [] } });
	// @ts-expect-error $json.nothing is null
	const f: unknown[] = [resolve(nullable, runtime).x];
	// @ts-expect-error N8nResolveError: toUppercase is not on string
	const g: string = resolve(typo, runtime);
	// @ts-expect-error N8nInvalidExpression: $pageCount does not exist in nodeParameter, whatever the data
	const h: number = resolve(badGlobal, runtime);
	return [a, b, c, d, e, f, g, h, t];
};
