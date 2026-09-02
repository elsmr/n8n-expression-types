// n8n expressions as strings, checked by TypeScript.
//   1. Declare    expr() marks a string as an expression and names its context
//   2. Contexts   what exists depends on where the expression runs
//   3. Resolve    data enters through resolve() and Resolve<>; types become exact
//   4. Language   anything TypeScript knows: methods, Luxon, n8n helpers, template literals
//   5. Errors     invalid text, data that does not fit, n8n sandbox rules
import { expr, resolve, type Resolve } from '@n8n/expression-types';
import { credentialData, pagination, runtime } from './runtime.ts';

// 1. Declare. Nothing is known about the data yet, so $json is loose.
export const orderId = expr("={{ $('Webhook').item.json.body.orderId }}");
export const subject = expr('=Order {{ $json.n }} for {{ $json.user.name }}');   // text around blocks: always a string
export const total = expr('={{ $input.all().map((i) => i.json.n).sum() }}');
export const loose = expr('={{ $json.whatever.you.like.toTitleCase() }}');      // no error: $json can hold anything
export const multiline = expr(`={{
	$json.tags
		.filter((t) => t !== 'b')
		.join(', ')
}}`);

// 2. Contexts. Globals differ per context; hover $response, $pageCount, $self, $parameter.
export const nextUrl = expr.httpPagination('={{ $response.body.next }}');
export const stop = expr.httpPagination('={{ $pageCount >= 10 }}');
export const auth = expr.credential('={{ "Bearer " + $self.apiKey }}');
export const label = expr.description('={{ $parameter.operation }}');
export const badGlobal = expr('={{ $pageCount }}');                              // InvalidExpr: not a node-parameter global

// 3. Resolve. The plugin checks each expression against the data; the type is exact for that pairing.
export const resolved = () => {
	const a: number = resolve(orderId, runtime);
	const b: string = resolve(subject, runtime);
	const c: number = resolve(total, runtime);
	const d: string = resolve(multiline, runtime);
	const e: string = resolve(nextUrl, pagination);
	const f: boolean = resolve(stop, pagination);
	const g: string = resolve(auth, credentialData);
	return [a, b, c, d, e, f, g];
};
export type NextUrl = Resolve<typeof nextUrl, typeof pagination>;                // string
export type OrderId = Resolve<typeof orderId, typeof runtime>;                  // number
export type NoNext = Resolve<typeof nextUrl, { context: 'httpPagination'; response: { items: number[] } }>; // N8nResolveError

// 4. Language. Hover for TypeScript's own quick info; n8n methods carry their docs.
export const title = expr('={{ $json.test.toTitleCase() }}');
export const email = expr('={{ $json.user.emails.first().isEmail() }}');
export const when = expr('={{ $now.plus({ days: 1 }).beginningOf("month").format("yyyy-MM") }}');
export const pick = expr('={{ $if($json.n > 1, $json.test, $json.n) }}');
export const fallback = expr('={{ $ifEmpty($json.nothing, "n/a") }}');
export const card = expr('={{ `${$json.user.name} <${$json.user.emails[0]}>` }}');
export const safe = expr('={{ $json.user?.emails?.[0] ?? "none" }}');
export const mime = expr('={{ $binary.data.mimeType }}');
export const key = expr('={{ $vars.apiKey }}');
export const language = () => [
	resolve(title, runtime),
	resolve(email, runtime),
	resolve(when, runtime),
	resolve(pick, runtime),
	resolve(fallback, runtime),
	resolve(card, runtime),
	resolve(safe, runtime),
	resolve(mime, runtime),
	resolve(key, runtime),
];

// 5. Errors. Invalid text is wrong anywhere; a resolve error is this data not fitting.
export const typo = expr('={{ $json.test.toUppercase() }}');                    // fine alone, fails against data
export const nullable = expr('={{ $json.nothing.x }}');
export const unsafe = expr('={{ $json.constructor.name + $.length }}');          // n8n sandbox rules
export const errors = () => {
	// @ts-expect-error N8nResolveError: toUppercase is not on string
	const a: string = resolve(typo, runtime);
	// @ts-expect-error N8nResolveError: $json.nothing is null
	const b: unknown[] = [resolve(nullable, runtime).x];
	// @ts-expect-error N8nInvalidExpression: $pageCount does not exist in this context, whatever the data
	const c: number = resolve(badGlobal, runtime);
	// @ts-expect-error N8nResolveError: this body has no `next`
	const d: string = resolve(nextUrl, { ...pagination, response: { items: [] } });
	return [a, b, c, d];
};
