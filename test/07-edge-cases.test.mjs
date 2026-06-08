// Edge cases adapted from the test patterns of mature DnD libraries
// (sortablejs, dnd-kit, react-dnd, interactjs): idempotent destroy, click-vs-drag
// gating of lifecycle callbacks, drop with no zone under the pointer, two
// consecutive drags from the same handle, re-entry into the same droppable,
// activeDrag during a sortable drag, destroy mid-drag, dynamic disabled
// re-evaluation on droppables.

import { mk, setRect, pd, pm, pu, reg, cleanup } from "./dom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { useDraggable, useDroppable, useSortable, activeDrag } from "../Dnd.js";

afterEach(cleanup);

test("destroy() is idempotent on each primitive", () => {
    const a = mk(), b = mk(), c = mk();
    setRect(a, 0, 0, 30, 30); setRect(b, 0, 0, 30, 30); setRect(c, 0, 0, 30, 30);
    const d = useDraggable(a);
    const dr = useDroppable(b);
    const s = useSortable(c);
    d.destroy(); d.destroy();   // second call must be a no-op
    dr.destroy(); dr.destroy();
    s.destroy(); s.destroy();
    assert.ok(true, "no throw on double-destroy");
});

test("click below threshold fires neither onStart nor onEnd", () => {
    const el = mk(); setRect(el, 0, 0, 40, 40);
    let starts = 0, ends = 0;
    const d = reg(useDraggable(el, { onStart: () => starts++, onEnd: () => ends++ }));
    pd(el, 10, 10); pm(11, 11); pm(12, 11); pu(12, 11);  // never crosses 4px threshold
    assert.equal(d.isDragging(), false, "no drag ever started");
    assert.equal(starts, 0, "onStart did not fire");
    assert.equal(ends, 0, "onEnd did not fire either");
});

test("drop outside any droppable: onEnd fires, no onDrop", () => {
    const el = mk(); setRect(el, 0, 0, 30, 30);
    const zone = mk(); setRect(zone, 200, 200, 50, 50);
    let dropped = 0, ended = 0;
    reg(useDroppable(zone, { onDrop: () => dropped++ }));
    const d = reg(useDraggable(el, { onEnd: () => ended++ }));
    pd(el, 5, 5); pm(40, 40); pu(40, 40);   // released far from the zone
    assert.equal(dropped, 0, "no drop target -> no onDrop");
    assert.equal(ended, 1, "onEnd still fires");
    assert.equal(activeDrag(), null);
});

test("two consecutive drags from the same draggable both work", () => {
    const el = mk(); setRect(el, 0, 0, 30, 30);
    let starts = 0, ends = 0;
    const d = reg(useDraggable(el, { onStart: () => starts++, onEnd: () => ends++ }));
    pd(el, 0, 0); pm(20, 0); pu(20, 0);     // first drag
    pd(el, 0, 0); pm(20, 0); pu(20, 0);     // second drag
    assert.equal(starts, 2);
    assert.equal(ends, 2);
    assert.equal(d.isDragging(), false);
});

test("leaving and re-entering the same droppable fires onEnter twice", () => {
    const el = mk(); setRect(el, 0, 0, 20, 20);
    const zone = mk(); setRect(zone, 100, 100, 80, 80);
    let enter = 0, leave = 0;
    reg(useDroppable(zone, { onEnter: () => enter++, onLeave: () => leave++ }));
    const d = reg(useDraggable(el));
    pd(el, 5, 5);
    pm(140, 140);   // enter
    pm(10, 10);     // leave
    pm(140, 140);   // re-enter
    pu(140, 140);
    assert.equal(enter, 2, "onEnter fires on each entry");
    assert.equal(leave, 2, "each enter has a matching leave (symmetry includes drop-time)");
});

test("activeDrag reports {data: null, over: container} during a sortable drag", () => {
    const c = mk();
    const items = ["A", "B"].map((t) => { const e = mk("div", c); e.textContent = t; return e; });
    setRect(c, 0, 0, 100, 40);
    items.forEach((e, i) => setRect(e, 0, i * 20, 100, 20));
    const s = reg(useSortable(c));
    assert.equal(activeDrag(), null);
    pd(items[0], 10, 5); pm(10, 12);
    const a = activeDrag();
    assert.ok(a, "active during sortable drag");
    assert.equal(a.data, null, "sortable carries no payload");
    assert.equal(a.over, c, "the container is reported as the 'over' surface");
    pu(10, 30);
    assert.equal(activeDrag(), null, "cleared after the drop");
});

test("destroying a draggable mid-drag stops cleanly", () => {
    const el = mk(); setRect(el, 0, 0, 30, 30);
    let ended = 0;
    const d = reg(useDraggable(el, { onEnd: (c) => { ended++; assert.equal(c.cancelled, true); } }));
    pd(el, 0, 0); pm(20, 0);
    assert.equal(d.isDragging(), true);
    d.destroy();
    assert.equal(ended, 1, "force-stop fires onEnd with cancelled=true");
    pm(40, 0); pu(40, 0);                   // listeners gone -> these are no-ops
    assert.equal(ended, 1, "no further onEnd calls after destroy");
});

test("destroying a sortable mid-drag stops cleanly", () => {
    const c = mk();
    const items = ["A", "B", "C"].map((t) => { const e = mk("div", c); e.textContent = t; return e; });
    setRect(c, 0, 0, 100, 60);
    items.forEach((e, i) => setRect(e, 0, i * 20, 100, 20));
    let reorders = 0;
    const s = useSortable(c, { onReorder: () => reorders++ });
    pd(items[0], 10, 5); pm(10, 45);
    assert.equal(s.isDragging(), true);
    s.destroy();
    pu(10, 45);
    assert.equal(reorders, 0, "force-stop is treated as cancellation -> no onReorder");
    assert.equal(s.isDragging(), false);
});

