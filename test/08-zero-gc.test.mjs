// Zero-GC hot-path contract.
//
// position(), delta() and activeDrag() are exposed as lite-signal accessors
// that return STABLE references whose fields are mutated in place. This file
// locks that contract in: 200 pointermoves with two droppables in the path
// must produce zero new-ref reads from any of the three signals. If a future
// edit reintroduces { x, y } literals on the hot path, this test fails.
//
// DOMRect allocations from Element.getBoundingClientRect are platform-mandated
// and not under the library's control; they are accepted as part of the
// hit-test cost.

import { mk, setRect, pd, pm, pu, reg, cleanup } from "./dom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { useDraggable, useDroppable, activeDrag } from "../Dnd.js";

afterEach(cleanup);

test("position()/delta() return stable references across 200 pointermoves (zero new-refs)", () => {
    const el = mk(); setRect(el, 0, 0, 30, 30);
    const d = reg(useDraggable(el));
    pd(el, 0, 0); pm(10, 10);          // cross threshold
    const pos0 = d.position(), del0 = d.delta();
    let posChanges = 0, delChanges = 0;
    let prevPos = pos0, prevDel = del0;
    for (let i = 0; i < 200; i++) {
        pm(10 + i, 10 + (i % 7));
        const p = d.position(), q = d.delta();
        if (p !== prevPos) { posChanges++; prevPos = p; }
        if (q !== prevDel) { delChanges++; prevDel = q; }
    }
    pu(50, 50);
    assert.equal(posChanges, 0, "position() must return the same object identity throughout the drag");
    assert.equal(delChanges, 0, "delta() must return the same object identity throughout the drag");
});

test("activeDrag() returns a stable reference across zone-cross transitions", () => {
    const el = mk(); setRect(el, 0, 0, 10, 10);
    const zoneA = mk(); setRect(zoneA, 50, 50, 40, 40);
    const zoneB = mk(); setRect(zoneB, 200, 200, 40, 40);
    reg(useDraggable(el));
    reg(useDroppable(zoneA)); reg(useDroppable(zoneB));
    pd(el, 1, 1); pm(5, 5);
    const first = activeDrag();
    let changes = 0;
    let prev = first;
    // Bounce between in-zoneA / in-zoneB / out-of-both 50 times.
    for (let i = 0; i < 50; i++) {
        pm(70, 70);    // in zoneA
        let cur = activeDrag(); if (cur !== prev) { changes++; prev = cur; }
        pm(220, 220);  // in zoneB
        cur = activeDrag(); if (cur !== prev) { changes++; prev = cur; }
        pm(0, 0);      // out of both
        cur = activeDrag(); if (cur !== prev) { changes++; prev = cur; }
    }
    pu(0, 0);
    assert.equal(changes, 0, "activeDrag() must return the same object identity across every transition during the drag");
});

test("activeDrag() returns null when idle (NOT an empty object)", () => {
    assert.equal(activeDrag(), null);
    const el = mk(); setRect(el, 0, 0, 10, 10);
    const d = reg(useDraggable(el));
    pd(el, 0, 0); pm(20, 0); pu(20, 0);
    assert.equal(activeDrag(), null, "cleared to null, not to a stale box");
});
