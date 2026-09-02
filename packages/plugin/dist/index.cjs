"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"), 1);

// ../core/globals.ts
var registry = /* @__PURE__ */ new Map();
var defineContext = (definition) => {
  registry.set(definition.name, definition);
  return definition;
};
var contextNames = () => [...registry.keys()];
var isContextName = (s) => registry.has(s ?? "");
var emptyShape = (context = "nodeParameter") => ({ context, nodes: {} });
var LOOSE = "N8nLooseJson";
var or = (text) => text ?? LOOSE;
var keyUnion = (keys, fallback) => keys && keys.length > 0 ? keys.map((k) => JSON.stringify(k)).join(" | ") : fallback;
var recordOf = (keys, valueType) => keys && keys.length > 0 ? `{ ${keys.map((k) => `${JSON.stringify(k)}: ${valueType}`).join("; ")} }` : `Record<string, ${valueType}>`;
var core = (s) => `
	/** The current date and time as a Luxon DateTime, in the workflow timezone. */
	const $now: DateTime;
	/** Today at midnight as a Luxon DateTime, in the workflow timezone. */
	const $today: DateTime;
	/** Workflow variables, all strings. */
	const $vars: ${recordOf(s.vars, "string")};
	/** Environment variables, when access is allowed. */
	const $env: ${recordOf(s.env, "string")};
	/** External secrets by provider, when enabled. */
	const $secrets: Record<string, Record<string, any>>;
	/** Data about the current execution: id, mode, resume URLs, customData. */
	const $execution: N8nExecution;
	const $evaluation: { runId: string } | undefined;
	/** How the workflow was started. */
	const $mode: N8nMode;
	/** The current workflow: id, name, active. */
	const $workflow: N8nWorkflow;
	/** Queries data with a JMESPath expression. */
	function $jmespath(data: Record<string, any> | any[], query: string): any;
	function $jmesPath(data: Record<string, any> | any[], query: string): any;
	/** Evaluates an expression string at runtime. Returns any. */
	function $evaluateExpression(expression: string, itemIndex?: number): any;`;
var item = (s) => {
  const J = or(s.inputJson);
  const B = keyUnion(s.inputBinaryKeys, "string");
  const P = or(s.parameters);
  const nodeDataMap = Object.entries(s.nodes).map(([name, n]) => `${JSON.stringify(name)}: N8nNodeData<${n.json}, ${keyUnion(n.binaryKeys, "string")}, ${or(n.params)}>;`).join("\n		");
  return `
	interface NodeDataMap {
		${nodeDataMap}
	}
	/** JSON data of the current input item. */
	const $json: ${J};
	/** @deprecated use $json */
	const $data: ${J};
	/** Binary data of the current input item, by property name. */
	const $binary: Record<${B}, N8nBinaryData>;
	/** The current node's input: item, first(), last(), all(), params. */
	const $input: N8nInput<${J}, ${B}, ${P}>;
	/** The current input item, json and binary. */
	const $thisItem: N8nItem<${J}, ${B}>;
	/** Output of another node in the workflow: item, first(), last(), all(), params, isExecuted. */
	function $<K extends keyof NodeDataMap>(nodeName: K, resolveFullItem?: boolean): NodeDataMap[K];
	function $(nodeName?: string, resolveFullItem?: boolean): N8nAnyNodeData;
	/** @deprecated use $('Node') */
	const $node: {
		[K in keyof NodeDataMap]: N8nLegacyNode<NodeDataMap[K]['item']['json'], string, NodeDataMap[K]['params']>;
	} & Record<string, N8nLegacyNode<${LOOSE}, string, ${LOOSE}>>;
	function $items(nodeName?: string, outputIndex?: number, runIndex?: number): Array<N8nItem<${LOOSE}, string>>;
	/** @deprecated */
	function $item(itemIndex: number, runIndex?: number): any;
	/** The current node's parameters, resolved. */
	const $parameter: ${P};
	const $rawParameter: ${P};
	/** Index of the item this expression runs for. */
	const $itemIndex: number;
	/** How many times the current node has run in this execution. */
	const $runIndex: number;
	const $position: number;
	const $thisItemIndex: number;
	const $thisRunIndex: number;
	/** The node the current input came from: name, outputIndex, runIndex. */
	const $prevNode: N8nPrevNode;
	/** Type version of the current node. */
	const $nodeVersion: number;
	const $nodeId: string;
	const $webhookId: string | undefined;
	/** @deprecated use $execution.id */
	const $executionId: string;
	/** @deprecated use $execution.resumeUrl */
	const $resumeWebhookUrl: string;
	/** Tool call context inside AI tool nodes. */
	const $tool: any;
	/** Tools and memory connected to the current AI Agent node. */
	const $agentInfo: N8nAgentInfo;
	function $getPairedItem(destinationNodeName: string, incomingSourceData: unknown, pairedItem: unknown): N8nItem<${LOOSE}, string> | null;
	/** In AI tool nodes: lets the model fill this value. */
	function $fromAI(name: string, description?: string, type?: N8nFromAIType, defaultValue?: unknown): any;
	function $fromAi(name: string, description?: string, type?: N8nFromAIType, defaultValue?: unknown): any;
	function $fromai(name: string, description?: string, type?: N8nFromAIType, defaultValue?: unknown): any;`;
};
var description = (s) => `
	/** The current node's parameters, resolved. */
	const $parameter: ${or(s.parameters)};
	const $rawParameter: ${or(s.parameters)};
	const $nodeVersion: number;
	const $nodeId: string;
	const $self: ${or(s.credentials)};`;
