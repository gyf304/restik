import type { JSONValue } from "./json";

export type HTTPMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export class TypedResponse<S extends number, B> extends Response {
	readonly status: S;

	constructor(status: S, jsonBody: B, responseInit?: ResponseInit) {
		super(JSON.stringify(jsonBody), {
			...responseInit,
			headers: {
				"Content-Type": "application/json",
				"X-ZREST": "1",
				...responseInit?.headers,
			},
		});
		this.status = status;
		this.json = super.json;
	}

	json(): Promise<B> {
		return super.json();
	}
}

export type TypedResponseBodyType<T extends TypedResponse<any, any>> = T extends TypedResponse<any, infer B> ? B : never;

export type TypedRequest<M extends HTTPMethod, B> = Request & {
	method: M;
	json(): Promise<B>;
};
