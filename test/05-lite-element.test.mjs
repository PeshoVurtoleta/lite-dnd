import { mk, setRect, pd, pm, pu, tick, cleanup } from "./dom.mjs";
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { define } from "@zakkster/lite-element";
import { useSortable } from "../Dnd.js";

afterEach(cleanup);

// A reactive Custom Element with internal state. We track how many times setup
// runs so we can prove a reorder does NOT destroy and rebuild the component.
let setups = 0;
define("li-row", (host, scope) => {
    setups++;
    const v = scope.state(0);
    host.__v = v;            // expose the state signal for the test
    host.__born = setups;    // setup-call ordinal at creation
    scope.bind(host, "textContent", () => "v=" + v());
});

async function buildList() {
    const c = mk();
    const rows = [];
    for (let i = 0; i < 3; i++) { const r = c.ownerDocument.createElement("li-row"); c.appendChild(r); rows.push(r); }
    await tick(); // let connectedCallback + setup run
    setRect(c, 0, 0, 100, 60);
    rows.forEach((r, i) => setRect(r, 0, i * 20, 100, 20));
    return { c, rows };
}

test("reordering lite-element items preserves their state and instances", async () => {
    const base = setups;
    const { c, rows } = await buildList();
    assert.equal(setups - base, 3, "setup ran once per row");
    rows[0].__v.set(100); rows[1].__v.set(200); rows[2].__v.set(300);
    await tick();
    assert.equal(rows[0].textContent, "v=100", "binding reflects state");

    const s = useSortable(c);
    // drag the first row (state 100) down between the other two
    pd(rows[0], 10, 5); pm(10, 12); pm(10, 45); pu(10, 45);
    await tick(); // let the (cancelled) teardown microtask settle

    assert.equal(c.children[1], rows[0], "the moved node is the SAME component instance");
    assert.equal(setups - base, 3, "setup did NOT re-run -- the component was not rebuilt");
    assert.equal(rows[0].__v(), 100, "internal state survived the reorder");
    assert.equal(rows[0].__born, base + 1, "still the original instance (same born ordinal)");
    assert.equal(c.children[1].textContent, "v=100", "and its reactive binding still works");
    s.destroy();
});

test("state survives repeated reorders", async () => {
    const base = setups;
    const { c, rows } = await buildList();
    rows[0].__v.set(11); rows[1].__v.set(22); rows[2].__v.set(33);
    const s = useSortable(c);

    pd(rows[0], 10, 5); pm(10, 12); pm(10, 45); pu(10, 45); // A down -> B A C
    await tick();
    pd(rows[2], 10, 45); pm(10, 38); pm(10, 5); pu(10, 5);  // C up -> C B A
    await tick();

    assert.equal(setups - base, 3, "no rebuilds across two reorders");
    assert.deepEqual([rows[0].__v(), rows[1].__v(), rows[2].__v()], [11, 22, 33], "every item kept its state");
    s.destroy();
});