var routing = (s) => `
	/** Decrypted credential fields of the credential used by this node. */
	const $credentials: ${or(s.credentials)};
	/** The current value of the parameter this routing expression belongs to. */
	const $value: ${or(s.value)};
	const $version: number;
	/** The HTTP response: body, headers, statusCode. */
	const $response: N8nHttpResponse<${or(s.response)}>;
	/** One item of the parsed response, in postReceive expressions. */
	const $responseItem: ${or(s.responseItem)};
	/** The HTTP request as sent: url, method, headers, qs, body. */
	const $request: N8nHttpRequest<${or(s.request)}>;
	const $self: ${or(s.credentials)};`;
var pagination = (s) => `
	/** The HTTP request as sent: url, method, headers, qs, body. */
	const $request: N8nHttpRequest<${or(s.request)}>;
	/** The HTTP response: body, headers, statusCode. */
	const $response: N8nHttpResponse<${or(s.response)}>;
	const $version: number;
	/** Number of pages fetched so far, starting at 0. */
	const $pageCount: number;`;
var credential = (s) => `
	const $self: ${or(s.credentials)};`;
var LAYERS = { core, item, description, routing, pagination, credential };
var buildGlobals = (s) => {
  const definition = registry.get(s.context);
  if (!definition) throw new Error(`Unknown expression context "${s.context}"`);
  return `
declare global {${definition.layers.map((l) => LAYERS[l](s)).join("\n")}
}
export {};
`;
};
var nodeParameterContext = defineContext({ name: "nodeParameter", layers: ["core", "item"] });
var httpPaginationContext = defineContext({ name: "httpPagination", layers: ["core", "item", "pagination"] });
var routingContext = defineContext({ name: "routing", layers: ["core", "item", "routing"] });
var descriptionContext = defineContext({ name: "description", layers: ["core", "description"] });
var credentialContext = defineContext({ name: "credential", layers: ["core", "credential"] });

