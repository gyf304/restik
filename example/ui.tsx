import React from "react";
import { createRoot } from "react-dom/client";

import { RestClient } from "../client";
import type { TodoRouter, Todo } from "./server";

const todoClient = new RestClient<TodoRouter>(window.location.origin);

function App() {
	const [todos, setTodos] = React.useState<Todo[]>([]);
	const [newTodo, setNewTodo] = React.useState("");
	const [loading, setLoading] = React.useState(false);
	const [error, setError] = React.useState("");

	React.useEffect(() => {
		// Fetch existing TODOs on load
		const fetchTodos = async () => {
			setLoading(true);
			try {
				const response = await todoClient.get("/todos", {});
				const todos = await response.json();
				setTodos(todos);
			} catch (err) {
				console.error("Error fetching TODOs:", err);
				setError("Failed to fetch TODOs");
			} finally {
				setLoading(false);
			}
		};
		fetchTodos();
	}, []);

	const addTodo = async () => {
		if (!newTodo.trim()) return;

		try {
			const response = await todoClient.post("/todos", {}, {
				title: newTodo,
				completed: false,
			});
			if (response.status === 201) {
				const createdTodo = await response.json();
				setTodos([...todos, createdTodo]);
				setNewTodo("");
			} else {
				setError("Failed to create TODO");
			}
		} catch {
			setError("Failed to create TODO");
		}
	};

	const toggleComplete = async (id: number, completed: boolean) => {
		try {
			const response = await todoClient.put(
				"/todos/:id",
				{ id: id.toString() },
				{ completed: !completed }
			);
			if (response.status === 200) {
				const updatedTodo = await response.json();
				setTodos((prevTodos) =>
					prevTodos.map((todo) =>
						todo.id === updatedTodo.id ? updatedTodo : todo
					)
				);
			} else {
				setError("Failed to update TODO");
			}
		} catch {
			setError("Failed to update TODO");
		}
	};

	const deleteTodo = async (id: number) => {
		try {
			const response = await todoClient.delete("/todos/:id", {
				id: id.toString(),
			});
			if (response.status === 204) {
				setTodos(todos.filter((todo) => todo.id !== id));
			} else {
				setError("Failed to delete TODO");
			}
		} catch {
			setError("Failed to delete TODO");
		}
	};

	return (
		<div className="App">
			<h1>TODO App</h1>
			<p>
				<a
					target="_blank"
					href={`https://validator.swagger.io/?url=${new URL("/.well-known/openapi.json", window.location.origin)}`}
				>
					OpenAPI Spec
				</a>
			</p>
			{error && <p className="error-message">{error}</p>}
			<input
				type="text"
				placeholder="New TODO"
				value={newTodo}
				onChange={(e) => setNewTodo(e.target.value)}
			/>
			<button onClick={addTodo}>Add TODO</button>

			{loading ? (
				<p>Loading...</p>
			) : (
				<ul>
					{todos.map((todo) => (
						<li key={todo.id}>
							<span>
								<input
									type="checkbox"
									checked={todo.completed}
									onChange={() => toggleComplete(todo.id, todo.completed)}
								/>
								{todo.title}
							</span>
							<button className="delete" onClick={() => deleteTodo(todo.id)}>Delete</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(<App />);
