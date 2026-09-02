import ts from 'typescript';
import { createExpressionService } from './service.ts';
import { runtime } from './example-runtime.ts';
import { shapeFromValues } from './globals.ts';

const shape = shapeFromValues(runtime);

const { analyze, completionsAt, globalsFor } = createExpressionService({ ts, root: import.meta.dirname });

const show = (expression: string) => {
	const a = analyze(expression, shape);
	console.log(`\n${expression}\n  => ${a.type}`);
	for (const b of a.blocks) {
		const errors = b.errors.map((e) => `\n    ! ${e.message}`).join('');
		console.log(`  {{${b.body}}} : ${b.type}${errors}`);
	}
};

const complete = (expression: string, marker = '|') => {
	const offset = expression.indexOf(marker);
	const expr = expression.replace(marker, '');
	const names = completionsAt(expr, offset, shape).map((e) => e.name);
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

console.log('\n--- extension methods (extensions.d.ts) ---');
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

if (process.argv.includes('--globals')) console.log(globalsFor(shape));
