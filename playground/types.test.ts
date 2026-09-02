// Type tests, no library. Each entry fails to compile when the typing regresses. They run
// through `pnpm typecheck`; `pnpm typegen` reports the diagnostics that are not types:
// slot mismatches, $parameter typos, sandbox rules.
import {
	expr,
	resolve,
	type DescriptionContext,
	type Expr,
	type Expression,
	type HttpPaginationContext,
	type InvalidExpr,
	type LambdaExpr,
	type NodeParameterContext,
	type Resolve,
} from '@n8n/expression-types';
import { badGlobal, loose, nextUrl, total, typo } from './demo.ts';
import { paginationSample, sample } from './sample-data.ts';

type Expect<T extends true> = T;
type ExpectFalse<T extends false> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
	? true
	: false;
type IsAny<T> = 0 extends 1 & T ? true : false;

const lambda = expr(({ $json }) => $json.n * 2);

export type Cases = [
	Expect<
		Equal<
			typeof total,
			Expr<NodeParameterContext, '={{ $input.all().map((i) => i.json.n).sum() }}'>
		>
	>,
	Expect<Equal<typeof badGlobal, InvalidExpr<NodeParameterContext, '={{ $pageCount }}'>>>,
	Expect<Equal<typeof nextUrl, Expr<HttpPaginationContext, '={{ $response.body.next }}'>>>,
	Expect<Equal<Resolve<typeof nextUrl, typeof paginationSample>, string>>,
	Expect<
		Equal<
			Resolve<typeof nextUrl, { context: 'httpPagination'; response: { items: number[] } }>,
			N8nResolveError
		>
	>,
	Expect<Equal<Resolve<typeof badGlobal, typeof sample>, N8nInvalidExpression>>,
	Expect<Equal<ReturnType<typeof resolve<typeof total, typeof sample>>, number>>,
	Expect<IsAny<Resolve<typeof loose, {}>>>, // no data: loose stays any
	Expect<Equal<Resolve<typeof loose, typeof sample>, N8nResolveError>>, // real data: $json.whatever does not exist
	ExpectFalse<Equal<Resolve<typeof loose, typeof sample>, number>>,
	Expect<Equal<typeof lambda, LambdaExpr<NodeParameterContext, number>>>,
	Expect<Equal<Resolve<typeof lambda, typeof sample>, number>>, // lambdas carry their type; data does not re-check them
	Expect<IsAny<Resolve<typeof looseLambda, typeof sample>>>,
	Expect<Equal<Expression<string> extends string ? true : false, true>>,
	Expect<Equal<N8nResolveError extends string ? true : false, false>>,
];

// @ts-expect-error N8nResolveError is not a string
export const s: string = resolve(typo, sample);
// @ts-expect-error toISo does not exist on DateTime
export const l = expr(({ $now }) => $now.toISo());
export const looseLambda = expr(({ $json }) => $json.test.toUppercase()); // no data: $json is loose

// Either form fills a slot; TypeScript itself checks the yielded type and the context.
export const slotLambda: Expression<number, NodeParameterContext> = lambda;
export const slotString: Expression<number, NodeParameterContext> = total;
export const slotLiteral: Expression<number, NodeParameterContext> = '={{ 1 }}';
// @ts-expect-error a number lambda cannot fill a string slot
export const slotLambdaType: Expression<string, NodeParameterContext> = lambda;
// @ts-expect-error a node-parameter lambda cannot fill a description slot
export const slotLambdaContext: Expression<number, DescriptionContext> = lambda;
// @ts-expect-error the string form is checked the same way once generated
export const slotStringType: Expression<string, NodeParameterContext> = total;
// @ts-expect-error a pagination expression does not fit a node-parameter slot, superset or not
export const slotSuperset: Expression<string, NodeParameterContext> = nextUrl;
// @ts-expect-error invalid text fits no slot
export const slotInvalid: Expression<string, NodeParameterContext> = badGlobal;
