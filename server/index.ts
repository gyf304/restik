import { z, ZodError } from "zod";
import type { Express } from "express";
import type { FastifyInstance } from "fastify";
import type { OpenAPIV3_1 as OpenAPI } from "openapi-types";

import { headersToNodeHeaders, lowercase, nodeHeadersToHeaders } from "./utils";
import zodToJsonSchema from "zod-to-json-schema";
import type { TypedRequest, HTTPMethod, TypedResponseBodyType } from "./reqres";
import { TypedResponse } from "./reqres";
import type { JSONValue } from "./json";

export type { HTTPMethod };
export { TypedResponse };

const nodeVersion = globalThis?.process?.versions?.node;
if (nodeVersion !== undefined) {
	const nodeMajorVersion = parseInt(nodeVersion.split(".")[0]);
	if (nodeMajorVersion < 20) {
		throw new Error("zrest requires Node.js 20 or higher");
	}
}

const bunVersion = globalThis?.process?.versions?.bun;
if (bunVersion !== undefined) {
	const [bunMajorVersion, bunMinorVersion] = bunVersion.split(".").map((x) => parseInt(x));
	if (bunMajorVersion < 1 || bunMinorVersion < 1) {
		throw new Error("zrest requires Bun 1.1 or higher");
	}
}

export type ErasePathParam<T extends string, F = string> =
	T extends `:${string}` ? F : T;

export type ParsePath<T extends string> =
	T extends `${infer A}/${infer B}` ? `${ErasePathParam<A>}/${ParsePath<B>}` : ErasePathParam<T>;

export type ExtraceOnePathParam<T extends string> =
	T extends `:${infer P extends string}` ? P : never;

export type ExtractPathParam<T extends string> =
	T extends `${infer A}/${infer B}` ? ExtractPathParam<A> | ExtractPathParam<B> : ExtraceOnePathParam<T>;

export type ExtractPathParams<T extends string> =
	T extends `${infer A}/${infer B}` ? [...ExtractPathParams<A>, ...ExtractPathParams<B>] : [ExtractPathParam<T>];

export function cleanPath(path: string): string {
	return path.replace(/^\//, "").replace(/\/$/, "");
}

export function parsePath<T extends string>(spec: T, path: string): Record<ParsePath<T>, string> | undefined {
	const specParts = cleanPath(spec).split("/");
	const pathParts = cleanPath(path).split("/");
	const result: Record<string, string> = {};
	for (let i = 0; i < specParts.length; i++) {
		if (specParts[i][0] === ":") {
			result[specParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
		} else if (specParts[i] !== pathParts[i]) {
			return undefined;
		}
	}
	return result;
}

export function extractPathParams<T extends string>(spec: T): ExtractPathParams<T> {
	return spec.split("/").filter((x) => x.startsWith(":")).map((x) => x.slice(1)) as any;
}

export type ParamInputFromPath<Path extends string> = {
	[key in ExtractPathParam<Path>]: string;
} & Record<string, string>;

export class Endpoint<
	Method extends HTTPMethod,
	Path extends string,
	ParamInput extends ParamInputFromPath<Path>,
	ParamOutput,
	RequestBodyInput extends JSONValue,
	ReqeustBodyOutput,
	OutputResponse extends TypedResponse<any, any>,
> {
	public readonly implementation: (
		req: TypedRequest<any, any>,
		input: {
			params: ParamOutput;
			body: ReqeustBodyOutput;
		}
	) => Promise<OutputResponse>;

	constructor(
		public readonly method: Method,
		public readonly path: Path,
		public readonly inputSchema: {
			params?: z.ZodObject<any, any, any, ParamOutput, ParamInput>;
			body?: z.Schema<ReqeustBodyOutput, any, RequestBodyInput>;
		},
		implementation: (
			req: TypedRequest<Method, RequestBodyInput>,
			input: {
				params: ParamOutput;
				body: ReqeustBodyOutput;
			}
		) => Promise<OutputResponse>,
		public readonly outputSchema?: {
			[key in OutputResponse["status"]]: z.Schema<
				TypedResponseBodyType<Extract<OutputResponse, { status: key }>>,
				any,
				TypedResponseBodyType<Extract<OutputResponse, { status: key }>>
			>;
		},
		public options: {
			summary?: string;
			description?: string;
		} = {}
	) {
		this.implementation = implementation;
	}

	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url);
		const pathParams = parsePath(this.path, url.pathname);
		if (pathParams === undefined) {
			return Promise.resolve(new Response("Not Found", { status: 404 }));
		}
		const searchParams = Object.fromEntries(url.searchParams);
		let input;
		try {
			input = {
				params: this.inputSchema.params?.parse({
					...searchParams,
					...pathParams,
				}),
				body: this.inputSchema.body?.parse(await req.json()),
			};
		} catch (e) {
			if (e instanceof ZodError) {
				return new Response(
					JSON.stringify(e),
					{
						status: 400,
						headers: {
							"Content-Type": "application/json",
						},
					}
				);
			} else if (e instanceof Error) {
				return new Response(
					JSON.stringify({
						message: e.message,
					}),
					{
						status: 400,
						headers: {
							"Content-Type": "application/json",
						},
					}
				);
			} else {
				throw e;
			}
		}
		return await this.implementation(
			req as any,
			input as any
		);
	}
}

