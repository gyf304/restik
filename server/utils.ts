export function lowercase<T extends string>(str: T): Lowercase<T> {
	return str.toLowerCase() as any;
}

export function nodeHeadersToHeaders(headers: Record<string, string | string[] | undefined>): Headers {
	const headersInit: [string, string][] = [];
	for (const [key, value] of Object.entries(headers)) {
		if (value == undefined) {
			continue;
		}
		if (typeof value === "string") {
			headersInit.push([key, value]);
		} else if (Array.isArray(value)) {
			for (const valueItem of value) {
				headersInit.push([key, valueItem]);
			}
		} else {
			throw new Error("Unsupported header value type");
		}
	}
	return new Headers(headersInit);
}

export function headersToNodeHeaders(headers: Headers): Record<string, string | string[]> {
	const out: Map<string, string | string[]> = new Map();
	headers.forEach((value, key) => {
		const existingValue = out.get(key);
		if (existingValue === undefined) {
			out.set(key, value);
		} else if (Array.isArray(existingValue)) {
			existingValue.push(value);
		} else if (typeof existingValue === "string") {
			out.set(key, [existingValue, value]);
		} else {
			throw new Error("Unsupported header value type");
		}
	});
	return Object.fromEntries(out);
}

export interface CookieOptions {
	expires?: Date;
	path?: string;
	domain?: string;
	secure?: boolean;
	httpOnly?: boolean;
	sameSite?: "strict" | "lax" | "none";
}

