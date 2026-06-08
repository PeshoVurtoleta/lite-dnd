import { mk, setRect, pd, pm, pu, pc, reg, cleanup } from "./dom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { useDraggable, activeDrag } from "../Dnd.js";

afterEach(cleanup);

test("a drag survives the source element being reparented mid-drag", () => {
    const home = mk(), away = mk();
    const el = mk("div", home); setRect(el, 0, 0, 30, 30);
    let ended = false;
    const d = reg(useDraggable(el, { onEnd: () => (ended = true) }));
    pd(el, 10, 10); pm(20, 20);
    assert.equal(d.isDragging(), true);
    away.appendChild(el); // the move that destroys naive DnD libraries
    assert.ok(away.firstChild === el, "element physically moved to a new parent");
    pm(30, 30);
    assert.equal(d.isDragging(), true, "still dragging after the reparent");
    pu(30, 30);
    assert.equal(ended, true, "the drag completed normally");
});

test("a drag survives the source element being removed mid-drag", () => {
    const el = mk(); setRect(el, 0, 0, 30, 30);
    let ended = false;
    const d = reg(useDraggable(el, { onEnd: () => (ended = true) }));
    pd(el, 5, 5); pm(20, 20);
    el.remove(); // gone from the DOM entirely
    pm(40, 40);
    pu(40, 40);
    assert.equal(ended, true, "pointerup still ends the drag even though the node left the DOM");
    assert.equal(d.isDragging(), false);
});

test("pointercancel ends the drag with cancelled=true", () => {
    const el = mk(); setRect(el, 0, 0, 30, 30);
    let ctx = null;
    const d = reg(useDraggable(el, { onEnd: (c) => (ctx = c) }));
    pd(el, 5, 5); pm(20, 20);
    pc(20, 20);
    assert.equal(d.isDragging(), false);
    assert.equal(ctx.cancelled, true, "onEnd reports cancellation");
});

test("a plain element keeps its listeners across a native move (platform baseline)", () => {
    const a = mk(), b = mk();
    const el = mk("div", a);
    let clicks = 0;
    el.addEventListener("click", () => clicks++);
    b.insertBefore(el, null);
    el.dispatchEvent(new window.Event("click", { bubbles: true }));
    assert.equal(clicks, 1, "listener intact after insertBefore");
});

test("activeDrag reflects the in-flight drag and clears afterward", () => {
    const el = mk(); setRect(el, 0, 0, 20, 20);
    const d = reg(useDraggable(el, { data: { type: "mon", id: 9 } }));
    assert.equal(activeDrag(), null, "null while idle");
    pd(el, 5, 5); pm(15, 15);
    assert.deepEqual(activeDrag().data, { type: "mon", id: 9 }, "payload visible during drag");
    pu(15, 15);
    assert.equal(activeDrag(), null, "cleared on drop");
});
