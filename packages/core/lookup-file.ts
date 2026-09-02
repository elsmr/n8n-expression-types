// The lookup lives in a types package under the project's node_modules. tsc includes
// node_modules/@types/* automatically (or through `types` when that option is set), and
// tsserver needs a real file behind every source file, so this is what both the plugin
// and `generate` write. Nothing in the source tree, nothing to commit.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const LOOKUP_PACKAGE = 'n8n-expressions-lookup';

export const lookupFile = (projectDir: string) => path.join(projectDir, 'node_modules/@types', LOOKUP_PACKAGE, 'index.d.ts');

export const readLookup = (projectDir: string) => {
	const file = lookupFile(projectDir);
	return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
};

/** Writes the lookup when its content changed. */
export const writeLookup = (projectDir: string, content: string): boolean => {
	const file = lookupFile(projectDir);
	if (readLookup(projectDir) === content) return false;
	mkdirSync(path.dirname(file), { recursive: true });
	writeFileSync(
		path.join(path.dirname(file), 'package.json'),
		JSON.stringify({ name: `@types/${LOOKUP_PACKAGE}`, version: '0.0.0', types: 'index.d.ts' }, null, 2) + '\n',
	);
	writeFileSync(file, content);
	return true;
};
