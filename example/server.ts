import fs from "node:fs/promises";

import { z } from "zod";
import express from "express";
import cors from "cors";
import * as esbuild from "esbuild";

import { Endpoint, Router, TypedResponse } from "../server";
import { NotFoundError, Session } from "./todo";

export { type Todo } from "./todo";

// Create a TODO item
const createTodoEndpoint = new Endpoint(
	"POST",
	"/todos",
	{
		body: z.object({
			title: z.string(),
		}),
	},
	async (req, { body }) => {
		const responseHeaders = new Headers();
		const session = new Session(req.headers, responseHeaders);
		return new TypedResponse(201, session.createTodo(body.title, false), {
			headers: responseHeaders,
		});
	},
	{
		201: z.object({
			id: z.number(),
			title: z.string(),
			completed: z.boolean(),
		}).describe("Created TODO"),
	},
	{
		summary: "Create TODO",
		description: "Create a new TODO item",
	}
);

// Get all TODO items
const listTodosEndpoint = new Endpoint(
	"GET",
	"/todos",
	{
		params: z.object({}),
	},
	async (req) => {
		const responseHeaders = new Headers();
		const session = new Session(req.headers, responseHeaders);
		return new TypedResponse(200, session.context.todos, {
			headers: responseHeaders,
		});
	},
	{
		200: z.array(
			z.object({
				id: z.number(),
				title: z.string(),
				completed: z.boolean(),
			})
		).describe("List of TODOs"),
	},
	{
		summary: "List TODOs",
		description: "Retrieve all TODO items",
	}
);

// Update a TODO item by ID
const updateTodoEndpoint = new Endpoint(
	"PUT",
	"/todos/:id",
	{
		params: z.object({
			id: z.string().transform((x) => parseInt(x)),
		}),
		body: z.object({
			title: z.string().optional(),
			completed: z.boolean().optional(),
		}),
	},
	async (req, { params, body }) => {
		const responseHeaders = new Headers();
		const session = new Session(req.headers, responseHeaders);
		try {
			const todo = session.updateTodo(params.id, body);
			return new TypedResponse(200, todo, {
				headers: responseHeaders,
			});
		} catch (e) {
			if (e instanceof NotFoundError) {
				return new TypedResponse(404, "TODO item not found", {
					headers: responseHeaders,
				});
			} else {
				throw e;
			}
		}
	},
	{
		200: z.object({
			id: z.number(),
			title: z.string(),
			completed: z.boolean(),
		}).describe("Updated TODO"),
		404: z.string().describe("Not Found"),
	},
	{
		summary: "Update TODO",
		description: "Update a TODO item by its ID",
	}
);

// Delete a TODO item by ID
const deleteTodoEndpoint = new Endpoint(
	"DELETE",
	"/todos/:id",
	{
		params: z.object({
			id: z.string().transform((x) => parseInt(x)),
		}),
	},
	async (req, { params }) => {
		const responseHeaders = new Headers();
		const session = new Session(req.headers, responseHeaders);
		try {
			session.deleteTodo(params.id);
			return new TypedResponse(204, {}, {
				headers: responseHeaders,
			});
		} catch (e) {
			if (e instanceof NotFoundError) {
				return new TypedResponse(404, {}, {
					headers: responseHeaders,
				});
			} else {
				throw e;
			}
		}
	},
	{
		204: z.object({}).describe("Deleted TODO"),
		404: z.object({}).describe("Not Found"),
	},
	{
		summary: "Delete TODO",
		description: "Delete a TODO item by its ID",
	}
);

// Define the router with all TODO endpoints
const todoRouter = new Router([
	createTodoEndpoint,
	listTodosEndpoint,
	updateTodoEndpoint,
	deleteTodoEndpoint,
]);
export type TodoRouter = typeof todoRouter;

// Set up Express app
const app = express();
app.enable("trust proxy");
app.use(cors({
	credentials: true,
}));
todoRouter.express(app, {
	// Also expose the OpenAPI spec at /.well-known/openapi.json
	openapi: {
		info: {
			title: "TODO API",
			version: "1.0.0",
		},
		components: {
			securitySchemes: {
				cookieAuth: {
					type: "apiKey",
					in: "cookie",
					name: "sessionId",
				}
			}
		},
		security: [
			{
				cookieAuth: []
			}
		]
	},
});

const scriptPath = import.meta.url;
const scriptDir = new URL(".", scriptPath).pathname;

// Build the ui.tsx file into a bundle
const uiBundle = await esbuild.build({
	entryPoints: [`${scriptDir}/ui.tsx`],
	bundle: true,
	format: "iife",
	minify: true,
	sourcemap: true,
	write: false,
});

// Read ui.html file into a string
const uiHtml = await fs.readFile(`${scriptDir}/ui.html`, "utf8");
app.get("/", (req, res) => {
	res.send(uiHtml);
});
app.get("/index.js", (req, res) => {
	res.send(uiBundle.outputFiles[0].text);
});

app.listen({
	port: 8080,
});
