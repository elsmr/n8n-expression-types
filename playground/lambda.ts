// Lambda form. No generator involved: the checker types the body directly.
import { expression } from '../context.ts';
import { runtime } from './runtime.ts';

export const orderId = expression(({ $ }) => $('Webhook').item.json.body.orderId, runtime);
export const subject = expression(({ $json }) => `Order ${$json.n} for ${$json.user.name}`, runtime);
export const total = expression(({ $input }) => $input.all().map((i) => i.json.n).sum(), runtime);
export const nextMonth = expression(({ $now }) => $now.plus({ days: 1 }).beginningOf('month').format('yyyy-MM'), runtime);
export const flag = expression(({ $if, $json }) => $if($json.n > 1, $json.test, $json.n), runtime);
export const email = expression(({ $json }) => $json.user.emails.first().isEmail(), runtime);
export const method = expression(({ $ }) => $('Webhook').params.httpMethod, runtime);
export const key = expression(({ $vars }) => $vars.apiKey, runtime);

// @ts-expect-error toUppercase does not exist on string
export const typo = expression(({ $json }) => $json.test.toUppercase(), runtime);
// @ts-expect-error $json.nothing is null
export const nullable = expression(({ $json }) => $json.nothing.x, runtime);
// @ts-expect-error nope is not a known variable
export const unknownVar = expression(({ $vars }) => $vars.nope, runtime);

console.log(orderId, subject);
