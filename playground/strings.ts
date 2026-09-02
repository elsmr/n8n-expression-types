// String form. expr() marks the literal and names the context. Data only enters through
// resolve(); the plugin (or `pnpm gen-resolved`) writes n8n-resolved.d.ts so the types
// flow: strict where a resolve() exists for the expression, loose otherwise.
import { expr, resolve, type Resolve } from 'n8n-expression-types';
import { pagination, runtime } from './runtime.ts';

// No shape: runtime data is loose, so anything under $json typechecks. Globals still do.
export const loose = expr('={{ $json.whatever.you.like.toTitleCase() }}');        // any
export const badGlobal = expr('={{ $pageCount }}');                                  // error: not in nodeParameter
export const paged = expr.httpPagination('={{ $response.body.next ?? $request.url }}'); // string, body loose

// Declared without data. Their types come from the resolve() calls below.
export const orderId = expr("={{ $('Webhook').item.json.body.orderId }}");          // number, via resolve(orderId, runtime)
export const subject = expr('=Order {{ $json.n }} for {{ $json.user.name }}');      // string
export const total = expr('={{ $input.all().map((i) => i.json.n).sum() }}');        // number
export const nextUrl = expr.httpPagination('={{ $response.body.next }}');           // string
export const typo = expr('={{ $json.test.toUppercase() }}');                        // N8nInvalidExpression<...>
export const nullable = expr('={{ $json.nothing.x }}');                              // N8nInvalidExpression<...>
export const unused = expr('={{ $json.n * 2 }}');                                    // any: never resolved, $json loose

// Type only: check an expression against data without evaluating it.
export type NextUrl = Resolve<typeof nextUrl, typeof pagination>;                      // string
export type NoNext = Resolve<typeof nextUrl, { context: 'httpPagination'; response: { items: number[] } }>; // plugin: 'next' does not exist
export type Subject = Resolve<typeof subject, typeof runtime>;                          // string

// Evaluation: data enters here. The plugin checks each expression against it.
export const check = () => {
	const a: number = resolve(orderId, runtime);
	const b: string = resolve(subject, runtime);
	const c: number = resolve(total, runtime);
	const d: string = resolve(nextUrl, pagination);
	const e = resolve(nextUrl, { ...pagination, response: { items: [] } });   // plugin: 'next' does not exist on body
	resolve(nullable, runtime);
	// @ts-expect-error invalid expression cannot be used
	const f: string = resolve(typo, runtime);
	return [a, b, c, d, e, f];
};
