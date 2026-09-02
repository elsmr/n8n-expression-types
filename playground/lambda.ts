// Lambda form, for logic that outgrows a string: expr() takes a lambda over the context and
// TypeScript checks the body directly, no plugin involved. Same contexts as the string form.
// Runtime data is loose here (no sample to type it), so $json.anything passes; wrong
// globals, wrong contexts and typos on known types still fail. resolve() returns the type
// the lambda yields; it cannot re-check the body against data.
import { expr, resolve } from '@n8n/expression-types';
import { paginationSample, sample } from './sample-data.ts';

export const orderId = expr(({ $ }) => $('Webhook').item.json.body.orderId);
export const subject = expr(({ $json }) => `Order ${$json.n} for ${$json.user.name}`);
export const total = expr(({ $input }) =>
	$input
		.all()
		.map((i) => i.json.n)
		.sum(),
);
export const nextMonth = expr(({ $now }) =>
	$now.plus({ days: 1 }).beginningOf('month').format('yyyy-MM'),
);
export const flag = expr(({ $if, $json }) => $if($json.n > 1, $json.test, $json.n));
export const email = expr(({ $json }) => $json.user.emails.first().isEmail());
export const method = expr(({ $ }) => $('Webhook').params.httpMethod);
export const key = expr(({ $vars }) => $vars.apiKey);
export const nextUrl = expr.httpPagination(({ $response }) => $response.body.next);
export const stop = expr.httpPagination(({ $pageCount }) => $pageCount >= 10);

// @ts-expect-error toISo does not exist on DateTime
export const misspelt = expr(({ $now }) => $now.toISo());
// @ts-expect-error $pageCount exists in the pagination context only
export const wrongContext = expr(({ $pageCount }) => $pageCount);

export const resolved = () => {
	const a: boolean = resolve(stop, paginationSample);
	const b: string = resolve(nextMonth, sample);
	return [a, b];
};

console.log(orderId, subject, total); // ={{ $('Webhook').item.json.body.orderId }} ...
