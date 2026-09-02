// String form. expr() marks the literal and names the context; the plugin (or
// `pnpm gen-resolved`) writes n8n-resolved.d.ts so the types flow through the checker.
import { expr, resolve } from 'n8n-expression-types';
import { pagination, runtime } from './runtime.ts';

// No shape: runtime data is loose, so anything under $json typechecks. Globals still do.
export const loose = expr('={{ $json.whatever.you.like.toTitleCase() }}');        // any
export const badGlobal = expr('={{ $pageCount }}');                                  // error: not in nodeParameter
export const paged = expr.httpPagination('={{ $response.body.next ?? $request.url }}'); // string, body loose

// With a runtime: strict against the sample's shape.
export const orderId = expr("={{ $('Webhook').item.json.body.orderId }}", runtime);          // number
export const subject = expr('=Order {{ $json.n }} for {{ $json.user.name }}', runtime);      // string
export const total = expr('={{ $input.all().map((i) => i.json.n).sum() }}', runtime);        // number
export const nextUrl = expr.httpPagination('={{ $response.body.next }}', pagination);        // string
export const typo = expr('={{ $json.test.toUppercase() }}', runtime);                        // N8nInvalidExpression<...>
export const nullable = expr('={{ $json.nothing.x }}', runtime);                              // N8nInvalidExpression<...>

// Evaluation: the plugin re-checks the expression against the data passed here.
export const check = () => {
	const a: number = resolve(orderId, runtime);
	const b: string = resolve(nextUrl, pagination);
	const c = resolve(nextUrl, { ...pagination, response: { items: [] } });   // plugin: 'next' does not exist on body
	// @ts-expect-error invalid expression cannot be used
	const d: string = resolve(typo, runtime);
	return [a, b, c, d];
};
