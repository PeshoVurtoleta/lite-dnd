import { mk, setRect, pd, pm, pu, reg, cleanup } from "./dom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { useDraggable, useDroppable } from "../Dnd.js";

afterEach(cleanup);

test("isOver + onEnter/onOver/onLeave sequence", () => {
    const el = mk(); setRect(el, 0, 0, 20, 20);
    const zone = mk(); setRect(zone, 100, 100, 80, 80);
    let enter = 0, over = 0, leave = 0;
    const d = reg(useDroppable(zone, { onEnter: () => enter++, onOver: () => over++, onLeave: () => leave++ }));
    const drag = reg(useDraggable(el, { data: { type: "card" } }));
    pd(el, 5, 5); pm(40, 40);
    assert.equal(d.isOver(), false, "not over yet (outside zone)");
    pm(140, 140);
    assert.equal(d.isOver(), true, "over after entering");
    assert.equal(enter, 1);
    pm(150, 150);
    assert.ok(over >= 1, "onOver fires while over");
    pm(10, 10);
    assert.equal(d.isOver(), false, "left the zone");
    assert.equal(leave, 1);
    pu(10, 10);
});

test("onDrop receives the payload and context", () => {
    const el = mk(); setRect(el, 0, 0, 20, 20);
    const zone = mk(); setRect(zone, 100, 100, 80, 80);
    let dropped = null, ctxOver = null;
    const d = reg(useDroppable(zone, { onDrop: (data, ctx) => { dropped = data; ctxOver = ctx.over; } }));
    const drag = reg(useDraggable(el, { data: { type: "card", id: 1 } }));
    pd(el, 5, 5); pm(140, 140); pu(140, 140);
    assert.deepEqual(dropped, { type: "card", id: 1 });
    assert.equal(ctxOver, zone, "ctx.over is the drop target");
});

test("accepts (array) filters by data.type", () => {
    const el = mk(); setRect(el, 0, 0, 20, 20);
    const zone = mk(); setRect(zone, 100, 100, 80, 80);
    const d = reg(useDroppable(zone, { accepts: ["file"] }));
    const drag = reg(useDraggable(el, { data: { type: "card" } }));
    pd(el, 5, 5); pm(140, 140);
    assert.equal(d.isOver(), false, "type 'card' not accepted by ['file']");
    pu(140, 140);
});

test("accepts (predicate) filters by payload", () => {
    const el = mk(); setRect(el, 0, 0, 20, 20);
    const zone = mk(); setRect(zone, 100, 100, 80, 80);
    const d = reg(useDroppable(zone, { accepts: (data) => data && data.id > 10 }));
    const drag = reg(useDraggable(el, { data: { id: 3 } }));
    pd(el, 5, 5); pm(140, 140);
    assert.equal(d.isOver(), false, "predicate rejects id=3");
    pu(140, 140);
});

test("disabled (boolean and function) blocks the drop target", () => {
    const el = mk(); setRect(el, 0, 0, 20, 20);
    const zone = mk(); setRect(zone, 100, 100, 80, 80);
    let dropped = false;
    let off = true;
    const d = reg(useDroppable(zone, { disabled: () => off, onDrop: () => (dropped = true) }));
    const drag = reg(useDraggable(el, { data: { type: "x" } }));
    pd(el, 5, 5); pm(140, 140); pu(140, 140);
    assert.equal(dropped, false, "disabled droppable does not receive the drop");
});

test("overlapping droppables: the innermost (smallest) wins", () => {
    const el = mk(); setRect(el, 0, 0, 10, 10);
    const outer = mk(); setRect(outer, 0, 0, 300, 300);
    const inner = mk(); setRect(inner, 100, 100, 60, 60); // fully inside outer's area
    const dOuter = reg(useDroppable(outer, {}));
    const dInner = reg(useDroppable(inner, {}));
    const drag = reg(useDraggable(el, { data: { type: "x" } }));
    pd(el, 1, 1); pm(120, 120); // inside both
    assert.equal(dInner.isOver(), true, "innermost is over");
    assert.equal(dOuter.isOver(), false, "outer is not (smaller area wins)");
    pu(120, 120);
});

test("destroy unregisters the drop target", () => {
    const el = mk(); setRect(el, 0, 0, 20, 20);
    const zone = mk(); setRect(zone, 100, 100, 80, 80);
    let dropped = false;
    const d = useDroppable(zone, { onDrop: () => (dropped = true) });
    d.destroy();
    const drag = reg(useDraggable(el, { data: { type: "x" } }));
    pd(el, 5, 5); pm(140, 140); pu(140, 140);
    assert.equal(dropped, false, "destroyed droppable receives nothing");
});
