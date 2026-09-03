// The lookup is a hidden, gitignored file in the project, picked up by an `include` glob
// so a fresh clone type-checks before anything has run (missing keys fall back to `any`).
// tsserver needs a real file behind every root, so the plugin writes the same file that
// `n8n-expressions check` writes for plain tsc.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const LOOKUP_GLOB = '.n8n/*.d.ts';

export const lookupFile = (projectDir: string) => path.join(projectDir, '.n8n/expressions.d.ts');

export const readLookup = (projectDir: string) => {
	const file = lookupFile(projectDir);
	return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
};

/** Writes the lookup when its content changed. Atomic, so a concurrent reader never sees a partial file. */
export const writeLookup = (projectDir: string, content: string): boolean => {
	const file = lookupFile(projectDir);
	if (readLookup(projectDir) === content) return false;
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(`${file}.tmp`, content);
	renameSync(`${file}.tmp`, file);
	return true;
};
