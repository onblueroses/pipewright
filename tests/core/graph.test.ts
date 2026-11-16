import { describe, expect, it } from "vitest";
import {
	type DAGDefinition,
	topologicalSort,
	validateDAG,
} from "../../src/core/dag.js";

function makeNode(id: string) {
	return { id, nodeType: "test", input: {} };
}

describe("topologicalSort", () => {
	it("linear chain returns one node per wave", () => {
		const dag: DAGDefinition = {
			nodes: [makeNode("A"), makeNode("B"), makeNode("C")],
			edges: [
				{ from: "A", to: "B" },
				{ from: "B", to: "C" },
			],
		};
		const waves = topologicalSort(dag);
		expect(waves).toEqual([["A"], ["B"], ["C"]]);
	});

	it("diamond graph returns correct 3 waves", () => {
		const dag: DAGDefinition = {
			nodes: [makeNode("A"), makeNode("B"), makeNode("C"), makeNode("D")],
			edges: [
				{ from: "A", to: "B" },
				{ from: "A", to: "C" },
				{ from: "B", to: "D" },
				{ from: "C", to: "D" },
			],
		};
		const waves = topologicalSort(dag);
		expect(waves.length).toBe(3);
		expect(waves[0]).toEqual(["A"]);
		expect(waves[1].sort()).toEqual(["B", "C"]);
		expect(waves[2]).toEqual(["D"]);
	});

	it("disconnected nodes appear in wave 0", () => {
		const dag: DAGDefinition = {
			nodes: [makeNode("A"), makeNode("B"), makeNode("C")],
			edges: [],
		};
		const waves = topologicalSort(dag);
		expect(waves.length).toBe(1);
		expect(waves[0].sort()).toEqual(["A", "B", "C"]);
	});

	it("single node returns one wave", () => {
		const dag: DAGDefinition = {
			nodes: [makeNode("A")],
			edges: [],
		};
		expect(topologicalSort(dag)).toEqual([["A"]]);
	});

	it("throws on cycle with node IDs in message", () => {
		const dag: DAGDefinition = {
			nodes: [makeNode("A"), makeNode("B")],
			edges: [
				{ from: "A", to: "B" },
				{ from: "B", to: "A" },
			],
		};
		expect(() => topologicalSort(dag)).toThrow(/Cycle detected/);
		expect(() => topologicalSort(dag)).toThrow(/A/);
		expect(() => topologicalSort(dag)).toThrow(/B/);
	});

	it("throws on 3-node cycle", () => {
		const dag: DAGDefinition = {
			nodes: [makeNode("A"), makeNode("B"), makeNode("C")],
			edges: [
				{ from: "A", to: "B" },
				{ from: "B", to: "C" },
				{ from: "C", to: "A" },
			],
		};
		expect(() => topologicalSort(dag)).toThrow(/Cycle detected/);
	});

	it("complex graph with multiple parallel levels", () => {
		// A -> B -> D
		// A -> C -> D
		// A -> E
		const dag: DAGDefinition = {
			nodes: [
				makeNode("A"),
				makeNode("B"),
				makeNode("C"),
				makeNode("D"),
				makeNode("E"),
			],
			edges: [
				{ from: "A", to: "B" },
				{ from: "A", to: "C" },
				{ from: "A", to: "E" },
				{ from: "B", to: "D" },
				{ from: "C", to: "D" },
			],
		};
		const waves = topologicalSort(dag);
		expect(waves.length).toBe(3);
		expect(waves[0]).toEqual(["A"]);
		expect(waves[1].sort()).toEqual(["B", "C", "E"]);
		expect(waves[2]).toEqual(["D"]);
	});
});

describe("validateDAG", () => {
	it("valid DAG passes", () => {
		const dag: DAGDefinition = {
			nodes: [makeNode("A"), makeNode("B")],
			edges: [{ from: "A", to: "B" }],
		};
		expect(validateDAG(dag)).toEqual([]);
	});

	it("detects duplicate node IDs", () => {
		const dag: DAGDefinition = {
			nodes: [makeNode("A"), makeNode("A")],
			edges: [],
		};
		const errors = validateDAG(dag);
		expect(errors[0]).toContain("Duplicate");
	});

	it("detects self-edges", () => {
		const dag: DAGDefinition = {
			nodes: [makeNode("A")],
			edges: [{ from: "A", to: "A" }],
		};
		const errors = validateDAG(dag);
		expect(errors[0]).toContain("Self-edge");
	});

	it("detects missing node references in edges", () => {
		const dag: DAGDefinition = {
			nodes: [makeNode("A")],
			edges: [{ from: "A", to: "B" }],
		};
		const errors = validateDAG(dag);
		expect(errors[0]).toContain("missing node");
	});

	it("detects cycles", () => {
		const dag: DAGDefinition = {
			nodes: [makeNode("A"), makeNode("B")],
			edges: [
				{ from: "A", to: "B" },
				{ from: "B", to: "A" },
			],
		};
		const errors = validateDAG(dag);
		expect(errors[0]).toContain("Cycle");
	});
});
