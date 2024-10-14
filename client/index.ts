import type { HTTPMethod, Router, AnyClientEndpoint, RouterToClientEndpoints } from "../server/index";

function formatPath(path: string, params: Record<string, string>) {
	const pathParts = path.split("/");
	const outputParts: string[] = [];
	const rest: Record<string, string> = {
		...params,
	};
	for (const pathPart of pathParts) {
		if (pathPart[0] === ":") {
			const paramName = pathPart.slice(1);
			if (params[paramName] === undefined) {
				throw new Error(`Missing path parameter ${paramName}`);
			}
			delete rest[paramName];
			outputParts.push(encodeURIComponent(params[paramName]));
		} else {
			outputParts.push(pathPart);
		}
	}
	return {
		path: outputParts.join("/"),
		rest,
	};
}

export interface RestClientOptions {
	requestInit?: RequestInit;
	fetch?: typeof fetch;
	strict?: boolean;
}

export class RestClient<
	I extends Router<any> | AnyClientEndpoint,
	T extends (I extends Router<any> ? RouterToClientEndpoints<I> : I) = (I extends Router<any> ? RouterToClientEndpoints<I> : I),
> {
	private readonly fetch: typeof fetch;

	constructor(
		public readonly root: string,
		public options: RestClientOptions = {},
	) {
		this.fetch = options.fetch ?? fetch.bind(globalThis);
	}

	private async do(method: HTTPMethod, path: string, params: Record<string, string>, input?: unknown): Promise<Response> {
		const { path: urlPath, rest } = formatPath(path, params);
		const url = new URL(urlPath, this.root);
		url.search = new URLSearchParams(rest).toString();
		const response = await this.fetch(url, {
			...this.options.requestInit,
			method,
			body: input === undefined ? undefined : JSON.stringify(input),
			headers: {
				...this.options.requestInit?.headers,
				"X-ZREST": "1",
				"Content-Type": "application/json",
			},
		});

		if (this.options.strict) {
			if (response.headers.get("X-ZREST") === null) {
				throw new Error("X-ZREST header is missing");
			}
		}
		return response;
	}

	async get<
		Path extends Extract<T, { method: "GET" }>["path"],
		Params extends Extract<T, { method: "GET", path: Path }>["params"],
		Output extends Extract<T, { method: "GET", path: Path }>["output"]
	>(
		path: Path,
		params: Params,
	): Promise<Output> {
		return this.do("GET", path, params) as any;
	}

	async post<
		Path extends Extract<T, { method: "POST" }>["path"],
		Params extends Extract<T, { method: "POST", path: Path }>["params"],
		Input extends Extract<T, { method: "POST", path: Path }>["input"],
		Output extends Extract<T, { method: "POST", path: Path }>["output"]
	>(
		path: Path,
		params: Params,
		input: Input,
	): Promise<Output> {
		return this.do("POST", path, params, input) as any;
	}

	async put<
		Path extends Extract<T, { method: "PUT" }>["path"],
		Params extends Extract<T, { method: "PUT", path: Path }>["params"],
		Input extends Extract<T, { method: "PUT", path: Path }>["input"],
		Output extends Extract<T, { method: "PUT", path: Path }>["output"]
	>(
		path: Path,
		params: Params,
		input: Input,
	): Promise<Output> {
		return this.do("PUT", path, params, input) as any;
	}

	async delete<
		Path extends Extract<T, { method: "DELETE" }>["path"],
		Params extends Extract<T, { method: "DELETE", path: Path }>["params"],
		Output extends Extract<T, { method: "DELETE", path: Path }>["output"]
	>(
		path: Path,
		params: Params,
	): Promise<Output> {
		return this.do("DELETE", path, params) as any;
	}

	async patch<
		Path extends Extract<T, { method: "PATCH" }>["path"],
		Params extends Extract<T, { method: "PATCH", path: Path }>["params"],
		Input extends Extract<T, { method: "PATCH", path: Path }>["input"],
		Output extends Extract<T, { method: "PATCH", path: Path }>["output"]
	>(
		path: Path,
		params: Params,
		input: Input,
	): Promise<Output> {
		return this.do("PATCH", path, params, input) as any;
	}
}
