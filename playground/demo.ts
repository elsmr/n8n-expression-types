/**
 * n8n expressions as strings, checked by TypeScript. Five sections:
 *   1. Declare    expr() marks a string as an expression and names its context
 *   2. Contexts   what exists depends on where the expression runs
 *   3. Resolve    data enters through resolve() and Resolve<>; types become exact
 *   4. Language   anything TypeScript knows: methods, Luxon, n8n helpers, template literals
 *   5. Errors     invalid text, data that does not fit, n8n sandbox rules
 *
 * Try it: hover `$json` inside a block, hover `{{`, hover a variable name. Put the cursor on
 * `toUppercase` and open quick fixes. Type `$json.user.` for completions.
 *
 * The rest of the playground:
 *   - ./sample-data.ts      the data everything here resolves against ({@link sample},
 *                           {@link paginationSample}, {@link credentialSample})
 *   - ./node-description.ts a node definition with branded slots; the literals carry no markers
 *   - ./lambda.ts           expr() with a lambda instead of a string, no plugin involved
 *   - ./types.test.ts       type-level assertions, run by `pnpm typecheck`
 */
import { expr, resolve, type Resolve } from '@n8n/expression-types';
import { credentialSample, paginationSample, sample } from './sample-data.ts';

// 1. Declare. Nothing is known about the data yet, so $json is loose.
export const orderId = expr("={{ $('Webhook').item.json.body.orderId }}");
export const subject = expr('=Order {{ $json.n }} for {{ $json.user.name }}'); // text around blocks: always a string
export const total = expr('={{ $input.all().map((i) => i.json.n).sum() }}');
export const loose = expr('={{ $json.whatever.you.like.toTitleCase() }}'); // no error: $json can hold anything
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
export const badGlobal = expr('={{ $pageCount }}'); // InvalidExpr: not a node-parameter global

// 3. Resolve. The plugin checks each expression against the data; the type is exact for that pairing.
export const resolved = () => {
	const a = resolve(orderId, sample);
	const b: string = resolve(subject, sample);
	const c = resolve(total, sample);
	const d: string = resolve(multiline, sample);
	const e: string = resolve(nextUrl, paginationSample);
	const f: boolean = resolve(stop, paginationSample);
	const g: string = resolve(auth, credentialSample);
	return [a, b, c, d, e, f, g];
};
export type NextUrl = Resolve<typeof nextUrl, typeof paginationSample>; // string
export type OrderId = Resolve<typeof orderId, typeof sample>; // number
export type NoNext = Resolve<
	typeof nextUrl,
	{ context: 'httpPagination'; response: { items: number[] } }
>; // N8nResolveError

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
export const price = expr('={{ "$" + $json.n }}'); // a "$" in text is not the $ function
export const language = () => [
	resolve(title, sample),
	resolve(email, sample),
	resolve(when, sample),
	resolve(pick, sample),
	resolve(fallback, sample),
	resolve(card, sample),
	resolve(safe, sample),
	resolve(mime, sample),
	resolve(key, sample),
];

// 5. Errors. Invalid text is wrong anywhere; a resolve error is this data not fitting.
export const misspelt = expr('={{ $now.toISo() }}'); // wrong anywhere: $now is always a DateTime
export const typo = expr('={{ $json.test.toUppercase() }}'); // fine alone, fails against data
export const nullable = expr('={{ $json.nothing.x }}');
export const unsafe = expr('={{ $json.constructor.name + $.length }}'); // n8n sandbox rules
export const errors = () => {
	// @ts-expect-error N8nResolveError: toUppercase is not on string
	const a: string = resolve(typo, sample);
	// @ts-expect-error N8nResolveError: $json.nothing is null
	const b: unknown[] = [resolve(nullable, sample).x];
	// @ts-expect-error N8nInvalidExpression: $pageCount does not exist in this context, whatever the data
	const c: number = resolve(badGlobal, sample);
	// @ts-expect-error N8nResolveError: this body has no `next`
	const d: string = resolve(nextUrl, { ...paginationSample, response: { items: [] } });
	return [a, b, c, d];
};
