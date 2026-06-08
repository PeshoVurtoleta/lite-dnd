import { mk, setRect, pd, pm, pu, reg, cleanup } from "./dom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { useSortable } from "../Dnd.js";

afterEach(cleanup);

// build a vertical list A,B,C with stacked rects (20px tall each)
function list(axis = "y") {
    const c = mk();
    const items = ["A", "B", "C"].map((t) => { const e = mk("div", c); e.textContent = t; return e; });
    if (axis === "y") { setRect(c, 0, 0, 100, 60); items.forEach((e, i) => setRect(e, 0, i * 20, 100, 20)); }
    else { setRect(c, 0, 0, 60, 100); items.forEach((e, i) => setRect(e, i * 20, 0, 20, 100)); }
    return { c, items };
}
const labels = (c) => Array.prototype.map.call(c.children, (n) => n.textContent).join("");

test("dragging an item down reorders the list", () => {
    const { c, items } = list();
    const s = reg(useSortable(c));
    pd(items[0], 10, 5); pm(10, 12); pm(10, 45); pu(10, 45);
    assert.equal(labels(c), "BAC", "A dropped between B and C");
});

test("dragging an item up reorders the list", () => {
    const { c, items } = list();
    const s = reg(useSortable(c));
    pd(items[2], 10, 45); pm(10, 38); pm(10, 15); pu(10, 15);
    assert.equal(labels(c), "ACB", "C moved above B");
});

test("order() reflects the live permutation and final order", () => {
    const { c, items } = list();
    const s = reg(useSortable(c));
    assert.deepEqual(s.order(), [0, 1, 2], "identity before dragging");
    pd(items[0], 10, 5); pm(10, 12); pm(10, 45);
    assert.deepEqual(s.order(), [1, 0, 2], "live order updates during the drag");
    pu(10, 45);
    assert.deepEqual(s.order(), [1, 0, 2], "final order retained");
});

test("onReorder fires on drop with the new->old index permutation", () => {
    const { c, items } = list();
    let got = null;
    const s = reg(useSortable(c, { onReorder: (o) => (got = o) }));
    pd(items[0], 10, 5); pm(10, 12); pm(10, 45); pu(10, 45);
    assert.deepEqual(got, [1, 0, 2]);
});

test("the reordered item is the same DOM instance", () => {
    const { c, items } = list();
    const A = items[0];
    A.setAttribute("data-id", "alpha");
    const s = reg(useSortable(c));
    pd(items[0], 10, 5); pm(10, 12); pm(10, 45); pu(10, 45);
    assert.ok(c.children[1] === A, "same node object after the move");
    assert.equal(c.children[1].getAttribute("data-id"), "alpha", "its attributes are intact");
});

test("handle restricts which part of an item initiates the drag", () => {
    const c = mk();
    const item = mk("div", c); const grip = mk("span", item); grip.className = "grip"; const body = mk("span", item);
    const item2 = mk("div", c);
    setRect(c, 0, 0, 100, 40); setRect(item, 0, 0, 100, 20); setRect(item2, 0, 20, 100, 20);
    const s = reg(useSortable(c, { handle: ".grip" }));
    pd(body, 10, 5); pm(10, 30);
    assert.equal(s.isDragging(), false, "dragging from a non-handle does nothing");
    pd(grip, 10, 5); pm(10, 12);
    assert.equal(s.isDragging(), true, "dragging from the handle starts the sort");
    pu(10, 30);
});

test("disabled prevents sorting", () => {
    const { c, items } = list();
    const s = reg(useSortable(c, { disabled: true }));
    pd(items[0], 10, 5); pm(10, 45); pu(10, 45);
    assert.equal(labels(c), "ABC", "no reorder when disabled");
    assert.equal(s.isDragging(), false);
});

test("axis x reorders horizontally", () => {
    const { c, items } = list("x");
    const s = reg(useSortable(c, { axis: "x" }));
    pd(items[0], 5, 10); pm(12, 10); pm(45, 10); pu(45, 10);
    assert.equal(labels(c), "BAC", "horizontal reorder");
});

test("staying within a slot does not churn the DOM (move guard)", () => {
    const { c, items } = list();
    let moves = 0;
    const ins = c.insertBefore.bind(c), app = c.appendChild.bind(c);
    c.insertBefore = (n, r) => { moves++; return ins(n, r); };
    c.appendChild = (n) => { moves++; return app(n); };
    const s = reg(useSortable(c));
    pd(items[0], 10, 5);
    pm(10, 8); pm(10, 14); pm(10, 25); // dragged A stays ahead of B's midpoint (30)
    assert.equal(moves, 0, "no DOM mutation while the item stays in place");
    pm(10, 45); // cross below C's midpoint (50)
    assert.equal(moves, 1, "exactly one mutation when crossing a midpoint");
    pm(10, 47); pm(10, 49); // stay in the new slot
    assert.equal(moves, 1, "no redundant mutation while staying in the new slot");
    pu(10, 49);
});

test("destroy detaches the sortable", () => {
    const { c, items } = list();
    const s = useSortable(c); s.destroy();
    pd(items[0], 10, 5); pm(10, 45); pu(10, 45);
    assert.equal(labels(c), "ABC", "no reorder after destroy");
    assert.equal(s.isDragging(), false);
});
