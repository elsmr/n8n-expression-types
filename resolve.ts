// String form. `resolve()` is typed through `N8nResolvedTypes`, a global interface the
// generator (gen-resolved.ts, or the language service plugin while you type) fills with
// one entry per expression literal found in `resolve()` calls.
//
// At runtime it returns the expression unchanged: evaluating against live data is n8n's job.

import type { RuntimeTypes } from './globals.ts';

declare global {
	interface N8nResolvedTypes {}
}

export type Resolved<E extends string> = E extends keyof N8nResolvedTypes ? N8nResolvedTypes[E] : unknown;

export const resolve = <const E extends string, R extends RuntimeTypes>(expression: E, _runtime: R): Resolved<E> =>
	expression as unknown as Resolved<E>;

/** Sugar for the plugin: marks a template literal as an n8n expression. */
export const n8n = (strings: TemplateStringsArray): string => strings.raw[0];
