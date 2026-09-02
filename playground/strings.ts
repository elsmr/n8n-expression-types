// String form. expr() marks the literal and names the context. Data only enters through
// resolve(); the plugin (or `pnpm gen-resolved`) writes n8n-resolved.d.ts so the types
// flow: strict where a resolve() exists for the expression, loose otherwise.
import { expr, resolve, type Resolve } from 'n8n-expression-types';
import { pagination, runtime } from './runtime.ts';

// No shape: runtime data is loose, so anything under $json typechecks. Globals still do.
export const loose = expr('={{ $json.whatever.you.like.toTitleCase() }}');        // any
export const badGlobal = expr('={{ $pageCount }}');                                  // error: not in nodeParameter
export const paged = expr.httpPagination('={{ $response.body.next ?? $request.url }}'); // string, body loose

// Declared without data: definition-time types, runtime holes loose.
export const orderId = expr("={{ $('Webhook').item.json.body.orderId }}");          // Expression<any>
export const subject = expr('=Order {{ $json.n }} for {{ $json.user.name }}');      // Expression<string>: text around blocks
export const total = expr('={{ $input.all().map((i) => i.json.n).sum() }}');        // Expression<any>
export const nextUrl = expr.httpPagination('={{ $response.body.next }}');           // Expression<any, 'httpPagination'>
export const typo = expr('={{ $json.test.toUppercase() }}');                        // Expression<any>: $json.test is loose here
export const nullable = expr('={{ $json.nothing.x }}');                              // Expression<any>
export const stamp = expr('={{ $now.toISO() }}');                                    // Expression<string | null>: no runtime hole

// Type only: the type an expression yields against specific data, without evaluating.
export type NextUrl = Resolve<typeof nextUrl, typeof pagination>;                      // string
export type NoNext = Resolve<typeof nextUrl, { context: 'httpPagination'; response: { items: number[] } }>; // N8nInvalidExpression<"Property 'next' does not exist ...">
export type Subject = Resolve<typeof subject, typeof runtime>;                          // string
export type OrderId = Resolve<typeof orderId, typeof runtime>;                          // number

// Evaluation: data enters here. The plugin checks each expression against it.
export const check = () => {
	const a = resolve(orderId, runtime);
	const b: string = resolve(subject, runtime);
	const c: number = resolve(total, runtime);
	const d: string = resolve(nextUrl, pagination);
	// @ts-expect-error 'next' does not exist on this body: N8nInvalidExpression<...>
	const e: string = resolve(nextUrl, { ...pagination, response: { items: [] } });
	// @ts-expect-error $json.nothing is null
	const f: unknown[] = [resolve(nullable, runtime).x];
	// @ts-expect-error invalid expression cannot be used
	const g: string = resolve(typo, runtime);
	return [a, b, c, d, e, f, g];
};
