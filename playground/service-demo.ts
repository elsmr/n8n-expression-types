// The service API on its own, no editor: per-block types, errors, completions, contexts.
// Run: pnpm demo
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
import { emptyShape, shapeFromValues } from '@n8n/expression-types';
import { createExpressionService } from '@n8n/expression-types/service';
import { runtime } from './runtime.ts';

const root = path.dirname(createRequire(import.meta.url).resolve('@n8n/expression-types/service'));
const { analyze, completionsAt } = createExpressionService({ ts, root });
const shape = shapeFromValues(runtime);

const show = (expression: string, s = shape) => {
	const a = analyze(expression, s);
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

console.log('--- against a runtime sample ---');
show('={{ $json.user.emails.first().isEmail() }}');
show("={{ $('Webhook').item.json.body.orderId }}");
show("={{ $('Edit Fields').first().binary.invoice.fileName }}");
show('={{ $input.all().map((i) => i.json.n).sum() }}');
show('={{ $now.plus({ days: 1 }).beginningOf("month").format("yyyy-MM") }}');
show('={{ $if($json.n > 1, $json.test, $json.n) }}');
show('=Order {{ $("Webhook").item.json.body.orderId }} for {{ $json.user.name }}');
show('={{ $json.test.toUppercase() }}');
show('={{ $json.nothing.x }}');
show('={{ $vars.nope }}');

console.log('\n--- contexts, no sample: runtime holes are loose, globals are not ---');
show("={{ $credentials.baseUrl + '/' + $value }}", emptyShape('routing'));
show('={{ $response.body.next ?? $request.url }}', emptyShape('httpPagination'));
show('={{ $pageCount }}', emptyShape('nodeParameter'));
show('={{ $json.anything.goes().here }}', emptyShape('nodeParameter'));
show('={{ $json.id }}', emptyShape('credential'));

console.log('\n--- completions ---');
complete('={{ $json.test.| }}');
complete("={{ $('Webhook').item.json.| }}");
complete('={{ $now.| }}');
complete('={{ $| }}');
