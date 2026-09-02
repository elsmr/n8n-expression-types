
import type { DateTime, DurationUnit } from 'luxon';

declare module 'luxon' {
	interface DateTime { beginningOf(unit?: DurationUnit): DateTime; endOfMonth(): DateTime; extract(unit?: string): number; isBetween(date1: string | DateTime, date2: string | DateTime): boolean; isDst(): boolean; isInLast(n: number, unit?: DurationUnit): boolean; isWeekend(): boolean; minus(n: number | object, unit?: string): DateTime; plus(n: number | object, unit?: string): DateTime; format(fmt: string): string; toDateTime(): DateTime; diffTo(otherDateTime: string | DateTime, unit: string | string[]): number | Record<DurationUnit, number>; diffToNow(unit: string | string[]): number | Record<DurationUnit, number>; toInt(): any; toFloat(): any; toBoolean(): any; isEmpty(): boolean; isNotEmpty(): boolean; }
}
declare global {
	
	interface String { hash(algo?: string): string; removeMarkdown(): string; removeTags(): string; toDate(): Date; toDateTime(format?: string): DateTime; toBoolean(): boolean; toDecimalNumber(): any; toNumber(): number; toFloat(): number; toInt(radix?: number): number; toWholeNumber(): any; toSentenceCase(): string; toSnakeCase(): string; toTitleCase(): string; urlDecode(allChars?: boolean): string; urlEncode(allChars?: boolean): string; quote(mark?: string): string; replaceSpecialChars(): string; length(): number; isDomain(): boolean; isEmail(): boolean; isNumeric(): boolean; isUrl(): boolean; isEmpty(): boolean; isNotEmpty(): boolean; toJsonString(): string; extractEmail(): string; extractDomain(): string; extractUrl(): string; extractUrlPath(): string; parseJson(): any; base64Encode(): string; base64Decode(): string; }
	interface Number { ceil(): number; floor(): number; format(locale?: string, options?: object): string; round(decimalPlaces?: number): number; abs(): number; isInteger(): boolean; isEven(): boolean; isOdd(): boolean; toBoolean(): boolean; toInt(): any; toFloat(): any; toDateTime(format?: string): DateTime; }
	interface Boolean { toBoolean(): any; toInt(): any; toFloat(): any; toNumber(): number; toDateTime(): any; }
	interface Array<T> { removeDuplicates(...fieldNames: any[]): T[]; unique(...fieldNames: any[]): T[]; first(): T; last(): T; pluck(...fieldNames: string[]): T[]; randomItem(): T; sum(): number; min(): number; max(): number; average(): number; isNotEmpty(): boolean; isEmpty(): boolean; compact(): T[]; smartJoin(keyField: string, nameField: string): Record<string, any>; chunk(length: number): T[]; renameKeys(from: string, to: string): T[]; merge(otherArray: T[]): Record<string, any>; union(otherArray: T[]): T[]; difference(otherArray: T[]): T[]; intersection(otherArray: T[]): T[]; append(...elements: any[]): T[]; toJsonString(): string; toInt(): any; toFloat(): any; toBoolean(): any; toDateTime(): any; }
	interface Object { isEmpty(): boolean; isNotEmpty(): boolean; hasField(name: string): boolean; removeField(key: string): Record<string, any>; removeFieldsContaining(value: string): Record<string, any>; keepFieldsContaining(value: string): Record<string, any>; compact(): Record<string, any>; urlEncode(): string; keys(): string[]; values(): any[]; toJsonString(): string; toInt(): any; toFloat(): any; toBoolean(): any; toDateTime(): any; }
	interface Date { beginningOf(unit?: DurationUnit): DateTime;
		endOfMonth(): DateTime;
		extract(unit?: string): number;
		isBetween(date1: string | DateTime, date2: string | DateTime): boolean;
		isDst(): boolean;
		isInLast(n: number, unit?: DurationUnit): boolean;
		isWeekend(): boolean;
		minus(n: number | object, unit?: string): DateTime;
		plus(n: number | object, unit?: string): DateTime;
		format(fmt: string): string;
		toDateTime(): DateTime;
		diffTo(otherDateTime: string | DateTime, unit: string | string[]): number | Record<DurationUnit, number>;
		diffToNow(unit: string | string[]): number | Record<DurationUnit, number>;
		toInt(): any;
		toFloat(): any;
		toBoolean(): any;
		isEmpty(): boolean;
		isNotEmpty(): boolean; }


	// ----- runtime-shaped (injected) -----
	type InputJson = { "test": string; "n": number; "tags": Array<string>; "user": { "name": string; "emails": Array<string> }; "nothing": null };
	type InputBinaryKeys = "data";
	type NodeParams = { "url": string; "options": { "timeout": number } };
	interface NodeDataMap {
		"Webhook": N8nNodeData<{ "headers": { "host": string }; "body": { "orderId": number } }, string, { "path": string; "httpMethod": string }>;
		"Edit Fields": N8nNodeData<{ "total": number }, "invoice", Record<string, any>>;
	}
	const $vars: { "apiKey": string; "region": string };
	const $env: Record<string, string>;

	// ----- fixed shapes (workflow-data-proxy.ts, get-additional-keys.ts) -----
	interface N8nBinaryData {
		data: string;
		mimeType: string;
		fileType?: string;
		fileName?: string;
		directory?: string;
		fileExtension?: string;
		fileSize?: string;
		id?: string;
	}
	interface N8nItem<J = InputJson, B extends string = InputBinaryKeys> {
		json: J;
		binary: Record<B, N8nBinaryData>;
		pairedItem?: { item: number; input?: number } | Array<{ item: number; input?: number }>;
	}
	interface N8nNodeData<J, B extends string, P> {
		item: N8nItem<J, B>;
		itemMatching(itemIndex: number): N8nItem<J, B>;
		pairedItem(itemIndex?: number): N8nItem<J, B>;
		first(branchIndex?: number, runIndex?: number): N8nItem<J, B>;
		last(branchIndex?: number, runIndex?: number): N8nItem<J, B>;
		all(branchIndex?: number, runIndex?: number): Array<N8nItem<J, B>>;
		context: Record<string, any>;
		params: P;
		isExecuted: boolean;
	}
	type AnyNodeData = N8nNodeData<Record<string, any>, string, Record<string, any>>;

	const $json: InputJson;
	/** @deprecated use $json */
	const $data: InputJson;
	const $binary: Record<InputBinaryKeys, N8nBinaryData>;
	const $input: {
		item: N8nItem;
		first(branchIndex?: number, runIndex?: number): N8nItem;
		last(branchIndex?: number, runIndex?: number): N8nItem;
		all(branchIndex?: number, runIndex?: number): N8nItem[];
		context: Record<string, any>;
		params: NodeParams;
	};
	function $<K extends keyof NodeDataMap>(nodeName: K, resolveFullItem?: boolean): NodeDataMap[K];
	function $(nodeName?: string, resolveFullItem?: boolean): AnyNodeData;
	/** @deprecated use $('Node') */
	const $node: {
		[K in keyof NodeDataMap]: NodeDataMap[K]['item'] & {
			parameter: NodeDataMap[K]['params'];
			context: Record<string, any>;
			runIndex: number;
		};
	} & Record<string, AnyNodeData['item'] & { parameter: Record<string, any>; context: Record<string, any>; runIndex: number }>;
	function $items(nodeName?: string, outputIndex?: number, runIndex?: number): N8nItem<Record<string, any>, string>[];
	/** @deprecated */
	function $item(itemIndex: number, runIndex?: number): any;

	const $parameter: NodeParams;
	const $rawParameter: NodeParams;
	const $prevNode: { name: string; outputIndex: number; runIndex: number };
	const $workflow: { id: string; name: string; active: boolean };
	const $execution: {
		id: string;
		mode: 'test' | 'production';
		resumeUrl: string;
		resumeFormUrl: string;
		customData?: {
			set(key: string, value: string): void;
			get(key: string): string;
			getAll(): Record<string, string>;
			setAll(values: Record<string, string>): void;
		};
	};
	const $evaluation: { runId: string } | undefined;
	const $secrets: Record<string, Record<string, any>>;
	const $mode: 'cli' | 'error' | 'integrated' | 'internal' | 'manual' | 'retry' | 'trigger' | 'webhook' | 'evaluation' | 'chat';
	const $itemIndex: number;
	const $runIndex: number;
	const $position: number;
	const $thisItemIndex: number;
	const $thisRunIndex: number;
	const $thisItem: N8nItem;
	const $nodeVersion: number;
	const $nodeId: string;
	const $webhookId: string | undefined;
	/** @deprecated use $execution.id */
	const $executionId: string;
	/** @deprecated use $execution.resumeUrl */
	const $resumeWebhookUrl: string;
	const $now: DateTime;
	const $today: DateTime;
	const $tool: any;
	const $agentInfo: {
		memoryConnectedToAgent: boolean;
		tools: Array<{ connected: boolean; name: string; type: string; resource?: string; operation?: string; hasCredentials?: boolean }>;
	};

	function $if<T, F = undefined>(condition: boolean, valueIfTrue: T, valueIfFalse?: F): T | F;
	function $min(...numbers: number[]): number;
	function $max(...numbers: number[]): number;
	function $average(...numbers: number[]): number;
	function $not(value: unknown): boolean;
	function $ifEmpty<V, E>(value: V, defaultValue: E): V | E;
	function $jmespath(data: Record<string, any> | any[], query: string): any;
	function $jmesPath(data: Record<string, any> | any[], query: string): any;
	function $evaluateExpression(expression: string, itemIndex?: number): any;
	function $fromAI(name: string, description?: string, type?: 'string' | 'number' | 'boolean' | 'json', defaultValue?: unknown): any;
	function $fromAi(name: string, description?: string, type?: 'string' | 'number' | 'boolean' | 'json', defaultValue?: unknown): any;
	function $fromai(name: string, description?: string, type?: 'string' | 'number' | 'boolean' | 'json', defaultValue?: unknown): any;
}
export {};
