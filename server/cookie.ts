export interface CookieOptions {
	expires?: Date | number;
	path?: string;
	domain?: string;
	secure?: boolean;
	httpOnly?: boolean;
	sameSite?: "strict" | "lax" | "none";
}

function formatCookie(name: string, value: string, options?: CookieOptions): string {
	if (value.includes(";")) {
		throw new Error("Cookie value cannot contain semicolons");
	}
	let cookie = `${name}=${value}`;
	if (options?.expires) {
		cookie += `; Expires=${new Date(options.expires).toUTCString()}`;
	}
	if (options?.path) {
		cookie += `; Path=${options.path}`;
	}
	if (options?.domain) {
		cookie += `; Domain=${options.domain}`;
	}
	if (options?.secure) {
		cookie += "; Secure";
	}
	if (options?.httpOnly) {
		cookie += "; HttpOnly";
	}
	if (options?.sameSite) {
		cookie += `; SameSite=${options.sameSite}`;
	}
	return cookie;
}

export class Cookies {
	constructor(private readonly requestHeaders: Headers, private readonly responseHeaders?: Headers) {
	}

	get(name: string): string | null {
		const cookie = this.requestHeaders.get("Cookie");
		if (cookie === null) return null;
		const cookies = cookie.split(";").map((x) => x.trim());
		for (const cookie of cookies) {
			const [key, value] = cookie.split("=");
			if (key === name) {
				return value;
			}
		}
		return null;
	}

	set(name: string, value: string, options?: CookieOptions): void {
		if (this.responseHeaders === undefined) {
			throw new Error("Cannot set response cookies without a response headers object");
		}
		const cookieHeaders = this.responseHeaders.getAll("Set-Cookie").filter((x) => {
			const [key] = x.split("=", 1);
			return key !== name;
		});
		this.responseHeaders.delete("Set-Cookie");
		for (const cookieHeader of cookieHeaders) {
			this.responseHeaders.append("Set-Cookie", cookieHeader);
		}
		this.responseHeaders.append("Set-Cookie", formatCookie(name, value, options));
	}

	unset(name: string): void {
		if (this.responseHeaders === undefined) {
			throw new Error("Cannot unset response cookies without a response headers object");
		}
		const cookieHeaders = this.responseHeaders.getAll("Set-Cookie").filter((x) => {
			const [key] = x.split("=", 1);
			return key !== name;
		});
		this.responseHeaders.delete("Set-Cookie");
		for (const cookieHeader of cookieHeaders) {
			this.responseHeaders.append("Set-Cookie", cookieHeader);
		}
	}
}
