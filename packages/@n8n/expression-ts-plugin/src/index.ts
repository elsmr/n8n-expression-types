// TypeScript language service plugin for n8n expressions in string literals.
// Inside a {{ }} block it forwards TypeScript's own hover, completions, signature help,
// quick fixes, inlay hints and semantic classifications from the virtual file, with
// positions mapped back. It adds block and expression types, n8n's sandbox rules, and
// keeps the lookup that makes resolved types flow in sync while you type. The lookup is a
// real file under <project>/.n8n (tsserver rejects memory-only roots), added as a root
// file here so no tsconfig entry is needed in the editor; `n8n-expressions check`
// writes the same file for plain tsc.

import path from 'node:path';
import { createRequire } from 'node:module';
import type TS from 'typescript';
import { createExpressionService, type Analysis } from './service.ts';
import {
	analysed,
	diagnostics,
	findExpressions,
	isLiteral,
	lookupEntries,
	projectFiles,
	renderResolved,
	type Found,
} from './scan.ts';
import { lookupFile as lookupFileFor, readLookup, writeLookup } from './lookup-file.ts';

type Item = Found & { analysis: Analysis };
type LiteralItem = Extract<Item, { textStart: number }>;

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
		const root = path.dirname(
			createRequire(__filename).resolve('@n8n/expression-types/package.json'),
		);
		const projectDir = info.project.getCurrentDirectory();
		const service = createExpressionService({ ts, root });

		// Scan results cached per file; the analyses behind them are memoised by content in the
		// service. Literals depend on their own file only. A resolve() site reads the expression
		// and data types from anywhere, so those files rescan whenever the program changed.
		const version = (fileName: string) => info.languageServiceHost.getScriptVersion(fileName);
		const cache = new Map<string, { program: TS.Program; version: string; items: Item[] }>();
		const itemsFor = (fileName: string): Item[] => {
			const program = ls.getProgram();
			if (!program) return [];
			const hit = cache.get(fileName);
			const ownOnly = hit && !hit.items.some((it) => it.kind === 'resolve');
			if (hit && (hit.program === program || (ownOnly && hit.version === version(fileName))))
				return hit.items;
			const sf = program.getSourceFile(fileName);
			if (!sf) return [];
			const items: Item[] = findExpressions(ts, sf, program.getTypeChecker()).map(
				analysed(service),
			);
			cache.set(fileName, { program, version: version(fileName), items });
			return items;
		};
		/** Every expression in the project. The first call scans everything; later calls hit the cache. */
		const projectItems = (): Item[] => {
			const program = ls.getProgram();
			return program ? projectFiles(program).flatMap((sf) => itemsFor(sf.fileName)) : [];
		};
		const itemAt = (fileName: string, position: number) =>
			itemsFor(fileName)
				.filter(isLiteral)
				.find((it) => position >= it.textStart && position <= it.textStart + it.expression.length);

		const lookupFile = lookupFileFor(projectDir);
		let lookupText = readLookup(projectDir) ?? '';
		if (!lookupText) {
			lookupText = renderResolved(new Map());
			writeLookup(projectDir, lookupText);
		}

		const lsHost = info.languageServiceHost;
		const origFileNames = lsHost.getScriptFileNames.bind(lsHost);
		lsHost.getScriptFileNames = () => {
			const names = origFileNames();
			return names.includes(lookupFile) ? names : [lookupFile, ...names];
		};

		// The whole project, not just open files: the same lookup `check` writes.
		const syncResolved = () => {
			const next = renderResolved(lookupEntries(projectItems()));
			if (next === lookupText) return;
			lookupText = next;
			writeLookup(projectDir, next);
			// Nothing watches this file, so tell tsserver ourselves.
			info.project.projectService.getScriptInfo(lookupFile)?.reloadFromFile();
			// markAsDirty is internal API; without it the program keeps the old lookup until the next edit.
			(info.project as unknown as { markAsDirty?: () => void }).markAsDirty?.();
			info.project.refreshDiagnostics();
			log('lookup updated');
		};

		const proxy: TS.LanguageService = Object.create(null);
		for (const k of Object.keys(ls) as Array<keyof TS.LanguageService>) {
			const fn = ls[k] as unknown as (...args: unknown[]) => unknown;
			(proxy as unknown as Record<string, unknown>)[k] = (...args: unknown[]) => fn.apply(ls, args);
		}

		// The lookup is written from the diagnostics pass only, never from hover or completion.
		proxy.getSemanticDiagnostics = (fileName) => {
			const prior = ls.getSemanticDiagnostics(fileName);
			const sf = ls.getProgram()?.getSourceFile(fileName);
			if (!sf) return prior;
			syncResolved();
			return [...prior, ...diagnostics(ts, itemsFor(fileName))];
		};

		// Inside a block: TypeScript's own quick info for the token. On the {{ }} delimiters:
		// the block's result type. On surrounding text: the expression's type.
		proxy.getQuickInfoAtPosition = (fileName, position) => {
			const it = itemAt(fileName, position);
			if (!it) return ls.getQuickInfoAtPosition(fileName, position);
			const offset = position - it.textStart;
			const v = service.virtual(it.expression, it.shape);
			// Styled like TypeScript's own "(kind) name: type" hovers.
			const info = (
				label: string,
				name: string,
				type: string,
				span: TS.TextSpan,
			): TS.QuickInfo => ({
				kind: ts.ScriptElementKind.string,
				kindModifiers: '',
				textSpan: span,
				displayParts: [
					{ text: '(', kind: 'punctuation' },
					{ text: label, kind: 'text' },
					{ text: ')', kind: 'punctuation' },
					{ text: ' ', kind: 'space' },
					{ text: name, kind: 'text' },
					{ text: ':', kind: 'punctuation' },
					{ text: ' ', kind: 'space' },
					{ text: type, kind: 'keyword' },
				],
			});
			const analysed = (b: { start: number }) =>
				it.analysis.blocks.find((a) => a.start === b.start);

			const block = v.blockAt(offset);
			if (block) {
				const pos = v.toFile(offset)!;
				const inner = v.languageService.getQuickInfoAtPosition(v.fileName, pos);
				const span = inner && v.toExpression(inner.textSpan);
				if (inner && span)
					return { ...inner, textSpan: { start: it.textStart + span.start, length: span.length } };
			}
			// Nothing under the cursor inside a block, or on the {{ }} delimiters: the block's result type.
			const around =
				block ??
				v.blocks.find(
					(b) =>
						(offset >= b.start - 2 && offset < b.start) || (offset > b.end && offset <= b.end + 2),
				);
			if (around) {
				return info('block', `{{ ${around.body.trim()} }}`, analysed(around)?.type ?? 'unknown', {
					start: it.textStart + around.start - 2,
					length: around.body.length + 4,
				});
			}
			return info('expression', it.context, it.analysis.type, {
				start: it.node.getStart(),
				length: it.node.getWidth(),
			});
		};

		// Forwarded to the virtual file when the cursor is inside a block.
		const forward = <R>(
			fileName: string,
			position: number,
			inner: (v: ReturnType<typeof service.virtual>, pos: number, it: LiteralItem) => R,
			fallback: () => R,
		): R => {
			const it = itemAt(fileName, position);
			if (!it) return fallback();
			const v = service.virtual(it.expression, it.shape);
			const pos = v.toFile(position - it.textStart);
			return pos === undefined ? fallback() : inner(v, pos, it);
		};

		proxy.getSignatureHelpItems = (fileName, position, options) =>
			forward(
				fileName,
				position,
				(v, pos, it) => {
					const help = v.languageService.getSignatureHelpItems(v.fileName, pos, options);
					const span = help && v.toExpression(help.applicableSpan);
					return help && span
						? { ...help, applicableSpan: { start: it.textStart + span.start, length: span.length } }
						: undefined;
				},
				() => ls.getSignatureHelpItems(fileName, position, options),
			);

		proxy.getCompletionEntryDetails = (
			fileName,
			position,
			entryName,
			formatOptions,
			source,
			preferences,
			data,
		) =>
			forward(
				fileName,
				position,
				(v, pos) =>
					v.languageService.getCompletionEntryDetails(
						v.fileName,
						pos,
						entryName,
						formatOptions,
						source,
						preferences,
						data,
					),
				() =>
					ls.getCompletionEntryDetails(
						fileName,
						position,
						entryName,
						formatOptions,
						source,
						preferences,
						data,
					),
			);

		// Quick fixes ("Change spelling to 'toUpperCase'") from the virtual file, mapped back.
		proxy.getCodeFixesAtPosition = (
			fileName,
			start,
			end,
			errorCodes,
			formatOptions,
			preferences,
		) => {
			const prior = ls.getCodeFixesAtPosition(
				fileName,
				start,
				end,
				errorCodes,
				formatOptions,
				preferences,
			);
			const it = itemAt(fileName, start);
			if (!it) return prior;
			const v = service.virtual(it.expression, it.shape);
			const from = v.toFile(start - it.textStart);
			const to = v.toFile(end - it.textStart);
			if (from === undefined || to === undefined) return prior;
			const fixes = v.languageService.getCodeFixesAtPosition(
				v.fileName,
				from,
				to,
				errorCodes,
				formatOptions,
				preferences,
			);
			const mapped = fixes.flatMap((fix) => {
				const changes = fix.changes.map((c) => ({
					fileName,
					textChanges: c.textChanges.map((tc) => {
						const span = v.toExpression(tc.span);
						return span
							? { ...tc, span: { start: it.textStart + span.start, length: span.length } }
							: undefined;
					}),
				}));
				if (changes.some((c) => c.textChanges.some((tc) => tc === undefined))) return [];
				return [
					{
						...fix,
						changes: changes.map((c) => ({
							...c,
							textChanges: c.textChanges.filter((tc) => tc !== undefined),
						})),
						fixAllDescription: undefined,
						fixId: undefined,
					},
				];
			});
			return [...prior, ...mapped];
		};

		// Keywords and warnings make no sense inside a block; the rest is TypeScript's.
		proxy.getCompletionsAtPosition = (fileName, position, options, formatting) =>
			forward(
				fileName,
				position,
				(v, pos) => {
					const inner = v.languageService.getCompletionsAtPosition(
						v.fileName,
						pos,
						options,
						formatting,
					);
					if (!inner) return undefined;
					const entries = inner.entries.filter(
						(e) =>
							e.kind !== ts.ScriptElementKind.warning && e.kind !== ts.ScriptElementKind.keyword,
					);
					return { ...inner, isGlobalCompletion: false, isMemberCompletion: true, entries };
				},
				() => ls.getCompletionsAtPosition(fileName, position, options, formatting),
			);

		proxy.provideInlayHints = (fileName, span, preferences) => {
			const prior = ls.provideInlayHints(fileName, span, preferences);
			const visible = itemsFor(fileName)
				.filter(isLiteral)
				.filter(
					(it) => it.node.getEnd() >= span.start && it.node.getStart() <= span.start + span.length,
				);
			const typeHints: TS.InlayHint[] = visible.map((it) => ({
				text: `: ${it.analysis.type}`,
				position: it.node.getEnd(),
				kind: ts.InlayHintKind.Type,
				paddingLeft: true,
			}));
			// Parameter-name hints and friends from inside the blocks, mapped back.
			const inner: TS.InlayHint[] = visible.flatMap((it) => {
				const v = service.virtual(it.expression, it.shape);
				return v.blocks.flatMap((b) =>
					v.languageService
						.provideInlayHints(
							v.fileName,
							{ start: b.fileStart, length: b.body.length },
							preferences,
						)
						.map((h) => ({ ...h, position: it.textStart + b.start + (h.position - b.fileStart) })),
				);
			});
			return [...prior, ...typeHints, ...inner];
		};

		// Semantic highlighting for identifiers inside blocks: [start, length, classification] triples.
		proxy.getEncodedSemanticClassifications = (fileName, span, format) => {
			const prior = ls.getEncodedSemanticClassifications(fileName, span, format);
			const spans = [...prior.spans];
			for (const it of itemsFor(fileName).filter(isLiteral)) {
				if (it.node.getEnd() < span.start || it.node.getStart() > span.start + span.length)
					continue;
				const v = service.virtual(it.expression, it.shape);
				for (const b of v.blocks) {
					const inner = v.languageService.getEncodedSemanticClassifications(
						v.fileName,
						{ start: b.fileStart, length: b.body.length },
						format,
					);
					for (let i = 0; i + 2 < inner.spans.length; i += 3) {
						spans.push(
							it.textStart + b.start + (inner.spans[i] - b.fileStart),
							inner.spans[i + 1],
							inner.spans[i + 2],
						);
					}
				}
			}
			return { ...prior, spans };
		};

		log(`active for ${projectDir}`);
		return proxy;
	};

	return { create };
};

export default init;
