// Sample data expressions are resolved against. `as const` keeps node and variable names
// literal; json values are widened by the tooling.
import type { RuntimeTypes } from '@n8n/expression-types';

export const runtime = {
	input: {
		json: { test: 'hello', n: 3, tags: ['a', 'b'], user: { name: 'Ada', emails: ['ada@example.com'] }, nothing: null },
		binaryKeys: ['data'],
	},
	nodes: {
		Webhook: { json: { headers: { host: 'x' }, body: { orderId: 42 } }, params: { path: 'orders', httpMethod: 'POST' } },
		'Edit Fields': { json: { total: 9.5 }, binaryKeys: ['invoice'] },
	},
	parameters: { url: 'https://example.com', options: { timeout: 3000 } },
	vars: ['apiKey', 'region'],
} as const satisfies RuntimeTypes;

export const pagination = {
	...runtime,
	context: 'httpPagination',
	response: { next: 'https://example.com?page=2', items: [1, 2] },
} as const satisfies RuntimeTypes;

export const credentialData = {
	context: 'credential',
	credentials: { apiKey: 'secret', baseUrl: 'https://api.example.com' },
} as const satisfies RuntimeTypes;
