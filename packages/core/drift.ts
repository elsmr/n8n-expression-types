// Diffs the globals n8n-workflow's proxy exposes against what the layers declare.
// Reads the dist source statically; exits 1 when n8n has a key we do not declare.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { EXPRESSION_CONTEXTS, declaredNames } from './globals.ts';

const require = createRequire(import.meta.url);
const dist = require.resolve('n8n-workflow/dist/cjs/workflow-data-proxy.js');
const proxyKeys = [...readFileSync(dist, 'utf8').matchAll(/^\s+(\$[A-Za-z]+)(?::|\()/gm)].map((m) => m[1]);
const interfaces = readFileSync(require.resolve('n8n-workflow/dist/cjs/interfaces.d.ts'), 'utf8');
const start = interfaces.indexOf('interface IWorkflowDataProxyAdditionalKeys');
const end = interfaces.indexOf('\nexport ', start);
const additional = [...interfaces.slice(start, end).matchAll(/^\s+(\$\w+)\??:/gm)].map((m) => m[1]);

const n8n = new Set([...proxyKeys, ...additional]);
const ours = new Set(EXPRESSION_CONTEXTS.flatMap(declaredNames));
// Declared by extensions.d.ts, not the layers.
for (const k of ['$if', '$ifEmpty', '$min', '$max', '$average', '$not']) ours.add(k);

const missing = [...n8n].filter((k) => !ours.has(k)).sort();
const extra = [...ours].filter((k) => !n8n.has(k)).sort();
console.log(`n8n-workflow keys: ${n8n.size}, declared: ${ours.size}`);
if (extra.length) console.log(`declared but not in n8n-workflow (context-specific or renamed?): ${extra.join(' ')}`);
if (missing.length) {
	console.error(`n8n-workflow has globals the layers do not declare: ${missing.join(' ')}`);
	process.exit(1);
}
console.log('no drift');
