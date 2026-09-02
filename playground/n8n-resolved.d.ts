// Generated from resolve() calls. Do not edit.
declare global {
	interface N8nResolvedTypes {
		"={{ $('Edit Fields').first().binary.invoice.fileName }}": string | undefined;
		"={{ $('Webhook').item.json.body.orderId }}": number;
		"={{ $if($json.n > 1, $json.test, $json.n) }}": string | number;
		"={{ $input.all().map((i) => i.json.n).sum() }}": number;
		"={{ $json.nothing.x }}": N8nInvalidExpression<"'$json.nothing' is possibly 'null'.">;
		"={{ $json.test.toUppercase() }}": N8nInvalidExpression<"Property 'toUppercase' does not exist on type 'string'. Did you mean 'toUpperCase'?">;
		"={{ $now.plus({ days: 1 }).beginningOf(\"month\").format(\"yyyy-MM\") }}": string;
		"={{ $vars.nope }}": N8nInvalidExpression<"Property 'nope' does not exist on type '{ apiKey: string; region: string; }'.">;
		"=Order {{ $json.n }} for {{ $json.user.name }}": string;
	}
}
export {};
