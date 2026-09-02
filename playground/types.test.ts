// Type tests: plain tsc, no library. Each entry fails to compile when the typing regresses.
// Slot and sandbox behaviour are diagnostics, not types: `pnpm gen-resolved --fail-on-error`
// covers those.
import {
	expression,
	resolve,
	type Expr,
	type Expression,
	type HttpPaginationContext,
	type InvalidExpr,
	type LambdaExpression,
	type NodeParameterContext,
	type Resolve,
} from '@n8n/expression-types';
import { badGlobal, loose, nextUrl, total, typo } from './demo.ts';
import { paginationSample, sample } from './sample-data.ts';

type Expect<T extends true> = T;
type ExpectFalse<T extends false> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type IsAny<T> = 0 extends 1 & T ? true : false;

const lambda = expression(({ $json }) => $json.n * 2, sample);

export type Cases = [
	Expect<Equal<typeof total, Expr<NodeParameterContext, '={{ $input.all().map((i) => i.json.n).sum() }}'>>>,
	Expect<Equal<typeof badGlobal, InvalidExpr<NodeParameterContext, '={{ $pageCount }}'>>>,
	Expect<Equal<typeof nextUrl, Expr<HttpPaginationContext, '={{ $response.body.next }}'>>>,
	Expect<Equal<Resolve<typeof nextUrl, typeof paginationSample>, string>>,
	Expect<Equal<Resolve<typeof nextUrl, { context: 'httpPagination'; response: { items: number[] } }>, N8nResolveError>>,
	Expect<Equal<Resolve<typeof badGlobal, typeof sample>, N8nInvalidExpression>>,
	Expect<Equal<ReturnType<typeof resolve<typeof total, typeof sample>>, number>>,
	Expect<IsAny<Resolve<typeof loose, typeof sample>>>,
	ExpectFalse<Equal<Resolve<typeof loose, typeof sample>, number>>,
	Expect<Equal<typeof lambda, LambdaExpression<number>>>,
	Expect<Equal<Expression<string> extends string ? true : false, true>>,
	Expect<Equal<N8nResolveError extends string ? true : false, false>>,
];

// @ts-expect-error N8nResolveError is not a string
export const s: string = resolve(typo, sample);
// @ts-expect-error toUppercase does not exist on string
export const l = expression(({ $json }) => $json.test.toUppercase(), sample);
