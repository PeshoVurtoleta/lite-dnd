import { mk, setRect, pd, pm, pu, reg, cleanup } from "./dom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { useDraggable } from "../Dnd.js";

afterEach(cleanup);

test("threshold gates a click vs a drag", () => {
    const el = mk(); setRect(el, 0, 0, 50, 50);
    const d = reg(useDraggable(el, { data: { type: "c" } }));
    pd(el, 10, 10); pm(12, 11);
    assert.equal(d.isDragging(), false, "small movement stays a click");
    pm(20, 20);
    assert.equal(d.isDragging(), true, "past 4px threshold becomes a drag");
});

test("isDragging + onStart/onEnd lifecycle", () => {
    const el = mk(); setRect(el, 0, 0, 40, 40);
    let starts = 0, ends = 0;
    const d = reg(useDraggable(el, { onStart: () => starts++, onEnd: () => ends++ }));
    pd(el, 0, 0); pm(20, 0);
    assert.equal(d.isDragging(), true); assert.equal(starts, 1);
    pu(20, 0);
    assert.equal(d.isDragging(), false); assert.equal(ends, 1);
});

test("position and delta track the pointer", () => {
    const el = mk(); setRect(el, 0, 0, 40, 40);
    const d = reg(useDraggable(el));
    pd(el, 10, 10); pm(40, 25);
    assert.deepEqual(d.position(), { x: 40, y: 25 });
    assert.deepEqual(d.delta(), { dx: 30, dy: 15 });
});

test("axis constrains the reported delta", () => {
    const ex = mk(); setRect(ex, 0, 0, 40, 40);
    const dx = reg(useDraggable(ex, { axis: "x" }));
    pd(ex, 0, 0); pm(30, 20);
    assert.deepEqual(dx.delta(), { dx: 30, dy: 0 }, "axis x zeroes dy");
    const ey = mk(); setRect(ey, 0, 0, 40, 40);
    const dy = reg(useDraggable(ey, { axis: "y" }));
    pd(ey, 0, 0); pm(30, 20);
    assert.deepEqual(dy.delta(), { dx: 0, dy: 20 }, "axis y zeroes dx");
});

test("onMove receives a context with data and deltas", () => {
    const el = mk(); setRect(el, 0, 0, 40, 40);
    let last = null;
    const d = reg(useDraggable(el, { data: { id: 5 }, onMove: (c) => (last = c) }));
    pd(el, 0, 0); pm(12, 0);
    assert.equal(last.data.id, 5); assert.equal(last.dx, 12); assert.equal(last.x, 12);
});

test("handle (selector) restricts drag initiation", () => {
    const el = mk(); setRect(el, 0, 0, 40, 40);
    const h = mk("span", el); const other = mk("span", el);
    const d = reg(useDraggable(el, { handle: "span.grip" }));
    h.className = "grip";
    pd(other, 0, 0); pm(20, 0);
    assert.equal(d.isDragging(), false, "pointerdown outside the handle does nothing");
    pd(h, 0, 0); pm(20, 0);
    assert.equal(d.isDragging(), true, "pointerdown on the handle starts the drag");
});

test("handle (element) restricts drag initiation", () => {
    const el = mk(); setRect(el, 0, 0, 40, 40);
    const grip = mk("b", el);
    const d = reg(useDraggable(el, { handle: grip }));
    pd(el, 0, 0); pm(20, 0);
    assert.equal(d.isDragging(), false);
    pd(grip, 0, 0); pm(20, 0);
    assert.equal(d.isDragging(), true);
});

test("disabled (boolean and function) prevents dragging", () => {
    const a = mk(); setRect(a, 0, 0, 40, 40);
    const da = reg(useDraggable(a, { disabled: true }));
    pd(a, 0, 0); pm(20, 0);
    assert.equal(da.isDragging(), false, "boolean disabled");
    let off = true;
    const b = mk(); setRect(b, 0, 0, 40, 40);
    const db = reg(useDraggable(b, { disabled: () => off }));
    pd(b, 0, 0); pm(20, 0);
    assert.equal(db.isDragging(), false, "dynamic disabled (true)");
    off = false;
    pd(b, 0, 0); pm(20, 0);
    assert.equal(db.isDragging(), true, "dynamic disabled (false) now allows");
});

test("non-primary mouse button is ignored", () => {
    const el = mk(); setRect(el, 0, 0, 40, 40);
    const d = reg(useDraggable(el));
    pd(el, 0, 0, { button: 2 }); pm(20, 0);
    assert.equal(d.isDragging(), false);
});

test("data-dragging attribute toggles, and destroy detaches", () => {
    const el = mk(); setRect(el, 0, 0, 40, 40);
    const d = reg(useDraggable(el, { data: 42 }));
    assert.equal(d.data, 42, "data is exposed");
    pd(el, 0, 0); pm(20, 0);
    assert.equal(el.hasAttribute("data-dragging"), true, "attribute set during drag");
    pu(20, 0);
    assert.equal(el.hasAttribute("data-dragging"), false, "attribute removed after drag");
    d.destroy();
    pd(el, 0, 0); pm(20, 0);
    assert.equal(d.isDragging(), false, "no drag after destroy");
});
