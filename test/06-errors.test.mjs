import { mk, cleanup } from "./dom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { useDraggable, useDroppable, useSortable, DnDError } from "../Dnd.js";

afterEach(cleanup);

test("invalid_target: each primitive rejects a non-element", () => {
    assert.throws(() => useDraggable(null), (e) => e instanceof DnDError && e.code === "invalid_target");
    assert.throws(() => useDroppable(undefined), (e) => e instanceof DnDError && e.code === "invalid_target");
    assert.throws(() => useSortable(42), (e) => e instanceof DnDError && e.code === "invalid_target");
    assert.throws(() => useDraggable({}), (e) => e.code === "invalid_target");
});

test("invalid_options: draggable rejects malformed options", () => {
    const el = mk();
    assert.throws(() => useDraggable(el, { axis: "z" }), (e) => e instanceof DnDError && e.code === "invalid_options");
    assert.throws(() => useDraggable(el, { threshold: -1 }), (e) => e.code === "invalid_options");
    assert.throws(() => useDraggable(el, { handle: 5 }), (e) => e.code === "invalid_options");
    assert.throws(() => useDraggable(el, { disabled: "yes" }), (e) => e.code === "invalid_options");
    assert.throws(() => useDraggable(el, { onStart: 5 }), (e) => e.code === "invalid_options");
});

test("invalid_options: droppable rejects bad accepts/disabled/callbacks", () => {
    const el = mk();
    assert.throws(() => useDroppable(el, { accepts: 5 }), (e) => e instanceof DnDError && e.code === "invalid_options");
    assert.throws(() => useDroppable(el, { disabled: 3 }), (e) => e.code === "invalid_options");
    assert.throws(() => useDroppable(el, { onDrop: "x" }), (e) => e.code === "invalid_options");
});

test("invalid_options: sortable axis must be x or y, onReorder must be a function", () => {
    const el = mk();
    assert.throws(() => useSortable(el, { axis: "both" }), (e) => e instanceof DnDError && e.code === "invalid_options");
    assert.throws(() => useSortable(el, { onReorder: 5 }), (e) => e.code === "invalid_options");
});

test("DnDError shape", () => {
    const e = new DnDError("invalid_target", "msg");
    assert.ok(e instanceof Error);
    assert.equal(e.name, "DnDError");
    assert.equal(e.code, "invalid_target");
    assert.equal(e.message, "msg");
});