test("onDrop fires BEFORE onEnd, and onEnd sees activeDrag = null", () => {
    const el = mk(); setRect(el, 0, 0, 20, 20);
    const zone = mk(); setRect(zone, 100, 100, 60, 60);
    const order = [];
    reg(useDroppable(zone, { onDrop: () => order.push("drop") }));
    const d = reg(useDraggable(el, {
        onEnd: () => { order.push("end"); order.push(activeDrag()); },
    }));
    pd(el, 5, 5); pm(120, 120); pu(120, 120);
    assert.deepEqual(order, ["drop", "end", null], "drop -> end, and activeDrag cleared by onEnd time");
});

test("dynamic disabled on droppable is re-evaluated each hit-test", () => {
    const el = mk(); setRect(el, 0, 0, 20, 20);
    const zone = mk(); setRect(zone, 100, 100, 60, 60);
    let blocked = true;
    const dz = reg(useDroppable(zone, { disabled: () => blocked }));
    const d = reg(useDraggable(el, { data: { type: "x" } }));
    pd(el, 5, 5); pm(120, 120);
    assert.equal(dz.isOver(), false, "blocked at first");
    blocked = false;
    pm(125, 125);
    assert.equal(dz.isOver(), true, "becomes a valid target without restarting the drag");
    pu(125, 125);
});

test("hit-test ignores destroyed droppables (registry cleanup)", () => {
    const el = mk(); setRect(el, 0, 0, 20, 20);
    const zone = mk(); setRect(zone, 100, 100, 60, 60);
    let dropped = 0;
    const dz = useDroppable(zone, { onDrop: () => dropped++ });
    dz.destroy();
    const d = reg(useDraggable(el));
    pd(el, 5, 5); pm(120, 120); pu(120, 120);
    assert.equal(dropped, 0, "destroyed target receives nothing");
});

test("dragging into a smaller inner zone updates over without lingering on outer", () => {
    const el = mk(); setRect(el, 0, 0, 10, 10);
    const outer = mk(); setRect(outer, 0, 0, 300, 300);
    const inner = mk(); setRect(inner, 100, 100, 60, 60);
    const oEnter = []; const iEnter = [];
    const dOut = reg(useDroppable(outer, { onEnter: () => oEnter.push(1), onLeave: () => oEnter.push(-1) }));
    const dIn  = reg(useDroppable(inner, { onEnter: () => iEnter.push(1), onLeave: () => iEnter.push(-1) }));
    const d = reg(useDraggable(el));
    pd(el, 1, 1);
    pm(50, 50);    // inside outer only
    pm(120, 120);  // moved into inner (also still inside outer area, but inner wins)
    pm(50, 50);    // back to outer-only
    pu(50, 50);
    // Innermost-wins: entering inner moves the canonical "over" to inner; the
    // library only tracks a single 'over' per draggable, so outer was never
    // 'over' once inner became hot.
    assert.deepEqual(oEnter, [1, -1, 1, -1], "outer entered, left when inner took over, re-entered, left on drop");
    assert.deepEqual(iEnter, [1, -1], "inner entered, left");
});

test("draggable handle exposed properties are stable references", () => {
    // Contract: isDragging, position, delta function refs do not change across
    // the lifecycle; consumers can hold them. (The objects they READ may be
    // mutated; that is documented in the d.ts.)
    const el = mk(); setRect(el, 0, 0, 30, 30);
    const d = reg(useDraggable(el));
    const refIsDrag = d.isDragging, refPos = d.position, refDelta = d.delta;
    pd(el, 0, 0); pm(20, 0); pu(20, 0);
    assert.equal(d.isDragging, refIsDrag);
    assert.equal(d.position, refPos);
    assert.equal(d.delta, refDelta);
});

test("symmetry: every onEnter has a matching onLeave, even when dropped on the target", () => {
    const el = mk(); setRect(el, 0, 0, 20, 20);
    const zone = mk(); setRect(zone, 100, 100, 60, 60);
    let enter = 0, leave = 0, drop = 0;
    reg(useDroppable(zone, {
        onEnter: () => enter++,
        onLeave: () => leave++,
        onDrop:  () => drop++,
    }));
    const d = reg(useDraggable(el));
    pd(el, 5, 5); pm(120, 120); pu(120, 120);   // drop ON the zone
    assert.equal(enter, 1);
    assert.equal(drop, 1);
    assert.equal(leave, 1, "onLeave fires even when the drag ended ON the target");
});

test("symmetry: onLeave fires on cancellation too if a droppable was entered", () => {
    const el = mk(); setRect(el, 0, 0, 20, 20);
    const zone = mk(); setRect(zone, 100, 100, 60, 60);
    let enter = 0, leave = 0, drop = 0;
    reg(useDroppable(zone, {
        onEnter: () => enter++,
        onLeave: () => leave++,
        onDrop:  () => drop++,
    }));
    const d = reg(useDraggable(el, { data: { type: "x" } }));
    pd(el, 5, 5); pm(120, 120);
    // pointercancel
    window.dispatchEvent(new window.PointerEvent("pointercancel", { clientX: 120, clientY: 120, pointerId: 1, bubbles: true }));
    assert.equal(enter, 1);
    assert.equal(drop, 0, "no drop on cancellation");
    assert.equal(leave, 1, "onLeave still fires on cancel for the entered droppable");
});
