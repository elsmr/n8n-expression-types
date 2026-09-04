// Drives the real tsserver binary with the plugin loaded: the plain language-service test
// cannot see failures that only happen inside a tsserver project. Run: pnpm test
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '../../..');
const playground = path.join(root, 'playground');
const file = path.join(playground, 'demo.ts');
const tsserver = path.join(
	path.dirname(createRequire(import.meta.url).resolve('typescript')),
	'tsserver.js',
);
const logFile = path.join(root, 'node_modules/.tsserver-test.log');

const srv = spawn(
	process.execPath,
	[
		tsserver,
		'--globalPlugins',
		'@n8n/expression-ts-plugin',
		'--pluginProbeLocations',
		playground,
		'--logVerbosity',
		'normal',
		'--logFile',
		logFile,
	],
	{
		stdio: ['pipe', 'pipe', 'inherit'],
	},
);
let seq = 0;
const pending = new Map<number, (msg: any) => void>();
const events: any[] = [];
const request = (command: string, args: unknown) =>
	new Promise<any>((resolve) => {
		pending.set(++seq, resolve);
		srv.stdin.write(JSON.stringify({ seq, type: 'request', command, arguments: args }) + '\n');
	});
let buf = '';
srv.stdout.on('data', (d) => {
	buf += d;
	for (;;) {
		const i = buf.indexOf('\r\n\r\n');
		if (i === -1) return;
		const len = Number(/Content-Length: (\d+)/.exec(buf.slice(0, i))![1]);
		if (buf.length < i + 4 + len) return;
		const msg = JSON.parse(buf.slice(i + 4, i + 4 + len));
		buf = buf.slice(i + 4 + len);
		if (msg.type === 'response') pending.get(msg.request_seq)?.(msg);
		else events.push(msg);
	}
});
const until = (pred: (e: any) => boolean, ms = 8000) =>
	new Promise<any>((resolve, reject) => {
		const t0 = Date.now();
		const tick = () => {
			const e = events.find(pred);
			if (e) return resolve(e);
			if (Date.now() - t0 > ms) return reject(new Error('timeout waiting for event'));
			setTimeout(tick, 50);
		};
		tick();
	});

const text = readFileSync(file, 'utf8');
const pos = (needle: string, delta = 0) => {
	const i = text.indexOf(needle) + delta;
	const before = text.slice(0, i);
	return { line: before.split('\n').length, offset: i - before.lastIndexOf('\n') };
};

try {
	const opened = await request('open', { file });
	assert.notEqual(opened.success, false, `open failed: ${opened.message}`);

	const plain = await request('quickinfo', { file, ...pos('const orderId', 'const '.length + 2) });
	assert.equal(plain.success, true, `plain hover failed: ${plain.message}`);
	assert.match(plain.body.displayString, /Expr<NodeParameterContext/);
	console.log('ok  tsserver: TypeScript hover works with the plugin loaded');

	const inBlock = await request('quickinfo', { file, ...pos('$json.n }} for', 2) });
	assert.equal(inBlock.success, true, `block hover failed: ${inBlock.message}`);
	assert.match(inBlock.body.displayString, /const \$json:/);
	console.log('ok  tsserver: hover inside a block is forwarded');

	// Cursor mid-word: `$js|on.n`. tsserver turns the span into a line/offset of the real file,
	// so an unmapped virtual-file span lands on another line and VS Code drops every item.
	const partial = pos('$json.n }} for', 3);
	const completions = await request('completionInfo', { file, ...partial });
	assert.equal(completions.success, true, `completion failed: ${completions.message}`);
	assert.ok(
		completions.body.entries.some((e: any) => e.name === '$json'),
		'$json missing from completions',
	);
	assert.deepEqual(completions.body.optionalReplacementSpan, {
		start: { line: partial.line, offset: partial.offset - 3 },
		end: { line: partial.line, offset: partial.offset + 2 },
	});
	console.log('ok  tsserver: completion spans inside a block are mapped back to the file');

	// geterr answers with events only, no response.
	srv.stdin.write(
		JSON.stringify({
			seq: ++seq,
			type: 'request',
			command: 'geterr',
			arguments: { files: [file], delay: 0 },
		}) + '\n',
	);
	const diag = await until((e) => e.event === 'semanticDiag' && e.body?.file === file);
	assert.ok(
		diag.body.diagnostics.some((d: any) => /\$pageCount/.test(d.text)),
		'expression diagnostic missing',
	);
	console.log(
		`ok  tsserver: ${diag.body.diagnostics.length} semantic diagnostics including expression ones`,
	);

	const log = readFileSync(logFile, 'utf8');
	assert.doesNotMatch(log, /Exception on executing command/, 'tsserver logged an exception');
	console.log('ok  tsserver: no exceptions in the server log');
} finally {
	srv.kill();
}