// ../core/service.ts
var SANDBOX_RULES = [
  { pattern: /\.\s*constructor\b/g, message: "Expression contains invalid constructor function call. n8n rejects any '.constructor' access." },
  { pattern: /\b__proto__\b|\.\s*prototype\b/g, message: "n8n blocks prototype access in expressions." },
  { pattern: /\$(?![\w$]|\s*\()/g, message: 'Cannot access "$" without calling it as a function.' },
  { pattern: /\bclass\b[^{]*\bextends\b/g, message: "Cannot use dynamic class extension due to security concerns." }
];
var BLOCK = /\{\{([\s\S]*?)\}\}/g;
var compile = (expression) => {
  if (!expression.startsWith("=")) return { blocks: [], source: "", hasText: true };
  const body = expression.slice(1);
  const blocks = [];
  const lines = [];
  for (const m of body.matchAll(BLOCK)) {
    const i = blocks.length;
    const prefix = `const __r${i} = (`;
    const fileStart = lines.join("\n").length + (i > 0 ? 1 : 0) + prefix.length;
    const start = m.index + 1 + 2;
    blocks.push({ body: m[1], start, end: start + m[1].length, fileStart });
    lines.push(`${prefix}${m[1]});`);
  }
  const hasText = body.replace(BLOCK, "").length > 0;
  return { blocks, source: lines.join("\n"), hasText };
};
var createExpressionService = ({ ts, root }) => {
  const GLOBALS_FILE = `${root}/__expr__/globals.d.ts`;
  const EXPR_FILE = `${root}/__expr__/expr.ts`;
  const LIB_FILES = [`${root}/shapes.d.ts`, `${root}/extensions.d.ts`];
  const files = /* @__PURE__ */ new Map();
  const versions = /* @__PURE__ */ new Map();
  const set = (name, text) => {
    if (files.get(name) === text) return;
    files.set(name, text);
    versions.set(name, (versions.get(name) ?? 0) + 1);
  };
  const options = {
    strict: true,
    target: ts.ScriptTarget.ESNext,
    lib: ["lib.es2023.d.ts"],
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
    noEmit: true
  };
  const host = {
    getCompilationSettings: () => options,
    getScriptFileNames: () => [...files.keys(), ...LIB_FILES],
    getScriptVersion: (f) => String(versions.get(f) ?? 0),
    getScriptSnapshot: (f) => {
      const text = files.get(f) ?? ts.sys.readFile(f);
      return text === void 0 ? void 0 : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => root,
    getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
    fileExists: (f) => files.has(f) || ts.sys.fileExists(f),
    readFile: (f) => files.get(f) ?? ts.sys.readFile(f),
    directoryExists: ts.sys.directoryExists,
    getDirectories: ts.sys.getDirectories,
    readDirectory: ts.sys.readDirectory
  };
  const service = ts.createLanguageService(host, ts.createDocumentRegistry());
  const load = (expression, shape, expected) => {
    set(GLOBALS_FILE, buildGlobals(shape));
    const compiled = compile(expression);
    const single = !compiled.hasText && compiled.blocks.length === 1;
    const check = expected ? `
const __expected: ${expected} = ${single ? "__r0" : "'' as string"};` : "";
    set(EXPR_FILE, compiled.source + check);
    return compiled;
  };
  const analyze = (expression, shape, expected) => {
    const { blocks, hasText } = load(expression, shape, expected);
    if (blocks.length === 0) return { type: JSON.stringify(expression), blocks: [] };
    const program = service.getProgram();
    const checker = program.getTypeChecker();
    const sf = program.getSourceFile(EXPR_FILE);
    const diags = [...service.getSyntacticDiagnostics(EXPR_FILE), ...service.getSemanticDiagnostics(EXPR_FILE)];
    const typed = blocks.map((b, i) => {
      const stmt = sf.statements[i];
      const decl = stmt.declarationList.declarations[0];
      const type2 = checker.typeToString(
        checker.getTypeAtLocation(decl.name),
        void 0,
        ts.TypeFormatFlags.NoTruncation
      );
      const toExpr = (fileOffset) => Math.min(Math.max(fileOffset - b.fileStart, 0), b.body.length) + b.start;
      const errors = diags.filter((d) => d.start !== void 0 && d.start >= stmt.getStart(sf) && d.start <= stmt.getEnd()).map((d) => ({
        message: ts.flattenDiagnosticMessageText(d.messageText, "\n"),
        start: toExpr(d.start),
        end: toExpr(d.start + (d.length ?? 1)),
        code: d.code
      }));
      for (const rule of SANDBOX_RULES) {
        for (const m of b.body.matchAll(rule.pattern)) {
          errors.push({ message: rule.message, start: b.start + m.index, end: b.start + m.index + m[0].length, code: 90001 });
        }
      }
      return { body: b.body, start: b.start, end: b.end, type: type2, errors };
    });
    const type = !hasText && typed.length === 1 ? typed[0].type : "string";
    const checkStmt = expected ? sf.statements[blocks.length] : void 0;
    const slotError = checkStmt ? diags.filter((d) => d.start !== void 0 && d.start >= checkStmt.getStart(sf) && d.start <= checkStmt.getEnd()).map(() => `Expression yields ${type}, slot expects ${expected}.`)[0] : void 0;
    return { type, blocks: typed, ...slotError ? { slotError } : {} };
  };
  const completionsAt = (expression, offset, shape) => {
    const { blocks } = load(expression, shape);
    const block = blocks.find((b) => offset >= b.start && offset <= b.end);
    if (!block) return [];
    const pos = block.fileStart + (offset - block.start);
    const result = service.getCompletionsAtPosition(EXPR_FILE, pos, {});
    return (result?.entries ?? []).filter(
      (e) => e.kind !== ts.ScriptElementKind.warning && e.kind !== ts.ScriptElementKind.keyword
    );
  };
  const virtual = (expression, shape) => {
    const { blocks } = load(expression, shape);
    const blockAt = (offset) => blocks.find((b) => offset >= b.start && offset <= b.end);
    return {
      fileName: EXPR_FILE,
      languageService: service,
      blocks,
      blockAt,
      /** Expression offset → virtual file position, when inside a block. */
      toFile: (offset) => {
        const b = blockAt(offset);
        return b ? b.fileStart + (offset - b.start) : void 0;
      },
      /** Virtual file span → expression span, clipped to the block it belongs to. */
      toExpression: (span) => {
        const b = blocks.find((b2) => span.start >= b2.fileStart && span.start <= b2.fileStart + b2.body.length);
        if (!b) return void 0;
        const start = b.start + (span.start - b.fileStart);
        return { start, length: Math.min(span.length, b.end - start) };
      }
    };
  };
  return { analyze, completionsAt, virtual, globalsFor: buildGlobals };
};

// ../core/shape-from-type.ts
var shapeFromType = (ts, checker, type, fallbackContext) => {
  const isUndefined = (t) => !t || !!(t.flags & ts.TypeFlags.Undefined);
  const prop = (t, name) => {
    const sym = checker.getPropertyOfType(t, name);
    const r = sym && checker.getTypeOfSymbol(sym);
    return isUndefined(r) ? void 0 : r;
  };
  const raw = (t) => checker.typeToString(t, void 0, ts.TypeFormatFlags.NoTruncation);
  const text = (t) => {
    if (t.isUnion()) return [...new Set(t.types.map(text))].join(" | ");
    if (t.isLiteral() || t.flags & ts.TypeFlags.BooleanLiteral) return raw(checker.getBaseTypeOfLiteralType(t));
    if (checker.isArrayType(t) || checker.isTupleType(t)) {
      const members = [...new Set(checker.getTypeArguments(t).map(text))];
      return members.length === 0 ? "unknown[]" : `Array<${members.join(" | ")}>`;
    }
    if (t.flags & ts.TypeFlags.Object && checker.getSignaturesOfType(t, ts.SignatureKind.Call).length === 0) {
      const props = checker.getPropertiesOfType(t);
      if (props.length > 0) {
        return `{ ${props.map((p) => `${JSON.stringify(p.name)}: ${text(checker.getTypeOfSymbol(p))}`).join("; ")} }`;
      }
    }
    return raw(t);
  };
  const optText = (t) => t ? text(t) : void 0;
  const literals = (t) => {
    if (!t) return void 0;
    const elements = checker.isTupleType(t) || checker.isArrayType(t) ? checker.getTypeArguments(t) : [t];
    const flat = elements.flatMap((e) => e.isUnion() ? e.types : [e]);
    return flat.every((e) => e.isStringLiteral()) ? flat.map((e) => e.value) : void 0;
  };
  const contextType = prop(type, "context");
  const contextValue = contextType?.isStringLiteral() ? contextType.value : void 0;
  const context = isContextName(contextValue) ? contextValue : fallbackContext;
  const input = prop(type, "input");
  const nodesType = prop(type, "nodes");
  const nodes = Object.fromEntries(
    (nodesType ? checker.getPropertiesOfType(nodesType) : []).flatMap((sym) => {
      const n = checker.getTypeOfSymbol(sym);
      const json = prop(n, "json");
      return json ? [[sym.name, { json: text(json), binaryKeys: literals(prop(n, "binaryKeys")), params: optText(prop(n, "params")) }]] : [];
    })
  );
  return {
    context,
    inputJson: input ? optText(prop(input, "json")) : void 0,
    inputBinaryKeys: input ? literals(prop(input, "binaryKeys")) : void 0,
    nodes,
    parameters: optText(prop(type, "parameters")),
    credentials: optText(prop(type, "credentials")),
    value: optText(prop(type, "value")),
    response: optText(prop(type, "response")),
    responseItem: optText(prop(type, "responseItem")),
    request: optText(prop(type, "request")),
    vars: literals(prop(type, "vars")),
    env: literals(prop(type, "env"))
  };
};

// ../core/static-shape.ts
var SCALAR = {
  string: "string",
  number: "number",
  boolean: "boolean",
  dateTime: "string",
  color: "string",
  hidden: "string",
  json: "any",
  notice: "string",
  credentialsSelect: "string",
  resourceLocator: "{ __rl: true; mode: string; value: string | number }",
  resourceMapper: "{ mappingMode: string; value: Record<string, any> | null; schema: any[] }",
  filter: '{ conditions: any[]; combinator: "and" | "or"; options: any }',
  assignmentCollection: "{ assignments: Array<{ id: string; name: string; value: any; type: string }> }"
};
var assignment = (ts, obj, name) => obj.properties.find(
  (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === name
);
var stringProp = (ts, obj, name) => {
  const p = assignment(ts, obj, name);
  return p && ts.isStringLiteralLike(p.initializer) ? p.initializer.text : void 0;
};
var arrayProp = (ts, obj, name) => {
  const p = assignment(ts, obj, name);
  return p && ts.isArrayLiteralExpression(p.initializer) ? p.initializer : void 0;
};
var optionValues = (ts, options) => {
  if (!options) return void 0;
  const values = options.elements.flatMap((e) => {
    if (!ts.isObjectLiteralExpression(e)) return ["any"];
    const p = assignment(ts, e, "value");
    if (!p) return ["any"];
    const v = p.initializer;
    if (ts.isStringLiteralLike(v)) return [JSON.stringify(v.text)];
    if (ts.isNumericLiteral(v)) return [v.text];
    if (v.kind === ts.SyntaxKind.TrueKeyword || v.kind === ts.SyntaxKind.FalseKeyword) return [v.getText()];
    return ["any"];
  });
  return values.length > 0 && !values.includes("any") ? [...new Set(values)].join(" | ") : void 0;
};
var propertyType = (ts, prop) => {
  const type = stringProp(ts, prop, "type") ?? "string";
  const options = arrayProp(ts, prop, "options");
  switch (type) {
    case "options":
      return optionValues(ts, options) ?? "string";
    case "multiOptions":
      return `Array<${optionValues(ts, options) ?? "string"}>`;
    case "collection":
      return options ? `Partial<${propertiesType(ts, options)}>` : "Record<string, any>";
    case "fixedCollection": {
      if (!options) return "Record<string, any>";
      const multiple = assignment(ts, prop, "typeOptions")?.initializer.getText().includes("multipleValues") ?? false;
      const groups = options.elements.flatMap((e) => {
        if (!ts.isObjectLiteralExpression(e)) return [];
        const name = stringProp(ts, e, "name");
        const values = arrayProp(ts, e, "values");
        if (!name || !values) return [];
        const t = propertiesType(ts, values);
        return [`${JSON.stringify(name)}: ${multiple ? `Array<${t}>` : t}`];
      });
      return groups.length > 0 ? `{ ${groups.join("; ")} }` : "Record<string, any>";
    }
    default:
      return SCALAR[type] ?? "any";
  }
};
var propertiesType = (ts, properties) => {
  const members = [];
  let open = false;
  for (const e of properties.elements) {
    const name = ts.isObjectLiteralExpression(e) ? stringProp(ts, e, "name") : void 0;
    if (!ts.isObjectLiteralExpression(e) || !name) {
      open = true;
      continue;
    }
    members.push(`${JSON.stringify(name)}: ${propertyType(ts, e)}`);
  }
  return `{ ${[...members, ...open ? ["[key: string]: any"] : []].join("; ")} }`;
};
var enclosingParameters = (ts, node) => {
  for (let cur = node.parent; cur; cur = cur.parent) {
    if (ts.isObjectLiteralExpression(cur)) {
      const props = arrayProp(ts, cur, "properties");
      if (props) return propertiesType(ts, props);
    }
  }
  return void 0;
};
var enclosingValue = (ts, node) => {
  for (let cur = node.parent; cur; cur = cur.parent) {
    if (ts.isObjectLiteralExpression(cur) && stringProp(ts, cur, "name") && stringProp(ts, cur, "type")) {
      return propertyType(ts, cur);
    }
  }
  return void 0;
};

// ../core/expr.ts
var resolvedKey = (context, expression) => `${context}::${expression}`;
var make = (_name) => (expression) => expression;
var expr = Object.assign(
  make("nodeParameter"),
  Object.fromEntries(contextNames().map((n) => [n, make(n)]))
);

// ../core/scan.ts
var isContext = isContextName;
var PORTABLE_NAMES = /* @__PURE__ */ new Set(["Array", "ReadonlyArray", "Record", "Partial", "Readonly", "Date"]);
var portable = (text) => {
  const stripped = text.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '""').replace(/[\w$]+\s*\??:/g, ":");
  const names = stripped.match(/\b[A-Z]\w*\b/g) ?? [];
  return names.every((n) => PORTABLE_NAMES.has(n)) ? text : void 0;
};
var safeExpected = portable;
var brandOf = (ts, checker, type) => {
  if (!type) return void 0;
  for (const t of type.isUnion() ? type.types : [type]) {
    const brand = checker.getPropertyOfType(t, "__n8n");
    if (!brand) continue;
    const bt = checker.getNonNullableType(checker.getTypeOfSymbol(brand));
    const ctx = checker.getPropertyOfType(bt, "context");
    const val = checker.getPropertyOfType(bt, "type");
    const nameSym = ctx && checker.getPropertyOfType(checker.getTypeOfSymbol(ctx), "name");
    const nameType = nameSym && checker.getTypeOfSymbol(nameSym);
    if (!nameType?.isStringLiteral() || !isContext(nameType.value) || !val) continue;
    return { context: nameType.value, expected: checker.typeToString(checker.getTypeOfSymbol(val), void 0, ts.TypeFormatFlags.NoTruncation) };
  }
  return void 0;
};
var staticShape = (ts, node, context) => ({
  ...emptyShape(context),
  parameters: enclosingParameters(ts, node),
  value: context === "routing" ? enclosingValue(ts, node) : void 0
});
var exprCallContext = (ts, callee) => {
  if (ts.isIdentifier(callee) && callee.text === "expr") return "nodeParameter";
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === "expr") {
    return isContext(callee.name.text) ? callee.name.text : void 0;
  }
  return void 0;
};
var literalBehind = (ts, checker, arg) => {
  if (ts.isStringLiteralLike(arg)) return { literal: arg, context: void 0 };
  if (!ts.isIdentifier(arg)) return void 0;
  const decl = checker.getSymbolAtLocation(arg)?.valueDeclaration;
  if (!decl || !ts.isVariableDeclaration(decl) || !decl.initializer || !ts.isCallExpression(decl.initializer)) return void 0;
  const init2 = decl.initializer;
  const first = init2.arguments[0];
  if (!first || !ts.isStringLiteralLike(first)) return void 0;
  return { literal: first, context: exprCallContext(ts, init2.expression) };
};
var findExpressions = (ts, sf, checker) => {
  const found = [];
  const push = (f) => found.push({ ...f, expression: f.node.text, textStart: f.node.getStart(sf) + 1 });
  const pushResolve = (behind, dataType, site) => {
    const context = behind.context ?? "nodeParameter";
    const shape = shapeFromType(ts, checker, dataType, context);
    push({
      kind: "resolve",
      node: behind.literal,
      context: shape.context,
      shape,
      reportAt: { start: site.getStart(sf), length: site.getWidth(sf) },
      dataText: portable(checker.typeToString(dataType, void 0, ts.TypeFormatFlags.NoTruncation))
    });
  };
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const [first, second] = node.arguments;
      const ctx = first && exprCallContext(ts, callee);
      if (ctx && ts.isStringLiteralLike(first)) {
        push({ kind: "call", node: first, context: ctx, shape: staticShape(ts, first, ctx) });
        ts.forEachChild(node, visit);
        return;
      }
      if (ts.isIdentifier(callee) && callee.text === "resolve" && first && second) {
        const behind = literalBehind(ts, checker, first);
        if (behind) {
          pushResolve(behind, checker.getTypeAtLocation(second), node);
        }
      }
    } else if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && node.typeName.text === "Resolve") {
      const [exprArg, dataArg] = node.typeArguments ?? [];
      if (exprArg && dataArg && ts.isTypeQueryNode(exprArg) && ts.isIdentifier(exprArg.exprName)) {
        const behind = literalBehind(ts, checker, exprArg.exprName);
        if (behind) pushResolve(behind, checker.getTypeFromTypeNode(dataArg), node);
      }
    } else if (ts.isStringLiteralLike(node) && node.text.startsWith("=")) {
      const brand = brandOf(ts, checker, checker.getContextualType(node));
      if (brand) {
        push({
          kind: "slot",
          node,
          context: brand.context,
          shape: staticShape(ts, node, brand.context),
          expected: safeExpected(brand.expected)
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
};
var resolvedType = (a, against = "definition") => {
  const failed = a.blocks.some((b) => b.errors.length > 0) || !!a.slotError;
  if (!failed) return a.type;
  return against === "data" ? "N8nResolveError" : "N8nInvalidExpression";
};
var renderResolved = (entries) => {
  const lines = [...entries.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, e]) => {
    const strict = e.strict.map(([d, t]) => `[${d}, ${t}]`).join(", ");
    return `		${JSON.stringify(key)}: { loose: ${e.loose ?? "any"}; strict: [${strict}] };`;
  });
  return `// Generated from expr() and resolve() sites. Do not edit.
declare global {
	interface N8nResolvedTypes {
${lines.join("\n")}
	}
}
export {};
`;
};
var lookupEntries = (items) => {
  const out = /* @__PURE__ */ new Map();
  const entry = (key) => out.get(key) ?? out.set(key, { strict: [] }).get(key);
  for (const it of items) {
    if (it.kind === "slot") continue;
    const key = resolvedKey(it.context, it.expression);
    if (it.kind === "call") entry(key).loose = resolvedType(it.analysis);
    else if (it.dataText && !entry(key).strict.some(([d]) => d === it.dataText)) {
      entry(key).strict.push([it.dataText, resolvedType(it.analysis, "data")]);
    }
  }
  for (const e of out.values()) {
    if (e.loose === "N8nInvalidExpression") e.strict = e.strict.map(([d]) => [d, e.loose]);
  }
  return out;
};

// src/index.ts
var decorated = /* @__PURE__ */ new WeakSet();
var init = (modules) => {
  const ts = modules.typescript;
  const create = (info) => {
    if (decorated.has(info.project)) return info.languageService;
    decorated.add(info.project);
    const ls = info.languageService;
    const log = (m) => info.project.projectService.logger.info(`[n8n-expression] ${m}`);
    const root = import_node_path.default.resolve(__dirname, "../../core");
    const projectDir = info.project.getCurrentDirectory();
    const service = createExpressionService({ ts, root });
    const cache = /* @__PURE__ */ new Map();
    const itemsFor = (fileName) => {
      const version = info.languageServiceHost.getScriptVersion(fileName);
      const hit = cache.get(fileName);
      if (hit?.version === version) return hit.items;
      const program = ls.getProgram();
      const sf = program?.getSourceFile(fileName);
      if (!program || !sf) return [];
      const found = findExpressions(ts, sf, program.getTypeChecker());
      const items = found.map((f) => {
        const resolved = f.kind === "call" ? found.find((o) => o.kind === "resolve" && o.expression === f.expression && o.context === f.context) : void 0;
        const analysis = service.analyze(f.expression, f.shape, f.expected);
        const hoverShape = resolved?.shape ?? f.shape;
        const hoverAnalysis = resolved ? service.analyze(f.expression, hoverShape) : analysis;
        return { ...f, analysis, hoverShape, hoverAnalysis };
      });
      cache.set(fileName, { version, items });
      syncResolved(fileName, items);
      return items;
    };
    const itemAt = (fileName, position) => itemsFor(fileName).find((it) => !it.reportAt && position >= it.textStart && position <= it.textStart + it.expression.length);
    const blockAt = (it, position) => it.analysis.blocks.find((b) => position >= it.textStart + b.start && position <= it.textStart + b.end);
    const resolvedByFile = /* @__PURE__ */ new Map();
    const resolvedPath = import_node_path.default.join(projectDir, "n8n-resolved.d.ts");
    const syncResolved = (fileName, items) => {
      const mine = items.filter((i) => i.kind !== "slot");
      if (mine.length === 0 && !resolvedByFile.has(fileName)) return;
      resolvedByFile.set(fileName, mine);
      const all = lookupEntries([...resolvedByFile.values()].flat());
      const next = renderResolved(all);
      const current = (0, import_node_fs.existsSync)(resolvedPath) ? (0, import_node_fs.readFileSync)(resolvedPath, "utf8") : "";
      if (next !== current) {
        (0, import_node_fs.writeFileSync)(resolvedPath, next);
        log(`wrote ${resolvedPath} (${all.size} expressions)`);
      }
    };
    const proxy = /* @__PURE__ */ Object.create(null);
    for (const k of Object.keys(ls)) {
      const fn = ls[k];
      proxy[k] = (...args) => fn.apply(ls, args);
    }
    proxy.getSemanticDiagnostics = (fileName) => {
      const prior = ls.getSemanticDiagnostics(fileName);
      const sf = ls.getProgram()?.getSourceFile(fileName);
      if (!sf) return prior;
      const diag = (start, length, messageText, code) => ({
        file: sf,
        start,
        length,
        messageText,
        category: ts.DiagnosticCategory.Error,
        code,
        ...code === 90001 ? { source: "n8n" } : {}
      });
      const extra = itemsFor(fileName).flatMap((it) => {
        if (it.reportAt) {
          return it.analysis.blocks.flatMap(
            (b) => b.errors.map((e) => diag(it.reportAt.start, it.reportAt.length, `${e.message} (in '${it.expression}' against this data)`, e.code))
          );
        }
        const inBlocks = it.analysis.blocks.flatMap(
          (b) => b.errors.map((e) => diag(it.textStart + e.start, Math.max(e.end - e.start, 1), e.message, e.code))
        );
        const slot = it.analysis.slotError ? [diag(it.node.getStart(), it.node.getWidth(), it.analysis.slotError, 2322)] : [];
        return [...inBlocks, ...slot];
      });
      return [...prior, ...extra];
    };
    const withResolveSummary = (fileName, position) => {
      const prior = ls.getQuickInfoAtPosition(fileName, position);
      const shown = prior?.displayParts?.map((p) => p.text).join("") ?? "";
      const m = /\b(?:Expr|InvalidExpr)<(\w+)Context, "((?:[^"\\]|\\.)*)">/.exec(shown);
      if (!prior || !m) return prior;
      const text = JSON.parse(`"${m[2]}"`);
      const sites = [...resolvedByFile.values()].flat().filter((i) => i.kind === "resolve" && i.expression === text);
      const loose = [...resolvedByFile.values()].flat().find((i) => i.kind === "call" && i.expression === text);
      const types = [...new Set(sites.map((s) => s.analysis.type))];
      const summary = sites.length ? `Resolves to \`${types.join(" | ")}\` against ${sites.length} data set${sites.length === 1 ? "" : "s"}.` : loose && loose.analysis.type !== "any" ? `Evaluates to \`${loose.analysis.type}\`. Not resolved against data.` : "Not resolved against data; the type depends on runtime input.";
      return { ...prior, documentation: [...prior.documentation ?? [], { text: summary, kind: "text" }] };
    };
    proxy.getQuickInfoAtPosition = (fileName, position) => {
      const it = itemAt(fileName, position);
      if (!it) return withResolveSummary(fileName, position);
      const offset = position - it.textStart;
      const v = service.virtual(it.expression, it.hoverShape);
      const info2 = (label, name, type, span) => ({
        kind: ts.ScriptElementKind.string,
        kindModifiers: "",
        textSpan: span,
        displayParts: [
          { text: "(", kind: "punctuation" },
          { text: label, kind: "text" },
          { text: ")", kind: "punctuation" },
          { text: " ", kind: "space" },
          { text: name, kind: "text" },
          { text: ":", kind: "punctuation" },
          { text: " ", kind: "space" },
          { text: type, kind: "keyword" }
        ]
      });
      const analysed = (b) => it.hoverAnalysis.blocks.find((a) => a.start === b.start);
      const block = v.blockAt(offset);
      if (block) {
        const pos = v.toFile(offset);
        const inner = v.languageService.getQuickInfoAtPosition(v.fileName, pos);
        const span = inner && v.toExpression(inner.textSpan);
        if (inner && span) return { ...inner, textSpan: { start: it.textStart + span.start, length: span.length } };
        const a = analysed(block);
        return info2("block", `{{ ${block.body.trim()} }}`, a?.type ?? "unknown", { start: it.textStart + block.start - 2, length: block.body.length + 4 });
      }
      const delimited = v.blocks.find((b) => offset >= b.start - 2 && offset < b.start || offset > b.end && offset <= b.end + 2);
      if (delimited) {
        const a = analysed(delimited);
        return info2("block", `{{ ${delimited.body.trim()} }}`, a?.type ?? "unknown", { start: it.textStart + delimited.start - 2, length: delimited.body.length + 4 });
      }
      return info2("expression", it.context, it.hoverAnalysis.type, { start: it.node.getStart(), length: it.node.getWidth() });
    };
    const forward = (fileName, position, inner, fallback) => {
      const it = itemAt(fileName, position);
      if (!it) return fallback();
      const v = service.virtual(it.expression, it.hoverShape);
      const pos = v.toFile(position - it.textStart);
      return pos === void 0 ? fallback() : inner(v, pos);
    };
    proxy.getSignatureHelpItems = (fileName, position, options) => forward(
      fileName,
      position,
      (v, pos) => {
        const help = v.languageService.getSignatureHelpItems(v.fileName, pos, options);
        const span = help && v.toExpression(help.applicableSpan);
        const it = itemAt(fileName, position);
        return help && span ? { ...help, applicableSpan: { start: it.textStart + span.start, length: span.length } } : void 0;
      },
      () => ls.getSignatureHelpItems(fileName, position, options)
    );
    proxy.getCompletionEntryDetails = (fileName, position, entryName, formatOptions, source, preferences, data) => forward(
      fileName,
      position,
      (v, pos) => v.languageService.getCompletionEntryDetails(v.fileName, pos, entryName, formatOptions, source, preferences, data),
      () => ls.getCompletionEntryDetails(fileName, position, entryName, formatOptions, source, preferences, data)
    );
    proxy.getCodeFixesAtPosition = (fileName, start, end, errorCodes, formatOptions, preferences) => {
      const prior = ls.getCodeFixesAtPosition(fileName, start, end, errorCodes, formatOptions, preferences);
      const it = itemAt(fileName, start);
      if (!it || it.reportAt) return prior;
      const v = service.virtual(it.expression, it.hoverShape);
      const from = v.toFile(start - it.textStart);
      const to = v.toFile(end - it.textStart);
      if (from === void 0 || to === void 0) return prior;
      const fixes = v.languageService.getCodeFixesAtPosition(v.fileName, from, to, errorCodes, formatOptions, preferences);
      const mapped = fixes.flatMap((fix) => {
        const changes = fix.changes.map((c) => ({
          fileName,
          textChanges: c.textChanges.map((tc) => {
            const span = v.toExpression(tc.span);
            return span ? { ...tc, span: { start: it.textStart + span.start, length: span.length } } : void 0;
          })
        }));
        if (changes.some((c) => c.textChanges.some((tc) => tc === void 0))) return [];
        return [{ ...fix, changes: changes.map((c) => ({ ...c, textChanges: c.textChanges.filter((tc) => tc !== void 0) })), fixAllDescription: void 0, fixId: void 0 }];
      });
      return [...prior, ...mapped];
    };
    proxy.getCompletionsAtPosition = (fileName, position, options, formatting) => {
      const it = itemAt(fileName, position);
      const block = it && blockAt(it, position);
      if (!it || !block) return ls.getCompletionsAtPosition(fileName, position, options, formatting);
      const entries = service.completionsAt(it.expression, position - it.textStart, it.hoverShape);
      return {
        isGlobalCompletion: false,
        isMemberCompletion: true,
        isNewIdentifierLocation: false,
        entries
      };
    };
    proxy.provideInlayHints = (fileName, span, preferences) => {
      const prior = ls.provideInlayHints(fileName, span, preferences);
      const visible = itemsFor(fileName).filter(
        (it) => !it.reportAt && it.node.getEnd() >= span.start && it.node.getStart() <= span.start + span.length
      );
      const typeHints = visible.map((it) => ({
        text: `: ${it.hoverAnalysis.type}`,
        position: it.node.getEnd(),
        kind: ts.InlayHintKind.Type,
        paddingLeft: true
      }));
      const inner = visible.flatMap((it) => {
        const v = service.virtual(it.expression, it.hoverShape);
        return v.blocks.flatMap(
          (b) => v.languageService.provideInlayHints(v.fileName, { start: b.fileStart, length: b.body.length }, preferences).map((h) => ({ ...h, position: it.textStart + b.start + (h.position - b.fileStart) }))
        );
      });
      return [...prior, ...typeHints, ...inner];
    };
    proxy.getEncodedSemanticClassifications = (fileName, span, format) => {
      const prior = ls.getEncodedSemanticClassifications(fileName, span, format);
      const spans = [...prior.spans];
      for (const it of itemsFor(fileName)) {
        if (it.reportAt || it.node.getEnd() < span.start || it.node.getStart() > span.start + span.length) continue;
        const v = service.virtual(it.expression, it.hoverShape);
        for (const b of v.blocks) {
          const inner = v.languageService.getEncodedSemanticClassifications(v.fileName, { start: b.fileStart, length: b.body.length }, format);
          for (let i = 0; i + 2 < inner.spans.length; i += 3) {
            spans.push(it.textStart + b.start + (inner.spans[i] - b.fileStart), inner.spans[i + 1], inner.spans[i + 2]);
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
var index_default = init;
