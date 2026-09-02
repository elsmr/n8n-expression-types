// Lambda form. No generator involved: the checker types the body directly.
import { expression } from '@n8n/expression-types/context';
import { sample } from './sample-data.ts';

export const orderId = expression(({ $ }) => $('Webhook').item.json.body.orderId, sample);
export const subject = expression(({ $json }) => `Order ${$json.n} for ${$json.user.name}`, sample);
export const total = expression(
	({ $input }) =>
		$input
			.all()
			.map((i) => i.json.n)
			.sum(),
	sample,
);
export const nextMonth = expression(
	({ $now }) => $now.plus({ days: 1 }).beginningOf('month').format('yyyy-MM'),
	sample,
);
export const flag = expression(({ $if, $json }) => $if($json.n > 1, $json.test, $json.n), sample);
export const email = expression(({ $json }) => $json.user.emails.first().isEmail(), sample);
export const method = expression(({ $ }) => $('Webhook').params.httpMethod, sample);
export const key = expression(({ $vars }) => $vars.apiKey, sample);

// @ts-expect-error toUppercase does not exist on string
export const typo = expression(({ $json }) => $json.test.toUppercase(), sample);
// @ts-expect-error $json.nothing is null
export const nullable = expression(({ $json }) => $json.nothing.x, sample);
// @ts-expect-error nope is not a known variable
export const unknownVar = expression(({ $vars }) => $vars.nope, sample);

console.log(orderId, subject);
