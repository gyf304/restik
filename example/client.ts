import { RestClient } from "../client";
import type { TodoRouter } from "./server";

const exampleClient = new RestClient<TodoRouter>("http://localhost:8080");

console.log("Existing TODOs:");
console.log(await exampleClient.get("/todos", {}).then((r) => r.json()));

const postResponse = await exampleClient.post("/todos", {}, {
	title: "Buy milk",
});
if (postResponse.status !== 201) {
	throw new Error("Failed to create TODO");
}
const postJson = await postResponse.json();

const putResponse = await exampleClient.put("/todos/:id", {
	id: postJson.id.toString(),
}, {
	title: "Buy milk",
	completed: true,
});
if (putResponse.status !== 200) {
	throw new Error("Failed to update TODO");
}
const putJson = await putResponse.json();
console.log("Updated TODO:");
console.log(putJson);

console.log("New TODO list:");
console.log(await exampleClient.get("/todos", {}).then((r) => r.json()));