export type AnyEndpoint = Endpoint<HTTPMethod, string, any, any, any, any, any>;

class RouterPath {
	public readonly children: Map<string | null, RouterPath> = new Map();
	public readonly methods: Map<HTTPMethod, AnyEndpoint> = new Map();
}

const notFoundResponse = new Response("Not Found", { status: 404 });
const methodNotAllowedResponse = new Response("Method Not Allowed", { status: 405 });

function pathToOpenAPIPath(path: string): string {
	return path.replace(/\/:(.*?)(\/|$)/g, "/{$1}$2");
}

export type OpenAPIExtra = Partial<OpenAPI.Document> & { info: OpenAPI.InfoObject };

export class Router<
	Routes extends AnyEndpoint[],
> {
	private readonly routerPath: RouterPath = new RouterPath();
	constructor(
		public readonly routes: Routes,
	) {
		this.fetch = this.fetch.bind(this);
		for (const route of routes) {
			const pathParts = cleanPath(route.path).split("/");
			let path = this.routerPath;
			for (const pathPart of pathParts) {
				const part = pathPart[0] === ":" ? null : pathPart;
				const nextPath = path.children.get(part);
				if (nextPath === undefined) {
					const newPath = new RouterPath();
					path.children.set(part, newPath);
					path = newPath;
				} else {
					path = nextPath;
				}
			}
			if (path.methods.has(route.method)) {
				throw new Error(`Duplicate method ${route.method} for path ${route.path}`);
			}
			path.methods.set(route.method, route);
		}
	}

	async fetch(req: Request): Promise<Response> {
		const url = new URL(req.url);
		const pathParts = cleanPath(url.pathname).split("/");
		let path = this.routerPath;
		for (const pathPart of pathParts) {
			const newPath = path.children.get(pathPart) ?? path.children.get(null);
			if (newPath === undefined) {
				return notFoundResponse;
			}
			path = newPath;
		}
		const method = path.methods.get(req.method as any);
		if (method === undefined) {
			return methodNotAllowedResponse;
		}
		return method.fetch(req);
	}

	express(app: Express, options?: {
		openapi?: OpenAPIExtra
	}): void {
		app.use(async (req, res, next) => {
			if (options?.openapi) {
				if (req.url === "/.well-known/openapi.json") {
					const doc = this.openapi({
						servers: [
							{
								url: `${req.protocol}://${req.headers.host}`,
							}
						],
						...options?.openapi,
					});
					res.set("content-type", "application/json");
					res.send(JSON.stringify(doc));
					return;
				}
			}
			const url = new URL(req.url, `${req.protocol}://${req.headers.host}`);
			const readableStream = new ReadableStream({
				start(controller) {
					req.on("data", (chunk) => {
						controller.enqueue(chunk);
					});
					req.on("end", () => {
						controller.close();
					});
				},
			});
			const fetchReq = new Request(url, {
				method: req.method,
				headers: nodeHeadersToHeaders(req.headers),
				body: readableStream,
			});
			const response = await this.fetch(fetchReq);
			if (response === notFoundResponse) {
				next();
				return;
			}
			res.status(response.status);
			res.set(headersToNodeHeaders(response.headers));
			res.end(await response.text());
		});
	}

	fastify(server: FastifyInstance, options?: {
		openapi?: OpenAPIExtra
	}): void {
		server.addHook("preHandler", async (req, rep) => {
			if (options?.openapi) {
				if (req.url === "/.well-known/openapi.json") {
					const doc = this.openapi({
						servers: [
							{
								url: `${req.protocol}://${req.headers.host}`,
							}
						],
						...options?.openapi,
					});
					rep.header("content-type", "application/json");
					rep.send(JSON.stringify(doc));
					return;
				}
			}
			const url = new URL(req.url, `${req.protocol}://${req.hostname}`);
			const fetchReq = new Request(url, {
				method: req.method,
				headers: nodeHeadersToHeaders(req.headers),
				body: JSON.stringify(req.body),
			});
			const response = await this.fetch(fetchReq);
			if (response === notFoundResponse) {
				return;
			}
			rep.statusCode = response.status;
			rep.headers(headersToNodeHeaders(response.headers));
			rep.send(await response.text());
		});
	}

	openapi(extra: Partial<OpenAPI.Document> & { info: OpenAPI.InfoObject }): OpenAPI.Document {
		const doc: OpenAPI.Document = {
			openapi: "3.1.0",
			...extra,
			components: {
				...extra.components,
			},
			paths: {},
		};
		for (const route of this.routes) {
			const path = pathToOpenAPIPath(route.path);
			if (doc.paths![path] === undefined) {
				doc.paths![path] = {};
			}
			const method = lowercase(route.method);
			const outputSchema = route.outputSchema;
			if (outputSchema === undefined) {
				throw new Error(`No output schema is defined for ${route.method} ${route.path}`);
			}
			const pathParams = extractPathParams(route.path) as string[];
			const paramsSchema = zodToJsonSchema(route.inputSchema.params ?? z.object({})) as any;
			doc.paths![path]![method] = {
				summary: route.options.summary,
				description: route.options.description,
				parameters: [
					...Object.entries(paramsSchema.properties).map(([key, schema]) => ({
						in: pathParams.includes(key) ? "path" : "query",
						name: key,
						schema: schema as any,
					}))
				],
				requestBody: route.inputSchema.body === undefined ? undefined : {
					content: {
						"application/json": {
							schema: zodToJsonSchema(route.inputSchema.body) as any,
						},
					},
					required: true,
				},
				responses: Object.fromEntries(
					Object.entries(outputSchema)
						.map(([status, schema]) => [status, zodToJsonSchema(schema)] as const)
				) as any,
			};
		}
		return doc;
	}
}

export type GetRouterEndpoint<
	T extends Router<any>,
	M extends HTTPMethod,
	P extends T["routes"][number]["path"]
> = Extract<T["routes"][number], { method: M, path: P }>;

export interface ClientEndpoint<
	Method extends HTTPMethod,
	Path extends string,
	InputParam extends ParamInputFromPath<Path>,
	InputBody,
	OutputResponse extends TypedResponse<any, any>,
> {
	method: Method;
	path: Path;
	params: InputParam;
	input: InputBody;
	output: OutputResponse;
}
export type AnyClientEndpoint = ClientEndpoint<HTTPMethod, string, any, any, any>;

export type EndpointToClientEndpoint<E extends AnyEndpoint> = E extends Endpoint<
	infer Method,
	infer Path,
	infer ParamInput,
	any,
	infer Input,
	any,
	infer OutputResponse
> ? ClientEndpoint<Method, Path, ParamInput, Input, OutputResponse> : never;

export type RouterToClientEndpoints<T extends Router<any>> = EndpointToClientEndpoint<T["routes"][number]>;
