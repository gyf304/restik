import { Cookies } from "../server/cookie";
import type { JSONObject } from "../server/json";

export interface Todo {
	id: number;
	title: string;
	completed: boolean;
}

// In-memory store for TODOs, key is session ID
let todos: Map<string, {
	todos: Todo[];
	nextId: number;
}> = new Map();

// Periodically clean up sessions
setInterval(() => {
	todos = new Map();
}, 1000 * 60 * 60); // Every hour

function generateSessionId(): string {
	return crypto.randomUUID();
}

export class NotFoundError extends Error {}

export class Session {
	readonly id: string;
	readonly cookies: Cookies;

	constructor(requestHeaders: Headers, responseHeaders: Headers) {
		this.cookies = new Cookies(requestHeaders, responseHeaders);
		let id = this.cookies.get("sessionId");
		if (id === null) {
			id = generateSessionId();
			this.cookies.set("sessionId", id, {
				expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
				path: "/",
			});
		}
		if (!todos.has(id)) {
			todos.set(id, {
				todos: [],
				nextId: 1,
			});
		}
		this.id = id;
	}

	get context() {
		return todos.get(this.id)!;
	}

	getTodo(id: number): Todo {
		const todo = this.context.todos.find((t) => t.id === id);
		if (todo === undefined) {
			throw new NotFoundError("Todo not found");
		}
		return todo;
	}

	createTodo(title: string, completed: boolean): Todo {
		const newTodo = { id: this.context.nextId++, title, completed };
		this.context.todos.push(newTodo);
		return newTodo;
	}

	updateTodo(id: number, todo: Partial<Todo>): Todo {
		const todoIndex = this.context.todos.findIndex((t) => t.id === id);
		if (todoIndex === -1) {
			throw new NotFoundError("Todo not found");
		}
		const updatedTodo = { ...this.context.todos[todoIndex], ...todo };
		this.context.todos[todoIndex] = updatedTodo;
		return updatedTodo;
	}

	deleteTodo(id: number): void {
		const index = this.context.todos.findIndex((t) => t.id === id);
		if (index === -1) {
			throw new NotFoundError("Todo not found");
		}
		this.context.todos.splice(index, 1);
	}
}
