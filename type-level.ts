// Type-level resolver for n8n expressions against a typed $json.
// Paste into the TypeScript playground; hover the `Check*` types or read the errors.

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

type Invalid<Msg extends string> = { readonly __invalid: Msg };

// ---------- expression → segments ----------

type Segment = { text: string } | { expr: string };

type Segments<S extends string> = string extends S
	? Segment[]
	: S extends `${infer Before}{{${infer Inner}}}${infer After}`
	? [...(Before extends '' ? [] : [{ text: Before }]), { expr: Inner }, ...Segments<After>]
	: S extends ''
		? []
		: [{ text: S }];

type Trim<S extends string> = string extends S
	? string
	: S extends ` ${infer R}` | `\n${infer R}` | `\t${infer R}`
	? Trim<R>
	: S extends `${infer R} ` | `${infer R}\n` | `${infer R}\t`
		? Trim<R>
		: S;

// ---------- path walking ----------

type Unquote<S extends string> = S extends `'${infer K}'` | `"${infer K}"` ? K : S;

type PathKeys<P extends string, Acc extends string[] = []> = string extends P
	? string[]
	: P extends ''
		? Acc
		: P extends `.${infer R}`
			? PathKeys<R, Acc>
			: P extends `[${infer I}]${infer R}`
				? PathKeys<R, [...Acc, Unquote<I>]>
				: P extends `${infer K}.${infer R}`
					? K extends `${infer K1}[${infer Rest}`
						? PathKeys<`[${Rest}.${R}`, [...Acc, K1]>
						: PathKeys<R, [...Acc, K]>
					: P extends `${infer K}[${infer R}`
						? PathKeys<`[${R}`, [...Acc, K]>
						: [...Acc, P];

type Prop<T, K extends string> = T extends readonly (infer E)[]
	? K extends `${number}`
		? E
		: Invalid<`"${K}" is not an array index`>
	: T extends object
		? K extends keyof T
			? T[K]
			: Invalid<`Unknown key "${K}"`>
		: Invalid<`Cannot read "${K}" of ${T extends null ? 'null' : 'a primitive'}`>;

type Walk<T, Keys extends string[]> = Keys extends [infer K extends string, ...infer R extends string[]]
	? Walk<Prop<T, K>, R>
	: T;

// ---------- {{ ... }} body → type ----------

type Head<S extends string> = S extends `${infer C}${string}` ? C : '';

// `infer Keys` forces PathKeys to resolve before Walk sees it. Passing
// PathKeys<Path> straight in makes TS compute its constraint, which recurses forever.
type Eval<X extends string, J> = X extends '$json'
	? J
	: X extends `$json${infer Path}`
		? Head<Path> extends '.' | '['
			? PathKeys<Path> extends infer Keys extends string[]
				? Walk<J, Keys>
				: never
			: Invalid<`Unsupported expression "${X}"`>
		: Invalid<`Unsupported expression "${X}"`>;

// ---------- public entry ----------

type Resolve<E extends string, J extends Json> = E extends `=${infer Body}`
	? Segments<Body> extends [{ expr: infer X extends string }]
		? Eval<Trim<X>, J>
		: string
	: E;

// ---------- runtime counterpart ----------

const BLOCK = /\{\{([\s\S]*?)\}\}/g;

const pathKeys = (path: string): string[] =>
	path
		.split(/\.|\[|\]/)
		.filter((k) => k !== '')
		.map((k) => k.replace(/^['"]|['"]$/g, ''));

const evalBlock = (body: string, json: Json): Json | undefined => {
	const x = body.trim();
	if (!x.startsWith('$json')) throw new Error(`Unsupported expression "${x}"`);
	return pathKeys(x.slice('$json'.length)).reduce<Json | undefined>((acc, key) => {
		if (acc === null || acc === undefined || typeof acc !== 'object') {
			throw new Error(`Cannot read "${key}" of ${acc === null ? 'null' : 'a primitive'}`);
		}
		if (Array.isArray(acc)) return acc[Number(key)];
		if (!(key in acc)) throw new Error(`Unknown key "${key}"`);
		return acc[key];
	}, json);
};

export function resolveExpression<const E extends string, const J extends Json>(
	expression: E,
	json: J,
): Resolve<E, J> {
	type R = Resolve<E, J>;
	if (!expression.startsWith('=')) return expression as R;
	const body = expression.slice(1);
	const single = /^\{\{([\s\S]*?)\}\}$/.exec(body);
	if (single && !body.slice(2).includes('{{')) return evalBlock(single[1], json) as R;
	return body.replace(BLOCK, (_, inner: string) => String(evalBlock(inner, json))) as R;
}

const data = {
	foo: 'hi',
	n: 1,
	bar: { items: [{ id: 'a' }] },
} as const satisfies Json;

// Not called: the last line throws at runtime, which is the point of the type.
function usage() {
	const s: 'hi' = resolveExpression('={{$json.foo}}', data);
	const n: 1 = resolveExpression('={{$json.n}}', data);
	const id: 'a' = resolveExpression('={{$json.bar.items[0].id}}', data);
	const mixed: string = resolveExpression('=n is {{$json.n}}', data);
	const literal: 'plain' = resolveExpression('plain', data);
	// @ts-expect-error missing key resolves to Invalid<...>
	const bad: string = resolveExpression('={{$json.missing}}', data);
	return [s, n, id, mixed, literal, bad];
}

// ---------- checks ----------

type Expect<T extends true> = T;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type J = {
	foo: string;
	n: number;
	ok: boolean;
	nothing: null;
	list: number[];
	bar: { baz: { deep: boolean }; items: { id: string }[] };
};

type Checks = [
	Expect<Equal<Resolve<'plain text', J>, 'plain text'>>,
	Expect<Equal<Resolve<'=plain text', J>, string>>,
	Expect<Equal<Resolve<'={{$json}}', J>, J>>,
	Expect<Equal<Resolve<'={{$json.foo}}', J>, string>>,
	Expect<Equal<Resolve<'={{ $json.n }}', J>, number>>,
	Expect<Equal<Resolve<'={{$json.bar.baz}}', J>, { deep: boolean }>>,
	Expect<Equal<Resolve<'={{$json.bar.baz.deep}}', J>, boolean>>,
	Expect<Equal<Resolve<'={{$json.nothing}}', J>, null>>,
	Expect<Equal<Resolve<'={{$json.list[0]}}', J>, number>>,
	Expect<Equal<Resolve<'={{$json.bar.items[0].id}}', J>, string>>,
	Expect<Equal<Resolve<"={{$json['foo']}}", J>, string>>,
	Expect<Equal<Resolve<'=foo {{$json.n}}', J>, string>>,
	Expect<Equal<Resolve<'={{$json.n}} bar', J>, string>>,
	Expect<Equal<Resolve<'={{$json.foo}}{{$json.n}}', J>, string>>,
	Expect<Equal<Resolve<'={{$json.missing}}', J>, Invalid<'Unknown key "missing"'>>>,
	Expect<Equal<Resolve<'={{$json.foo.length}}', J>, Invalid<'Cannot read "length" of a primitive'>>>,
	Expect<Equal<Resolve<'={{$json.nothing.x}}', J>, Invalid<'Cannot read "x" of null'>>>,
];

// Hover to inspect:
type Hover1 = Resolve<'={{$json.bar.items[0].id}}', J>;
type Hover2 = Resolve<'=Hello {{$json.foo}}!', J>;
