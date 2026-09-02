/// <reference path="./shapes.d.ts" />
/// <reference path="./extensions.d.ts" />
export { expr, resolve, resolvedKey, type Expression, type Resolved, type DataFor } from './expr.ts';
export { expression, type ExpressionContext as LambdaContext } from './context.ts';
export type { ExpressionContext, RuntimeTypes, RuntimeShape, Json, NodeRuntime } from './globals.ts';
export { EXPRESSION_CONTEXTS, shapeFromValues, emptyShape, buildGlobals } from './globals.ts';
