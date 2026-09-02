// A node definition the way n8n-workflow would declare it, reduced to what matters here:
// the interface types every field that holds an expression as Expression<T, Context>, so
// the literals below carry no markers and the plugin still checks them from the contextual
// type. `$parameter` is typed from the `properties` array of this description. Two errors
// are intentional: `$parameter.operaton` in the subtitle, and `maxItems`, which assigns a
// string-valued expression to a number slot.
import type {
	Expression,
	DescriptionContext,
	NodeParameterContext,
	RoutingContext,
} from '@n8n/expression-types';

type NodeParameterValue = string | number | boolean | null;
type ParameterType =
	| 'string'
	| 'number'
	| 'boolean'
	| 'options'
	| 'collection'
	| 'fixedCollection'
	| 'multiOptions';

interface INodeProperties {
	displayName: string;
	name: string;
	type: ParameterType;
	default: NodeParameterValue | Expression<NodeParameterValue, NodeParameterContext>;
	options?: Array<
		| { name: string; value: NodeParameterValue }
		| { name: string; values: INodeProperties[] }
		| INodeProperties
	>;
	typeOptions?: { multipleValues?: boolean };
	routing?: {
		request?: {
			url?: Expression<string, RoutingContext>;
			qs?: Record<string, Expression<string | number, RoutingContext>>;
		};
	};
}

interface INodeTypeDescription {
	displayName: string;
	subtitle?: Expression<string, DescriptionContext>;
	outputs: string[] | Expression<string[], DescriptionContext>;
	maxItems?: number | Expression<number, DescriptionContext>;
	properties: INodeProperties[];
}

export const description: INodeTypeDescription = {
	displayName: 'Orders',
	subtitle: '={{ $parameter.operation + ": " + $parameter.resource }}',
	outputs: '={{ $parameter.operation === "split" ? ["main", "main"] : ["main"] }}',
	maxItems: '={{ $parameter.resource }}', // slot error: yields string, expects number
	properties: [
		{
			displayName: 'Resource',
			name: 'resource',
			type: 'options',
			default: 'order',
			options: [
				{ name: 'Order', value: 'order' },
				{ name: 'Customer', value: 'customer' },
			],
		},
		{
			displayName: 'Operation',
			name: 'operation',
			type: 'options',
			default: 'get',
			options: [
				{ name: 'Get', value: 'get' },
				{ name: 'Split', value: 'split' },
			],
		},
		{ displayName: 'Limit', name: 'limit', type: 'number', default: 50 },
		{
			displayName: 'Domain',
			name: 'domain',
			type: 'string',
			default: '',
			routing: {
				request: {
					url: '={{ "/" + $parameter.resource + "/" + $value.trim() }}',
					qs: {
						limit: '={{ $parameter.limit }}',
						op: '={{ $parameter.operaton }}',
					},
				},
			},
		}, // typo: operaton
		{
			displayName: 'Options',
			name: 'options',
			type: 'collection',
			default: {} as never,
			options: [
				{
					displayName: 'Timeout',
					name: 'timeout',
					type: 'number',
					default: 3000,
				},
			],
		},
		{
			displayName: 'Since',
			name: 'since',
			type: 'string',
			default: '={{ $now.minus({ days: $parameter.options.timeout }).toISO() }}',
		},
		{
			displayName: 'Page',
			name: 'page',
			type: 'number',
			default: '={{ $json.page }}',
		}, // $json is loose here: no error
	],
};
