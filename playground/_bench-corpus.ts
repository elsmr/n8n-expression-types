// Extracts `={{` string literals from nodes-base (nodes + credentials) into /tmp/bench-corpus.json.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const NB = '/Users/elias/projects/github/n8n-io/n8n.review/packages/nodes-base';
const walk = (dir: string): string[] =>
	readdirSync(dir).flatMap((f) => {
		const p = path.join(dir, f);
		return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
	});

const files = [...walk(`${NB}/nodes`), ...walk(`${NB}/credentials`)];
type Row = { file: string; pos: number; quote: 'single' | 'double' | 'backtick'; text: string };
const rows: Row[] = [];
let skippedTemplates = 0;
const t0 = performance.now();
for (const file of files) {
	const src = readFileSync(file, 'utf8');
	if (!src.includes('={{')) continue;
	const sf = ts.createSourceFile(file, src, ts.ScriptTarget.ES2022, false);
	const visit = (n: ts.Node) => {
		if (ts.isTemplateExpression(n) && n.head.text.startsWith('={{')) skippedTemplates++;
		if (ts.isStringLiteralLike(n) && n.text.startsWith('={{')) {
			const raw = src[n.getStart(sf)];
			rows.push({ file: path.relative(NB, file), pos: n.getStart(sf), quote: raw === "'" ? 'single' : raw === '"' ? 'double' : 'backtick', text: n.text });
		}
		ts.forEachChild(n, visit);
	};
	visit(sf);
}
const ms = performance.now() - t0;
const count = (re: RegExp) => rows.filter((r) => re.test(r.text)).length;
const by = Object.fromEntries((['single', 'double', 'backtick'] as const).map((q) => [q, rows.filter((r) => r.quote === q).length]));
const filesWith = new Set(rows.map((r) => r.file)).size;
const lens = rows.map((r) => r.text.length).sort((a, b) => a - b);
const stats = {
	files: files.length,
	filesWithExpressions: filesWith,
	expressions: rows.length,
	distinctTexts: new Set(rows.map((r) => r.text)).size,
	byQuote: by,
	skippedTemplatesWithSubstitutions: skippedTemplates,
	uses: {
		$parameter: count(/\$parameter\b/),
		$credentials: count(/\$credentials\b/),
		$value: count(/\$value\b/),
		$json: count(/\$json\b/),
		$response: count(/\$response\b/),
		$request: count(/\$request\b/),
		$responseItem: count(/\$responseItem\b/),
		$self: count(/\$self\b/),
		$now: count(/\$now\b/),
		$input: count(/\$input\b/),
		$node_call: count(/\$\(/),
	},
	textLength: { p50: lens[Math.floor(lens.length * 0.5)], p95: lens[Math.floor(lens.length * 0.95)], max: lens[lens.length - 1] },
	blocksPerExpression: { max: Math.max(...rows.map((r) => (r.text.match(/\{\{/g) ?? []).length)) },
	extractMs: Math.round(ms),
};
console.log(JSON.stringify(stats, null, 2));
writeFileSync('/tmp/bench-corpus.json', JSON.stringify(rows));
