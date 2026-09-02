import { analyze, completionsAt, globalsFor, type RuntimeTypes } from './service.ts';

// Runtime shapes normally come from the execution data of the previous run
// (the same source editor-ui's dynamicTypes.ts reads). Here they are inline.
const runtime: RuntimeTypes = {
	input: {
		json: { test: 'hello', n: 3, tags: ['a', 'b'], user: { name: 'Ada', emails: ['ada@example.com'] }, nothing: null },
		binaryKeys: ['data'],
	},
	nodes: {
		Webhook: {
			json: { headers: { host: 'x' }, body: { orderId: 42 } },
			params: { path: 'orders', httpMethod: 'POST' },
		},
		'Edit Fields': { json: { total: 9.5 }, binaryKeys: ['invoice'] },
	},
	parameters: { url: 'https://example.com', options: { timeout: 3000 } },
	vars: ['apiKey', 'region'],
};

const show = (expression: string) => {
	const a = analyze(expression, runtime);
	console.log(`\n${expression}\n  => ${a.type}`);
	for (const b of a.blocks) {
		console.log(`  {{${b.body}}} : ${b.type}${b.errors.length ? `\n    ! ${b.errors.join('\n    ! ')}` : ''}`);
	}
};

const complete = (expression: string, marker = '|') => {
	const offset = expression.indexOf(marker);
	const expr = expression.replace(marker, '');
	const names = completionsAt(expr, offset, runtime);
	console.log(`\n${expression}\n  -> ${names.slice(0, 14).join(', ')}${names.length > 14 ? ', ...' : ''}`);
};

console.log('--- injected runtime types ---');
show('={{ $json.user.emails.first().isEmail() }}');
show('={{ $binary.data.mimeType }}');
show("={{ $('Webhook').item.json.body.orderId }}");
show("={{ $('Webhook').params.httpMethod }}");
show("={{ $('Edit Fields').first().binary.invoice.fileName }}");
show("={{ $('Unknown node').item.json.whatever }}");
show('={{ $input.all().map((i) => i.json.n).sum() }}');
show('={{ $parameter.options.timeout }}');
show('={{ $vars.apiKey }}');
show('={{ $vars.nope }}');

console.log('\n--- extension methods (from n8n-workflow doc metadata) ---');
show('={{ $json.test.toTitleCase().toSnakeCase() }}');
show('={{ $json.tags.randomItem() }}');
show('={{ $json.n.round(1).toBoolean() }}');
show('={{ $now.plus({ days: 1 }).beginningOf("month").format("yyyy-MM") }}');
show('={{ $json.user.keys() }}');
show('={{ $if($json.n > 1, $json.test, $json.n) }}');
show('={{ $max(1, $json.n) }}');
show('={{ $ifEmpty($json.nothing, "fallback") }}');

console.log('\n--- shape rules and errors ---');
show('=Order {{ $("Webhook").item.json.body.orderId }} for {{ $json.user.name }}');
show('={{ $json.test.toUppercase() }}');
show('={{ $json.nothing.x }}');
show('={{ $execution.mode === "prod" }}');

console.log('\n--- completions ---');
complete('={{ $json.test.| }}');
complete("={{ $('Webhook').item.json.| }}");
complete('={{ $vars.| }}');
complete('={{ $now.| }}');
complete('={{ $| }}');

if (process.argv.includes('--globals')) console.log(globalsFor(runtime));
