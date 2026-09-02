// TypeScript language service plugin for n8n expressions in string literals.
// Inside a {{ }} block it forwards TypeScript's own hover, completions, signature help,
// quick fixes, inlay hints and semantic classifications from the virtual file, with
// positions mapped back. It adds block and expression types, n8n's sandbox rules, and
// keeps the lookup that makes resolved types flow in sync while you type. The lookup is a
// real file under <project>/.n8n (tsserver rejects memory-only roots), added as a root
// file here so no tsconfig entry is needed in the editor; `n8n-expressions generate`
// writes the same file for plain tsc.

import path from 'node:path';
import { createRequire } from 'node:module';
import type TS from 'typescript';
import {
	createExpressionService,
	type Analysis,
	type RuntimeShape,
} from '@n8n/expression-types/service';
import {
	findExpressions,
	lookupEntries,
	renderResolved,
	type Found,
} from '@n8n/expression-types/scan';
import {
	lookupFile as lookupFileFor,
	readLookup,
	writeLookup,
} from '@n8n/expression-types/lookup-file';

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
		const root = path.dirname(
			createRequire(__filename).resolve('@n8n/expression-types/package.json'),
		);
		const projectDir = info.project.getCurrentDirectory();
		const service = createExpressionService({ ts, root });

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
				const resolved =
					f.kind === 'call'
						? found.find(
								(o) =>
									o.kind === 'resolve' && o.expression === f.expression && o.context === f.context,
							)
						: undefined;
				const analysis = service.analyze(f.expression, f.shape, f.expected);
				const hoverShape = resolved?.shape ?? f.shape;
				const hoverAnalysis = resolved ? service.analyze(f.expression, hoverShape) : analysis;
				return { ...f, analysis, hoverShape, hoverAnalysis };
			});
			cache.set(fileName, { version, items });
			return items;
		};
		const itemAt = (fileName: string, position: number) =>
			itemsFor(fileName).find(
				(it) =>
					!it.reportAt &&
					position >= it.textStart &&
					position <= it.textStart + it.expression.length,
			);
		const blockAt = (it: Item, position: number) =>
			it.analysis.blocks.find(
				(b) => position >= it.textStart + b.start && position <= it.textStart + b.end,
			);

		const resolvedByFile = new Map<string, Item[]>();
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

		const syncResolved = (fileName: string, items: Item[]) => {
			const mine = items.filter((i) => i.kind !== 'slot');
			if (mine.length === 0 && !resolvedByFile.has(fileName)) return;
			resolvedByFile.set(fileName, mine);
			// Recompute across files so a resolve() in one file types an expr() in another.
			const next = renderResolved(lookupEntries([...resolvedByFile.values()].flat()));
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
			syncResolved(fileName, itemsFor(fileName));
			// Same codes as TypeScript's own diagnostics, so they read as ts(2339) in the editor.
			const diag = (
				start: number,
				length: number,
				messageText: string,
				code: number,
			): TS.Diagnostic => ({
				file: sf,
				start,
				length,
				messageText,
				category: ts.DiagnosticCategory.Error,
				code,
				...(code === 90001 ? { source: 'n8n' } : {}),
			});
			const extra = itemsFor(fileName).flatMap((it) => {
				// resolve() re-checks a literal declared elsewhere: report at the call.
				if (it.reportAt) {
					return it.analysis.blocks.flatMap((b) =>
						b.errors.map((e) =>
							diag(
								it.reportAt!.start,
								it.reportAt!.length,
								`${e.message} (in '${it.expression}' against this data)`,
								e.code,
							),
						),
					);
				}
				const inBlocks = it.analysis.blocks.flatMap((b) =>
					b.errors.map((e) =>
						diag(it.textStart + e.start, Math.max(e.end - e.start, 1), e.message, e.code),
					),
				);
				const slot = it.analysis.slotError
					? [diag(it.node.getStart(), it.node.getWidth(), it.analysis.slotError, 2322)]
					: [];
				return [...inBlocks, ...slot];
			});
			return [...prior, ...extra];
		};

		// Hovering the variable an expr() is assigned to: TypeScript's Expr<...> plus what it resolves to.
		const withResolveSummary = (fileName: string, position: number): TS.QuickInfo | undefined => {
			const prior = ls.getQuickInfoAtPosition(fileName, position);
			const shown = prior?.displayParts?.map((p) => p.text).join('') ?? '';
			const m = /\b(?:Expr|InvalidExpr)<(\w+)Context, "((?:[^"\\]|\\.)*)">/.exec(shown);
			if (!prior || !m) return prior;
			const text = JSON.parse(`"${m[2]}"`) as string;
			const sites = [...resolvedByFile.values()]
				.flat()
				.filter((i) => i.kind === 'resolve' && i.expression === text);
			const loose = [...resolvedByFile.values()]
				.flat()
				.find((i) => i.kind === 'call' && i.expression === text);
			const types = [...new Set(sites.map((s) => s.analysis.type))];
			const summary = sites.length
				? `Resolves to \`${types.join(' | ')}\` against ${sites.length} data set${sites.length === 1 ? '' : 's'}.`
				: loose && loose.analysis.type !== 'any'
					? `Evaluates to \`${loose.analysis.type}\`. Not resolved against data.`
					: 'Not resolved against data; the type depends on runtime input.';
			return {
				...prior,
				documentation: [...(prior.documentation ?? []), { text: summary, kind: 'text' }],
			};
		};

		// Inside a block: TypeScript's own quick info for the token. On the {{ }} delimiters:
		// the block's result type. On surrounding text: the expression's type.
		proxy.getQuickInfoAtPosition = (fileName, position) => {
			const it = itemAt(fileName, position);
			if (!it) return withResolveSummary(fileName, position);
			const offset = position - it.textStart;
			const v = service.virtual(it.expression, it.hoverShape);
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
				it.hoverAnalysis.blocks.find((a) => a.start === b.start);

			const block = v.blockAt(offset);
			if (block) {
				const pos = v.toFile(offset)!;
				const inner = v.languageService.getQuickInfoAtPosition(v.fileName, pos);
				const span = inner && v.toExpression(inner.textSpan);
				if (inner && span)
					return { ...inner, textSpan: { start: it.textStart + span.start, length: span.length } };
				const a = analysed(block);
				return info('block', `{{ ${block.body.trim()} }}`, a?.type ?? 'unknown', {
					start: it.textStart + block.start - 2,
					length: block.body.length + 4,
				});
			}
			// On the delimiters themselves: the block's result type.
			const delimited = v.blocks.find(
				(b) =>
					(offset >= b.start - 2 && offset < b.start) || (offset > b.end && offset <= b.end + 2),
			);
			if (delimited) {
				const a = analysed(delimited);
				return info('block', `{{ ${delimited.body.trim()} }}`, a?.type ?? 'unknown', {
					start: it.textStart + delimited.start - 2,
					length: delimited.body.length + 4,
				});
			}
			return info('expression', it.context, it.hoverAnalysis.type, {
				start: it.node.getStart(),
				length: it.node.getWidth(),
			});
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
			if (!it || it.reportAt) return prior;
			const v = service.virtual(it.expression, it.hoverShape);
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

		proxy.getCompletionsAtPosition = (fileName, position, options, formatting) => {
			const it = itemAt(fileName, position);
			const block = it && blockAt(it, position);
			if (!it || !block)
				return ls.getCompletionsAtPosition(fileName, position, options, formatting);
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
			const visible = itemsFor(fileName).filter(
				(it) =>
					!it.reportAt &&
					it.node.getEnd() >= span.start &&
					it.node.getStart() <= span.start + span.length,
			);
			const typeHints: TS.InlayHint[] = visible.map((it) => ({
				text: `: ${it.hoverAnalysis.type}`,
				position: it.node.getEnd(),
				kind: ts.InlayHintKind.Type,
				paddingLeft: true,
			}));
			// Parameter-name hints and friends from inside the blocks, mapped back.
			const inner: TS.InlayHint[] = visible.flatMap((it) => {
				const v = service.virtual(it.expression, it.hoverShape);
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
			for (const it of itemsFor(fileName)) {
				if (
					it.reportAt ||
					it.node.getEnd() < span.start ||
					it.node.getStart() > span.start + span.length
				)
					continue;
				const v = service.virtual(it.expression, it.hoverShape);
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
