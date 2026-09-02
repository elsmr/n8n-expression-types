// Packages the VS Code extension as a self-contained .vsix: the tsserver plugin, the
// declaration files it serves, and Luxon's types travel inside, so it works in any
// workspace. A .vsix is a zip with two manifest files; vsce is not needed and would drop
// node_modules, which is where tsserver looks for the plugin.
import {
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(path.join(root, 'packages/core/package.json'));
const manifest = JSON.parse(readFileSync(path.join(root, 'packages/vscode/package.json'), 'utf8'));
const stage = mkdtempSync(path.join(tmpdir(), 'n8n-expressions-'));
const ext = path.join(stage, 'extension');

cpSync(path.join(root, 'packages/vscode'), ext, {
	recursive: true,
	filter: (src) => !src.includes(`${path.sep}node_modules`),
});

// tsserver requires the plugin by name from <extension>/node_modules; the plugin resolves
// @n8n/expression-types from there for its declaration files and Luxon.
const plugin = path.join(ext, 'node_modules/@n8n/expression-ts-plugin');
mkdirSync(plugin, { recursive: true });
for (const f of ['package.json', 'entry.cjs', 'dist'])
	cpSync(path.join(root, 'packages/plugin', f), path.join(plugin, f), { recursive: true });
const core = path.join(ext, 'node_modules/@n8n/expression-types');
mkdirSync(path.join(core, 'node_modules/@types'), { recursive: true });
cpSync(path.join(root, 'packages/core/package.json'), path.join(core, 'package.json'));
for (const f of ['shapes.d.ts', 'extensions.d.ts'])
	cpSync(path.join(root, 'packages/core', f), path.join(core, f));
cpSync(
	realpathSync(path.dirname(require.resolve('luxon/package.json'))),
	path.join(core, 'node_modules/luxon'),
	{ recursive: true },
);
cpSync(
	realpathSync(path.dirname(require.resolve('@types/luxon/package.json'))),
	path.join(core, 'node_modules/@types/luxon'),
	{ recursive: true },
);

const xml = (s) =>
	s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
writeFileSync(
	path.join(stage, 'extension.vsixmanifest'),
	`<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${manifest.name}" Version="${manifest.version}" Publisher="${manifest.publisher}" />
    <DisplayName>${xml(manifest.displayName)}</DisplayName>
    <Description xml:space="preserve">${xml(manifest.description)}</Description>
    <Categories>${manifest.categories.join(',')}</Categories>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${manifest.engines.vscode}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionDependencies" Value="${(manifest.extensionDependencies ?? []).join(',')}" />
      <Property Id="Microsoft.VisualStudio.Code.ExtensionKind" Value="workspace" />
    </Properties>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code" /></Installation>
  <Dependencies />
  <Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" /></Assets>
</PackageManifest>
`,
);
writeFileSync(
	path.join(stage, '[Content_Types].xml'),
	`<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".json" ContentType="application/json" />
  <Default Extension=".vsixmanifest" ContentType="text/xml" />
  <Default Extension=".cjs" ContentType="application/javascript" />
  <Default Extension=".js" ContentType="application/javascript" />
  <Default Extension=".mjs" ContentType="application/javascript" />
  <Default Extension=".ts" ContentType="text/plain" />
  <Default Extension=".md" ContentType="text/markdown" />
  <Default Extension=".txt" ContentType="text/plain" />
  <Default Extension=".map" ContentType="application/json" />
</Types>
`,
);

const out = path.join(root, 'n8n-expressions.vsix');
rmSync(out, { force: true });
execFileSync('zip', ['-qr', out, 'extension.vsixmanifest', '[Content_Types].xml', 'extension'], {
	cwd: stage,
});
rmSync(stage, { recursive: true, force: true });
console.log(`${path.relative(root, out)}\n  code --install-extension ${path.relative(root, out)}`);
