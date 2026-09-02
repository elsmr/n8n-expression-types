// Generated from expr() calls. Do not edit.
declare global {
	interface N8nResolvedTypes {
		"httpPagination::={{ $response.body.next ?? $request.url }}": any;
		"httpPagination::={{ $response.body.next }}": string;
		"nodeParameter::={{ $('Webhook').item.json.body.orderId }}": number;
		"nodeParameter::={{ $input.all().map((i) => i.json.n).sum() }}": number;
		"nodeParameter::={{ $json.nothing.x }}": N8nInvalidExpression<"'$json.nothing' is possibly 'null'.">;
		"nodeParameter::={{ $json.test.toUppercase() }}": N8nInvalidExpression<"Property 'toUppercase' does not exist on type 'string'. Did you mean 'toUpperCase'?">;
		"nodeParameter::={{ $json.whatever.you.like.toTitleCase() }}": any;
		"nodeParameter::={{ $pageCount }}": N8nInvalidExpression<"Cannot find name '$pageCount'.">;
		"nodeParameter::=Order {{ $json.n }} for {{ $json.user.name }}": string;
	}
}
export {};
