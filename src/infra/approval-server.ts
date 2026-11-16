import { Hono } from "hono";
import type { NodeRegistry } from "../core/registry.js";
import type { WorkflowStore } from "../core/stores.js";
import type { NodeCredentials, NodeServices } from "../core/types.js";
import { resumeById } from "../core/workflow.js";

export interface ApprovalAppOptions {
	store: WorkflowStore;
	registry: NodeRegistry;
	services?: NodeServices;
	credentials?: NodeCredentials;
}

/**
 * HTTP endpoints for approval gates. A GET on an approve or reject link only
 * shows a confirm form, because mail scanners open links. The POST acts.
 * The run ID is the only secret, so put the server behind your own auth.
 */
export function createApprovalApp(options: ApprovalAppOptions): Hono {
	const { store, registry, services, credentials } = options;
	const app = new Hono();

	app.get("/health", (c) => c.json({ status: "ok" }));

	app.get("/pending", async (c) => {
		const paused = await store.list("paused");
		return c.json(
			paused.map((s) => ({
				id: s.id,
				pausedAt: s.result.pausedAt,
				updatedAt: s.updatedAt,
			})),
		);
	});

	for (const action of ["approve", "reject"] as const) {
		app.get(`/${action}/:id`, async (c) => {
			const id = c.req.param("id");
			const state = await store.load(id);
			if (!state) return c.text("Workflow not found", 404);
			if (state.status !== "paused") {
				return c.text(`Workflow is ${state.status}, not paused`, 409);
			}
			return c.html(confirmPage(action, id));
		});
	}

	app.post("/approve/:id", async (c) => {
		const id = c.req.param("id");
		const result = await resumeById(id, registry, {
			store,
			services,
			credentials,
		});
		if (result.error?.code === "RESUME_INVALID") {
			const state = await store.load(id);
			return c.json({ error: result.error.message }, state ? 409 : 404);
		}
		const status = (await store.load(id))?.status;
		return c.json({ status, result }, result.success ? 200 : 500);
	});

	app.post("/reject/:id", async (c) => {
		const id = c.req.param("id");
		if (await store.transition(id, "paused", "rejected")) {
			return c.json({ status: "rejected" });
		}
		const state = await store.load(id);
		return state
			? c.json({ error: `Workflow is ${state.status}, not paused` }, 409)
			: c.json({ error: "Workflow not found" }, 404);
	});

	return app;
}

function confirmPage(action: "approve" | "reject", id: string): string {
	const safeId = encodeURIComponent(id);
	return `<!doctype html><meta charset="utf-8"><title>${action} workflow</title>
<form method="post" action="/${action}/${safeId}">
<p>${action === "approve" ? "Approve" : "Reject"} workflow ${safeId}?</p>
<button type="submit">${action === "approve" ? "Approve" : "Reject"}</button>
</form>`;
}
