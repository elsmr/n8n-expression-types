// TypeScript language service plugin for n8n expressions in string literals.
//   - diagnostics, hover, completions and inlay hints inside `=...{{ }}` strings
//   - keeps <project>/n8n-resolved.d.ts in sync with resolve() calls, so the
//     resolved types flow through the checker while you type
// Shapes: the runtime/data argument when present, else what the surrounding code declares.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type TS from 'typescript';
import { createExpressionService, type Analysis } from 'n8n-expression-types/service';
import { findExpressions, renderResolved, resolvedType, type Found } from 'n8n-expression-types/scan';
import { resolvedKey } from 'n8n-expression-types';

type Item = Found & { analysis: Analysis };

// A project lists the plugin in tsconfig and the VS Code extension injects it too:
// the second create() for the same project must not decorate twice.
const decorated = new WeakSet<object>();

const init = (modules: { typescript: typeof TS }) => {
	const ts = modules.typescript;

	const create = (info: TS.server.PluginCreateInfo): TS.LanguageService => {
		if (decorated.has(info.project)) return info.languageService;
		decorated.add(info.project);
		const ls = info.languageService;
		const log = (m: string) => info.project.projectService.logger.info(`[n8n-expression] ${m}`);
		const root = path.resolve(__dirname, '../../core');
		const projectDir = info.project.getCurrentDirectory();
		const service = createExpressionService({ ts, root });

		// ----- per-file analysis, cached by script version -----
		const cache = new Map<string, { version: string; items: Item[] }>();
		const itemsFor = (fileName: string): Item[] => {
			const version = info.languageServiceHost.getScriptVersion(fileName);
			const hit = cache.get(fileName);
			if (hit?.version === version) return hit.items;
			const program = ls.getProgram();
			const sf = program?.getSourceFile(fileName);
			if (!program || !sf) return [];
			const items = findExpressions(ts, sf, program.getTypeChecker()).map((f) => ({
				...f,
				analysis: service.analyze(f.expression, f.shape, f.expected),
			}));
			cache.set(fileName, { version, items });
			syncResolved(fileName, items);
			return items;
		};
		const itemAt = (fileName: string, position: number) =>
			itemsFor(fileName).find((it) => !it.reportAt && position >= it.textStart && position <= it.textStart + it.expression.length);
		const blockAt = (it: Item, position: number) =>
			it.analysis.blocks.find((b) => position >= it.textStart + b.start && position <= it.textStart + b.end);

		// ----- generated lookup for resolve() -----
		const resolvedByFile = new Map<string, Map<string, string>>();
		const resolvedPath = path.join(projectDir, 'n8n-resolved.d.ts');
		const syncResolved = (fileName: string, items: Item[]) => {
			const mine = new Map(
				items.filter((i) => i.kind === 'call').map((i) => [resolvedKey(i.context, i.expression), resolvedType(i.analysis)] as const),
			);
			if (mine.size === 0 && !resolvedByFile.has(fileName)) return;
			resolvedByFile.set(fileName, mine);
			const all = new Map<string, string>();
			for (const m of resolvedByFile.values()) for (const [k, v] of m) all.set(k, v);
			const next = renderResolved(all);
			const current = existsSync(resolvedPath) ? readFileSync(resolvedPath, 'utf8') : '';
			if (next !== current) {
				writeFileSync(resolvedPath, next);
				log(`wrote ${resolvedPath} (${all.size} expressions)`);
			}
		};

		// ----- decorated service -----
		const proxy: TS.LanguageService = Object.create(null);
		for (const k of Object.keys(ls) as Array<keyof TS.LanguageService>) {
			const fn = ls[k] as unknown as (...args: unknown[]) => unknown;
			(proxy as unknown as Record<string, unknown>)[k] = (...args: unknown[]) => fn.apply(ls, args);
		}

		proxy.getSemanticDiagnostics = (fileName) => {
			const prior = ls.getSemanticDiagnostics(fileName);
			const sf = ls.getProgram()?.getSourceFile(fileName);
			if (!sf) return prior;
			const diag = (start: number, length: number, messageText: string): TS.Diagnostic => ({
				file: sf,
				start,
				length,
				messageText,
				category: ts.DiagnosticCategory.Error,
				code: 90001,
				source: 'n8n-expression',
			});
			const extra = itemsFor(fileName).flatMap((it) => {
				// resolve() re-checks a literal declared elsewhere: report at the call.
				if (it.reportAt) {
					const messages = it.analysis.blocks.flatMap((b) => b.errors.map((e) => e.message));
					return messages.map((m) => diag(it.reportAt!.start, it.reportAt!.length, `Against this data: ${m}`));
				}
				const inBlocks = it.analysis.blocks.flatMap((b) =>
					b.errors.map((e) => diag(it.textStart + e.start, Math.max(e.end - e.start, 1), e.message)),
				);
				const slot = it.analysis.slotError ? [diag(it.node.getStart(), it.node.getWidth(), it.analysis.slotError)] : [];
				return [...inBlocks, ...slot];
			});
			return [...prior, ...extra];
		};

		proxy.getQuickInfoAtPosition = (fileName, position) => {
			const it = itemAt(fileName, position);
			if (!it) return ls.getQuickInfoAtPosition(fileName, position);
			const block = blockAt(it, position);
			const lines = [
				...(block ? [`{{ ${block.body.trim()} }}: ${block.type}`] : []),
				`expression: ${it.analysis.type}`,
			];
			return {
				kind: ts.ScriptElementKind.string,
				kindModifiers: '',
				textSpan: block
					? { start: it.textStart + block.start, length: block.end - block.start }
					: { start: it.node.getStart(), length: it.node.getWidth() },
				displayParts: [{ text: lines.join('\n'), kind: 'text' }],
			};
		};

		proxy.getCompletionsAtPosition = (fileName, position, options, formatting) => {
			const it = itemAt(fileName, position);
			const block = it && blockAt(it, position);
			if (!it || !block) return ls.getCompletionsAtPosition(fileName, position, options, formatting);
			const entries = service.completionsAt(it.expression, position - it.textStart, it.shape);
			return {
				isGlobalCompletion: false,
				isMemberCompletion: true,
				isNewIdentifierLocation: false,
				entries,
			};
		};

		proxy.provideInlayHints = (fileName, span, preferences) => {
			const prior = ls.provideInlayHints(fileName, span, preferences);
			const hints: TS.InlayHint[] = itemsFor(fileName)
				.filter((it) => !it.reportAt && it.node.getEnd() >= span.start && it.node.getEnd() <= span.start + span.length)
				.map((it) => ({
					text: `: ${it.analysis.type}`,
					position: it.node.getEnd(),
					kind: ts.InlayHintKind.Type,
					paddingLeft: true,
				}));
			return [...prior, ...hints];
		};

		log(`active for ${projectDir}`);
		return proxy;
	};

	return { create };
};

export default init;
