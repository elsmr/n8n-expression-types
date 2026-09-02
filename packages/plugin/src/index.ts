// TypeScript language service plugin for n8n expressions in string literals.
//   - diagnostics, hover, completions and inlay hints inside `=...{{ }}` strings
//   - keeps <project>/n8n-resolved.d.ts in sync with resolve() calls, so the
//     resolved types flow through the checker while you type
// Shapes: the runtime/data argument when present, else what the surrounding code declares.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type TS from 'typescript';
import { createExpressionService, type Analysis, type RuntimeShape } from 'n8n-expression-types/service';
import { findExpressions, lookupEntries, renderResolved, type Found } from 'n8n-expression-types/scan';

type Item = Found & {
	analysis: Analysis;
	/** Richest shape known for this expression: from a resolve() site when one exists. */
	hoverShape: RuntimeShape;
	/** Analysis against hoverShape, for block result types on hover. */
	hoverAnalysis: Analysis;
};

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
			const found = findExpressions(ts, sf, program.getTypeChecker());
			const items: Item[] = found.map((f) => {
				const resolved = f.kind === 'call' ? found.find((o) => o.kind === 'resolve' && o.expression === f.expression && o.context === f.context) : undefined;
				const analysis = service.analyze(f.expression, f.shape, f.expected);
				const hoverShape = resolved?.shape ?? f.shape;
				const hoverAnalysis = resolved ? service.analyze(f.expression, hoverShape) : analysis;
				return { ...f, analysis, hoverShape, hoverAnalysis };
			});
			cache.set(fileName, { version, items });
			syncResolved(fileName, items);
			return items;
		};
		const itemAt = (fileName: string, position: number) =>
			itemsFor(fileName).find((it) => !it.reportAt && position >= it.textStart && position <= it.textStart + it.expression.length);
		const blockAt = (it: Item, position: number) =>
			it.analysis.blocks.find((b) => position >= it.textStart + b.start && position <= it.textStart + b.end);

		// ----- generated lookup for resolve() -----
		const resolvedByFile = new Map<string, Item[]>();
		const resolvedPath = path.join(projectDir, 'n8n-resolved.d.ts');
		const syncResolved = (fileName: string, items: Item[]) => {
			const mine = items.filter((i) => i.kind !== 'slot');
			if (mine.length === 0 && !resolvedByFile.has(fileName)) return;
			resolvedByFile.set(fileName, mine);
			// Recompute across files so a resolve() in one file types an expr() in another.
			const all = lookupEntries([...resolvedByFile.values()].flat());
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

		// Hover: TypeScript's own quick info for the token under the cursor, the block's
		// result type on the {{ }} delimiters, the expression's type on surrounding text.
		proxy.getQuickInfoAtPosition = (fileName, position) => {
			const it = itemAt(fileName, position);
			if (!it) return ls.getQuickInfoAtPosition(fileName, position);
			const offset = position - it.textStart;
			const v = service.virtual(it.expression, it.hoverShape);
			const info = (text: string, span: TS.TextSpan): TS.QuickInfo => ({
				kind: ts.ScriptElementKind.string,
				kindModifiers: '',
				textSpan: span,
				displayParts: [{ text, kind: 'text' }],
			});
			const analysed = (b: { start: number }) => it.hoverAnalysis.blocks.find((a) => a.start === b.start);

			const block = v.blockAt(offset);
			if (block) {
				const pos = v.toFile(offset)!;
				const inner = v.languageService.getQuickInfoAtPosition(v.fileName, pos);
				const span = inner && v.toExpression(inner.textSpan);
				if (inner && span) return { ...inner, textSpan: { start: it.textStart + span.start, length: span.length } };
				const a = analysed(block);
				return info(`{{ }} : ${a?.type ?? 'unknown'}`, { start: it.textStart + block.start - 2, length: block.body.length + 4 });
			}
			// On the delimiters themselves: the block's result type.
			const delimited = v.blocks.find((b) => (offset >= b.start - 2 && offset < b.start) || (offset > b.end && offset <= b.end + 2));
			if (delimited) {
				const a = analysed(delimited);
				return info(`{{ }} : ${a?.type ?? 'unknown'}`, { start: it.textStart + delimited.start - 2, length: delimited.body.length + 4 });
			}
			return info(`expression : ${it.hoverAnalysis.type}`, { start: it.node.getStart(), length: it.node.getWidth() });
		};

		// Forwarded to the virtual file when the cursor is inside a block.
		const forward = <R>(
			fileName: string,
			position: number,
			inner: (v: ReturnType<typeof service.virtual>, pos: number) => R,
			fallback: () => R,
		): R => {
			const it = itemAt(fileName, position);
			if (!it) return fallback();
			const v = service.virtual(it.expression, it.hoverShape);
			const pos = v.toFile(position - it.textStart);
			return pos === undefined ? fallback() : inner(v, pos);
		};

		proxy.getSignatureHelpItems = (fileName, position, options) =>
			forward(
				fileName,
				position,
				(v, pos) => {
					const help = v.languageService.getSignatureHelpItems(v.fileName, pos, options);
					const span = help && v.toExpression(help.applicableSpan);
					const it = itemAt(fileName, position)!;
					return help && span ? { ...help, applicableSpan: { start: it.textStart + span.start, length: span.length } } : undefined;
				},
				() => ls.getSignatureHelpItems(fileName, position, options),
			);

		proxy.getCompletionEntryDetails = (fileName, position, entryName, formatOptions, source, preferences, data) =>
			forward(
				fileName,
				position,
				(v, pos) => v.languageService.getCompletionEntryDetails(v.fileName, pos, entryName, formatOptions, source, preferences, data),
				() => ls.getCompletionEntryDetails(fileName, position, entryName, formatOptions, source, preferences, data),
			);

		proxy.getCompletionsAtPosition = (fileName, position, options, formatting) => {
			const it = itemAt(fileName, position);
			const block = it && blockAt(it, position);
			if (!it || !block) return ls.getCompletionsAtPosition(fileName, position, options, formatting);
			const entries = service.completionsAt(it.expression, position - it.textStart, it.hoverShape);
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
