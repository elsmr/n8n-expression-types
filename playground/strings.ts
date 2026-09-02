// String form. Types come from n8n-resolved.d.ts, written by the plugin while you
// type (or by `pnpm gen-resolved`). Hover the `=` strings for block types.
import { resolve } from '../resolve.ts';
import { runtime } from './runtime.ts';

const orderId = resolve("={{ $('Webhook').item.json.body.orderId }}", runtime);
const subject = resolve('=Order {{ $json.n }} for {{ $json.user.name }}', runtime);
const total = resolve('={{ $input.all().map((i) => i.json.n).sum() }}', runtime);
const nextMonth = resolve('={{ $now.plus({ days: 1 }).beginningOf("month").format("yyyy-MM") }}', runtime);
const flag = resolve('={{ $if($json.n > 1, $json.test, $json.n) }}', runtime);
const fileName = resolve("={{ $('Edit Fields').first().binary.invoice.fileName }}", runtime);

// invalid: the resolved type is N8nInvalidExpression<...>, so using it fails
const typo = resolve('={{ $json.test.toUppercase() }}', runtime);
const nullable = resolve('={{ $json.nothing.x }}', runtime);
const unknownVar = resolve('={{ $vars.nope }}', runtime);

export const check: [number, string, number, string, string | number, string | undefined] = [
	orderId,
	subject,
	total,
	nextMonth,
	flag,
	fileName,
];
// @ts-expect-error invalid expression
export const broken: string = typo;
// @ts-expect-error invalid expression
export const broken2: unknown[] = [nullable.x];
// @ts-expect-error invalid expression
export const broken3: string = unknownVar;

// Plain literals outside resolve() are analysed against runtime.json by the plugin only.
export const plain = "=Hi {{ $json.user.name }}, {{ $json.test.toTitleCase() }}";
