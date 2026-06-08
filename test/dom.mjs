// DOM harness for the lite-dnd suites. Imported FIRST in every test file so the
// happy-dom globals (window, document, HTMLElement, customElements, PointerEvent)
// are in place before Dnd.js / lite-element evaluate. node --test runs each file
// in its own process, so the single window per file is isolated.

import { Window } from "happy-dom";

const win = new Window({ url: "http://localhost/" });
Object.assign(globalThis, {
    window: win, document: win.document,
    HTMLElement: win.HTMLElement, customElements: win.customElements,
    Node: win.Node, Event: win.Event, CustomEvent: win.CustomEvent,
    PointerEvent: win.PointerEvent, MouseEvent: win.MouseEvent,
});

export { win };
export const doc = win.document;
export const tick = () => new Promise((r) => setTimeout(r, 0));

export function mk(tag = "div", parent = doc.body) { const e = doc.createElement(tag); parent.appendChild(e); return e; }
export function setRect(el, x, y, w, h) { el.getBoundingClientRect = () => ({ left: x, top: y, right: x + w, bottom: y + h, width: w, height: h, x, y }); }

export const pd = (t, x, y, opts = {}) => t.dispatchEvent(new win.PointerEvent("pointerdown", { clientX: x, clientY: y, pointerId: 1, button: 0, isPrimary: true, bubbles: true, ...opts }));
export const pm = (x, y) => win.dispatchEvent(new win.PointerEvent("pointermove", { clientX: x, clientY: y, pointerId: 1, bubbles: true }));
export const pu = (x, y) => win.dispatchEvent(new win.PointerEvent("pointerup", { clientX: x, clientY: y, pointerId: 1, bubbles: true }));
export const pc = (x, y) => win.dispatchEvent(new win.PointerEvent("pointercancel", { clientX: x, clientY: y, pointerId: 1, bubbles: true }));

// Track created handles so afterEach can destroy them (the droppable registry is
// module-global in Dnd.js and would otherwise leak across tests in a file).
const _handles = [];
export function reg(h) { _handles.push(h); return h; }
export function cleanup() { while (_handles.length) { try { _handles.pop().destroy(); } catch (_) {} } doc.body.innerHTML = ""; }
