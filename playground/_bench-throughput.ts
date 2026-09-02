// Analyses the nodes-base corpus through createExpressionService under several shape regimes.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createExpressionService } from '@n8n/expression-types/service';
import { emptyShape, shapeFromValues, type RuntimeShape } from '@n8n/expression-types/globals';

const root = path.resolve(import.meta.dirname, '../packages/core');
const rows = JSON.parse(readFileSync('/tmp/bench-corpus.json', 'utf8')) as Array<{ text: string }>;
const texts = rows.map((r) => r.text);
const mb = (b: number) => Math.round(b / 1024 / 1024);
const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))];

const shapes: RuntimeShape[] = [
	emptyShape('routing'),
	emptyShape('nodeParameter'),
	emptyShape('description'),
	emptyShape('credential'),
	shapeFromValues({
		context: 'routing',
		credentials: { baseUrl: 'https://x', apiKey: 'k', user: { id: 1, roles: ['a'] } },
		value: 'abc',
		response: { body: { items: [{ id: 1, name: 'n' }], next: 'u' }, statusCode: 200 },
		input: { json: { a: 1, b: { c: 'd' } } },
	}),
];

const run = (label: string, pick: (i: number) => RuntimeShape, list = texts) => {
	const service = createExpressionService({ ts, root });
	global.gc?.();
	const rssBefore = process.memoryUsage().rss;
	const t0 = performance.now();
	service.analyze('={{ 1 }}', pick(0));
	const first = performance.now() - t0;
	const times: number[] = [];
	let errors = 0;
	const t1 = performance.now();
	for (let i = 0; i < list.length; i++) {
		const s = performance.now();
		const a = service.analyze(list[i], pick(i));
		times.push(performance.now() - s);
		if (a.blocks.some((b) => b.errors.length)) errors++;
	}
	const total = performance.now() - t1;
	const rssAfter = process.memoryUsage().rss;
	console.log(
		`${label.padEnd(34)} n=${list.length} first=${first.toFixed(0)}ms total=${total.toFixed(0)}ms mean=${(total / list.length).toFixed(2)}ms p50=${pct(times, 0.5).toFixed(2)}ms p95=${pct(times, 0.95).toFixed(2)}ms max=${pct(times, 1).toFixed(0)}ms rss=${mb(rssBefore)}->${mb(rssAfter)}MB withErrors=${errors}`,
	);
	return { total, times };
};

run('A same shape (routing)', () => shapes[0]);
run('A2 same shape (routing), 2nd pass', () => shapes[0]);
run('B alternate 5 shapes per call', (i) => shapes[i % 5]);
run('B2 alternate 2 shapes per call', (i) => shapes[i % 2]);
run('C 5 shapes grouped (4 switches)', (i) => shapes[Math.floor((i * 5) / texts.length)]);
run('D distinct texts only, same shape', () => shapes[0], [...new Set(texts)]);
// Pure globals-change cost: identical expression, shape flips every call.
run('E one text, 2 shapes flip', (i) => shapes[i % 2], Array(200).fill('={{ $parameter["operation"] }}'));
run('E2 one text, same shape (cache)', () => shapes[0], Array(200).fill('={{ $parameter["operation"] }}'));
