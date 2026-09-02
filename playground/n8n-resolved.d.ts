// Generated from expr() and resolve() sites. Do not edit.
declare global {
	interface N8nResolvedTypes {
		"credential::={{ \"Bearer \" + $self.apiKey }}": { loose: string; strict: [[any, string]] };
		"description::={{ $parameter.operation }}": { loose: any; strict: [] };
		"httpPagination::={{ $pageCount >= 10 }}": { loose: boolean; strict: [[any, boolean]] };
		"httpPagination::={{ $response.body.next }}": { loose: any; strict: [[any, any], [{ context: "httpPagination"; response: { items: number[]; }; }, N8nResolveError]] };
		"nodeParameter::={{\n\t$json.tags\n\t\t.filter((t) => t !== 'b')\n\t\t.join(', ')\n}}": { loose: any; strict: [[any, any]] };
		"nodeParameter::={{ `${$json.user.name} <${$json.user.emails[0]}>` }}": { loose: N8nInvalidExpression; strict: [[any, N8nInvalidExpression]] };
		"nodeParameter::={{ $('Webhook').item.json.body.orderId }}": { loose: any; strict: [[any, any]] };
		"nodeParameter::={{ $binary.data.mimeType }}": { loose: string; strict: [[any, string]] };
		"nodeParameter::={{ $if($json.n > 1, $json.test, $json.n) }}": { loose: any; strict: [[any, any]] };
		"nodeParameter::={{ $ifEmpty($json.nothing, \"n/a\") }}": { loose: any; strict: [[any, any]] };
		"nodeParameter::={{ $input.all().map((i) => i.json.n).sum() }}": { loose: number; strict: [[any, number]] };
		"nodeParameter::={{ $json.constructor.name + $.length }}": { loose: N8nInvalidExpression; strict: [] };
		"nodeParameter::={{ $json.nothing.x }}": { loose: any; strict: [[any, any]] };
		"nodeParameter::={{ $json.test.toTitleCase() }}": { loose: any; strict: [[any, any]] };
		"nodeParameter::={{ $json.test.toUppercase() }}": { loose: any; strict: [[any, any]] };
		"nodeParameter::={{ $json.user?.emails?.[0] ?? \"none\" }}": { loose: any; strict: [[any, any]] };
		"nodeParameter::={{ $json.user.emails.first().isEmail() }}": { loose: any; strict: [[any, any]] };
		"nodeParameter::={{ $json.whatever.you.like.toTitleCase() }}": { loose: any; strict: [] };
		"nodeParameter::={{ $now.plus({ days: 1 }).beginningOf(\"month\").format(\"yyyy-MM\") }}": { loose: string; strict: [[any, string]] };
		"nodeParameter::={{ $pageCount }}": { loose: N8nInvalidExpression; strict: [[any, N8nInvalidExpression]] };
		"nodeParameter::={{ $vars.apiKey }}": { loose: string; strict: [[any, string]] };
		"nodeParameter::=Order {{ $json.n }} for {{ $json.user.name }}": { loose: string; strict: [[any, string]] };
	}
}
export {};
