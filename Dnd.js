/**
 * @zakkster/lite-dnd v1.0.0
 * -------------------------
 * Framework-agnostic drag-and-drop primitives that survive DOM reparents.
 *
 * The active drag is tracked at the window level (pointermove/up on the
 * element's owner window, never on the dragged node itself), drop targets are
 * resolved by live rect hit-testing against a registry, and a drag's identity
 * is its data payload -- never an element reference. A source element that is
 * reordered or removed mid-drag therefore never breaks the drag. Paired with
 * @zakkster/lite-element (whose components survive synchronous insertBefore),
 * the items keep their state through a reorder too -- but lite-dnd needs no
 * knowledge of any component framework; it operates on raw Elements.
 *
 * State (isDragging, position, delta, isOver, order, activeDrag) is exposed as
 * @zakkster/lite-signal signals, so it composes with the consumer's effects.
 *
 * Zero-GC hot path: per pointermove no JS object is allocated by the library
 * itself. position(), delta() and activeDrag() return stable references whose
 * fields are mutated in place; reactivity is driven by a version-counter
 * signal. The only platform-mandated allocation per move is the DOMRect from
 * Element.getBoundingClientRect during hit-testing -- forced by the DOM spec
 * and outside the library's control.
 *
 * Public surface: {@link useDraggable}, {@link useDroppable}, {@link useSortable},
 * {@link activeDrag}, {@link DnDError}.
 */

import { signal } from "@zakkster/lite-signal";

/* --- Errors ---------------------------------------------------------------- */

/**
 * Typed error thrown synchronously for misuse.
 * `code` is one of: `invalid_target`, `invalid_options`, `not_supported`.
 */
export class DnDError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "DnDError";
        this.code = code;
    }
}

/* --- Helpers --------------------------------------------------------------- */

const isEl = (x) => !!x && typeof x === "object" && typeof x.addEventListener === "function" && typeof x.getBoundingClientRect === "function";
const winOf = (el) => (el.ownerDocument && el.ownerDocument.defaultView) || (typeof window !== "undefined" ? window : globalThis);
const asDisabled = (d) => (typeof d === "function" ? !!d() : !!d);

function requireEl(el, where) {
    if (!isEl(el)) throw new DnDError("invalid_target", `${where}: first argument must be a DOM element.`);
    const root = winOf(el);
    if (!root || typeof root.addEventListener !== "function") throw new DnDError("not_supported", `${where}: a DOM environment with window pointer events is required.`);
}
function checkFn(v, name, where) { if (v != null && typeof v !== "function") throw new DnDError("invalid_options", `${where}: ${name} must be a function.`); }
function checkCommon(o, where, axes) {
    if (o.axis != null && !axes.includes(o.axis)) throw new DnDError("invalid_options", `${where}: axis must be one of ${axes.map((a) => `'${a}'`).join(", ")}.`);
    if (o.threshold != null && (!Number.isFinite(o.threshold) || o.threshold < 0)) throw new DnDError("invalid_options", `${where}: threshold must be a non-negative number.`);
    if (o.disabled != null && typeof o.disabled !== "boolean" && typeof o.disabled !== "function") throw new DnDError("invalid_options", `${where}: disabled must be a boolean or a function.`);
    if (o.handle != null && typeof o.handle !== "string" && !isEl(o.handle)) throw new DnDError("invalid_options", `${where}: handle must be a selector string or an element.`);
}

// Does a pointerdown on `target` fall within the configured handle of `el`?
function handleAllows(el, handle, target) {
    if (!handle) return true;
    const h = typeof handle === "string" ? el.querySelector(handle) : handle;
    return !!h && (h === target || h.contains(target));
}

/* --- Pointer tracking core (shared by draggable + sortable) --------------- */
// Threshold-gated; listens on the owner window in the capture phase so the drag
// keeps flowing no matter what happens to the source node. onStart fires once
// the pointer passes `threshold`; onEnd always fires if a drag actually started.
// Squared-distance compare avoids Math.hypot's sqrt + function call.
function track(downEvent, root, captureEl, threshold, onStart, onMove, onEnd) {
    const id = downEvent.pointerId != null ? downEvent.pointerId : 1;
    const sx = downEvent.clientX, sy = downEvent.clientY;
    const t2 = threshold * threshold;
    const s = { x: sx, y: sy, dx: 0, dy: 0, cancelled: false }; // allocated once per drag, mutated thereafter
    let started = false, done = false;
    try { captureEl && captureEl.setPointerCapture && captureEl.setPointerCapture(id); } catch (_) {}

    function move(e) {
        if (e.pointerId != null && e.pointerId !== id) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        s.x = e.clientX; s.y = e.clientY; s.dx = dx; s.dy = dy;
        if (!started) { if (dx * dx + dy * dy < t2) return; started = true; onStart(s); }
        onMove(s);
    }
    function finish(cancelled, e) {
        if (done) return; done = true;
        root.removeEventListener("pointermove", move, true);
        root.removeEventListener("pointerup", up, true);
        root.removeEventListener("pointercancel", cancel, true);
        try { captureEl && captureEl.releasePointerCapture && captureEl.releasePointerCapture(id); } catch (_) {}
        if (started) { if (e && e.clientX != null) { s.x = e.clientX; s.y = e.clientY; } s.cancelled = cancelled; onEnd(s); }
    }
    function up(e) { if (e.pointerId != null && e.pointerId !== id) return; finish(false, e); }
    function cancel(e) { if (e.pointerId != null && e.pointerId !== id) return; finish(true, e); }

    root.addEventListener("pointermove", move, true);
    root.addEventListener("pointerup", up, true);
    root.addEventListener("pointercancel", cancel, true);
    return () => finish(true, null); // force-stop (used by destroy)
}

/* --- Droppable registry + global drag monitor ----------------------------- */

const _droppables = []; // array (not Set) so hitTest can iterate by index with zero per-frame allocation

// activeDrag is exposed as { data, over } | null. To stay zero-alloc across
// drag-to-drop-zone transitions, we mutate a single shared box and drive
// reactivity with a version-counter signal. The accessor returns either the
// shared box (during a drag) or null (idle).
const _activeBox = { data: undefined, over: null };
let _activeOn = false;
let _activeTick = 0;
const _activeVer = signal(0);

function setActive(data, over) {
    if (!_activeOn || _activeBox.data !== data || _activeBox.over !== over) {
        _activeBox.data = data; _activeBox.over = over; _activeOn = true;
        _activeVer.set(++_activeTick);
    }
}
function clearActive() {
    if (_activeOn) {
        _activeOn = false; _activeBox.data = undefined; _activeBox.over = null;
        _activeVer.set(++_activeTick);
    }
}

/**
 * Reactive read of the in-flight drag.
 * Returns `{ data, over }` while a drag is active, otherwise `null`. Tracks
 * inside effect()/computed() via lite-signal.
 *
 * The returned object is reused across transitions (mutated in place) for zero
 * per-move allocation; use its fields synchronously inside the effect (e.g.
 * `const a = activeDrag(); if (a) seeOver(a.over);`) and do not retain the
 * reference across frames.
 *
 * @returns {{ data: unknown, over: Element | null } | null}
 */
export function activeDrag() { _activeVer(); return _activeOn ? _activeBox : null; }

function dataType(data) { return data && typeof data === "object" ? data.type : undefined; }
function accepted(rec, data) {
    const a = rec.opts.accepts;
    if (a == null) return true;
    if (typeof a === "function") return !!a(data);
    if (Array.isArray(a)) return a.includes(dataType(data));
    return true;
}
// Innermost (smallest-area) registered droppable whose rect contains (x, y) and accepts data.
// One DOMRect alloc per droppable per call (platform-mandated by getBoundingClientRect);
// no library-side JS allocation.
function hitTest(x, y, data) {
    let best = null, bestArea = Infinity;
    for (let i = 0, n = _droppables.length; i < n; i++) {
        const rec = _droppables[i];
        if (asDisabled(rec.opts.disabled) || !accepted(rec, data)) continue;
        const r = rec.el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
            const area = Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);
            if (area < bestArea) { best = rec; bestArea = area; }
        }
    }
    return best;
}

/* --- useDraggable --------------------------------------------------------- */

/**
 * Make `el` draggable.
 *
 * The active drag is tracked on the element's owner window, so the element may
 * be reparented or removed mid-drag without breaking the drag. While dragging,
 * `el` carries a `data-dragging` attribute for CSS targeting.
 *
 * Reactive state is exposed as lite-signal accessors. position() and delta()
 * return stable, in-place-mutated objects (zero per-move allocation): read
 * their fields synchronously inside an effect and do not retain the reference
 * across frames.
 *
 * @param {Element} el - Element to make draggable.
 * @param {object} [opts]
 * @param {unknown} [opts.data] - Arbitrary payload carried by the drag; surfaced to droppables.
 * @param {string|Element} [opts.handle] - Restrict drag initiation to a handle (selector resolved within `el`, or an element).
 * @param {boolean|(() => boolean)} [opts.disabled] - Disable dragging (evaluated at pointerdown).
 * @param {"x"|"y"|"both"} [opts.axis="both"] - Constrain the reported delta to an axis.
 * @param {number} [opts.threshold=4] - Pixels the pointer must travel before a drag begins (distinguishes click from drag).
 * @param {(ctx: object) => void} [opts.onStart]
 * @param {(ctx: object) => void} [opts.onMove]
 * @param {(ctx: object) => void} [opts.onEnd]
 * @returns {{ isDragging: () => boolean, position: () => {x:number,y:number}, delta: () => {dx:number,dy:number}, data: unknown, destroy: () => void }}
 */
export function useDraggable(el, opts = {}) {
    requireEl(el, "useDraggable");
    checkCommon(opts, "useDraggable", ["x", "y", "both"]);
    for (const k of ["onStart", "onMove", "onEnd"]) checkFn(opts[k], k, "useDraggable");

    const root = winOf(el);
    const isDragging = signal(false);

    // Position & delta: shared mutable boxes + version-counter signals -> zero
    // per-move allocations. The accessor returns the shared object; values are
    // valid for synchronous reads inside an effect.
    const _pos = { x: 0, y: 0 };
    let _posTick = 0;
    const _posVer = signal(0);
    const position = () => { _posVer(); return _pos; };

    const _delta = { dx: 0, dy: 0 };
    let _delTick = 0;
    const _delVer = signal(0);
    const delta = () => { _delVer(); return _delta; };

    const axis = opts.axis || "both";
    let over = null, stop = null;

    const axisX = (dx) => (axis === "y" ? 0 : dx);
    const axisY = (dy) => (axis === "x" ? 0 : dy);

    // Drag context reused across callbacks within a single drag -- no per-move allocation.
    // It is only valid synchronously inside the callback; copy any field you need to retain.
    const _ctx = { data: opts.data, x: 0, y: 0, dx: 0, dy: 0, over: null, cancelled: false };
    const ctx = (s, target) => {
        _ctx.x = s.x; _ctx.y = s.y; _ctx.dx = axisX(s.dx); _ctx.dy = axisY(s.dy);
        _ctx.over = (target || over) ? (target || over).el : null;
        _ctx.cancelled = !!s.cancelled;
        return _ctx;
    };
    const setOver = (rec, s) => {
        if (rec === over) { if (rec && rec.opts.onOver) rec.opts.onOver(ctx(s, rec)); return; }
        if (over) { over.isOver.set(false); if (over.opts.onLeave) over.opts.onLeave(ctx(s, over)); }
        over = rec;
        if (rec) { rec.isOver.set(true); if (rec.opts.onEnter) rec.opts.onEnter(ctx(s, rec)); }
        setActive(opts.data, rec ? rec.el : null);
    };

    function onDown(e) {
        if (asDisabled(opts.disabled)) return;
        if (e.button != null && e.button !== 0) return;
        if (e.isPrimary === false) return;
        if (!handleAllows(el, opts.handle, e.target)) return;
        stop = track(e, root, el, opts.threshold != null ? opts.threshold : 4,
            (s) => {
                isDragging.set(true);
                el.setAttribute("data-dragging", "");
                setActive(opts.data, null);
                if (opts.onStart) opts.onStart(ctx(s));
            },
            (s) => {
                // Hot path: in-place mutate, then bump the version signal.
                if (_pos.x !== s.x || _pos.y !== s.y) { _pos.x = s.x; _pos.y = s.y; _posVer.set(++_posTick); }
                const ndx = axisX(s.dx), ndy = axisY(s.dy);
                if (_delta.dx !== ndx || _delta.dy !== ndy) { _delta.dx = ndx; _delta.dy = ndy; _delVer.set(++_delTick); }
                setOver(hitTest(s.x, s.y, opts.data), s);
                if (opts.onMove) opts.onMove(ctx(s));
            },
            (s) => {
                const target = s.cancelled ? null : hitTest(s.x, s.y, opts.data);
                if (target) {
                    target.isOver.set(false);
                    if (target.opts.onDrop) target.opts.onDrop(opts.data, ctx(s, target));
                }
                // Symmetry: every onEnter has a matching onLeave. If anyone was
                // 'over' at drop time, fire their onLeave (after onDrop, when
                // applicable). Their isOver is also cleared if not already.
                if (over) {
                    if (over !== target) over.isOver.set(false);
                    if (over.opts.onLeave) over.opts.onLeave(ctx(s, over));
                }
                el.removeAttribute("data-dragging");
                isDragging.set(false);
                if (_delta.dx !== 0 || _delta.dy !== 0) { _delta.dx = 0; _delta.dy = 0; _delVer.set(++_delTick); }
                clearActive();
                if (opts.onEnd) opts.onEnd(ctx(s, target));
                over = null; stop = null;
            });
    }

    el.addEventListener("pointerdown", onDown);

    let destroyed = false;
    return {
        isDragging, position, delta, data: opts.data,
        destroy() {
            if (destroyed) return;
            destroyed = true;
            el.removeEventListener("pointerdown", onDown);
            if (stop) stop();
            el.removeAttribute("data-dragging");
            over = null;
        },
    };
}

/* --- useDroppable --------------------------------------------------------- */

/**
 * Register `el` as a drop target.
 *
 * Drops are resolved by live rect hit-testing against the droppable registry;
 * the library never stores a stale element reference. When droppables overlap,
 * the innermost (smallest-area) rect containing the pointer wins.
 *
 * @param {Element} el - Element to register as a drop target.
 * @param {object} [opts]
 * @param {string[]|((data: unknown) => boolean)} [opts.accepts] - Accept only matching drags: an array of `data.type` strings, or a predicate over the payload.
 * @param {boolean|(() => boolean)} [opts.disabled] - Disable this drop target (evaluated during hit-testing).
 * @param {(ctx: object) => void} [opts.onEnter]
 * @param {(ctx: object) => void} [opts.onLeave]
 * @param {(ctx: object) => void} [opts.onOver]
 * @param {(data: unknown, ctx: object) => void} [opts.onDrop]
 * @returns {{ isOver: () => boolean, destroy: () => void }}
 */
export function useDroppable(el, opts = {}) {
    requireEl(el, "useDroppable");
    if (opts.accepts != null && !Array.isArray(opts.accepts) && typeof opts.accepts !== "function") {
        throw new DnDError("invalid_options", "useDroppable: accepts must be an array of type strings or a predicate function.");
    }
    if (opts.disabled != null && typeof opts.disabled !== "boolean" && typeof opts.disabled !== "function") {
        throw new DnDError("invalid_options", "useDroppable: disabled must be a boolean or a function.");
    }
    for (const k of ["onEnter", "onLeave", "onOver", "onDrop"]) checkFn(opts[k], k, "useDroppable");

    const isOver = signal(false);
    const rec = { el, opts, isOver };
    _droppables.push(rec);

    let destroyed = false;
    return {
        isOver,
        destroy() {
            if (destroyed) return;
            destroyed = true;
            const i = _droppables.indexOf(rec);
            if (i >= 0) _droppables.splice(i, 1);
            isOver.set(false);
        },
    };
}

/* --- useSortable (managed reorder via native insertBefore) ---------------- */

/**
 * Make `container`'s element children sortable by dragging.
 *
 * Managed mode: lite-dnd reorders the DOM with native `insertBefore` during
 * the drag, preserving each item's DOM identity (and, for lite-element items,
 * their component state). For a virtual-DOM host, use the draggable/droppable
 * primitives and reorder your own data instead.
 *
 * `order()` is a permutation where `order[newIndex]` is the item's original
 * index at drag start. Apply with `next = order.map(i => prev[i])`.
 *
 * @param {Element} container - Container whose element children will be sorted.
 * @param {object} [opts]
 * @param {string} [opts.handle] - Restrict drag initiation on each item to a handle (selector resolved within the item).
 * @param {"x"|"y"} [opts.axis="y"] - Sort axis.
 * @param {boolean|(() => boolean)} [opts.disabled] - Disable sorting (evaluated at pointerdown).
 * @param {number} [opts.threshold=4] - Pixels the pointer must travel before sorting begins.
 * @param {(order: number[], ctx: { container: Element, item: Element }) => void} [opts.onReorder] - Called on drop with the final permutation.
 * @returns {{ isDragging: () => boolean, order: () => number[], destroy: () => void }}
 */
export function useSortable(container, opts = {}) {
    requireEl(container, "useSortable");
    checkCommon(opts, "useSortable", ["x", "y"]);
    checkFn(opts.onReorder, "onReorder", "useSortable");

    const root = winOf(container);
    const axis = opts.axis || "y";
    const isDragging = signal(false), order = signal(identity(container));
    let dragged = null, startIdx = null, stop = null; // startIdx: Map<child, original index>, built once per drag

    function computeOrder() {
        const kids = container.children, out = new Array(kids.length);
        for (let i = 0, n = kids.length; i < n; i++) out[i] = startIdx.get(kids[i]);
        return out;
    }
    function reorderTo(s) {
        const horiz = axis === "x";
        const p = horiz ? s.x : s.y;
        const kids = container.children; // live HTMLCollection, iterated by index (no per-frame allocation)
        let refNode = null;
        for (let i = 0, n = kids.length; i < n; i++) {
            const child = kids[i];
            if (child === dragged) continue;
            const r = child.getBoundingClientRect();
            const mid = horiz ? r.left + (r.right - r.left) / 2 : r.top + (r.bottom - r.top) / 2;
            if (p < mid) { refNode = child; break; }
        }
        // Mutate the DOM (and recompute order) only when the position actually changes.
        // Reordering every frame would needlessly fire lite-element's reconnect teardown.
        if (refNode == null) { if (container.lastChild !== dragged) { container.appendChild(dragged); order.set(computeOrder()); } }
        else if (refNode !== dragged && dragged.nextSibling !== refNode) { container.insertBefore(dragged, refNode); order.set(computeOrder()); }
    }

    function onDown(e) {
        if (asDisabled(opts.disabled)) return;
        if (e.button != null && e.button !== 0) return;
        if (e.isPrimary === false) return;
        const kids = container.children;
        let item = null;
        for (let i = 0, n = kids.length; i < n; i++) { const c = kids[i]; if (c === e.target || c.contains(e.target)) { item = c; break; } }
        if (!item) return;
        if (!handleAllows(item, opts.handle, e.target)) return;
        dragged = item;
        startIdx = new Map();
        for (let i = 0, n = kids.length; i < n; i++) startIdx.set(kids[i], i);
        stop = track(e, root, item, opts.threshold != null ? opts.threshold : 4,
            () => { isDragging.set(true); item.setAttribute("data-dragging", ""); setActive(null, container); },
            (s) => reorderTo(s),
            (s) => {
                item.removeAttribute("data-dragging");
                isDragging.set(false);
                clearActive();
                const finalOrder = computeOrder();
                order.set(finalOrder);
                if (opts.onReorder && !s.cancelled) opts.onReorder(finalOrder, { container, item });
                dragged = null; startIdx = null; stop = null;
            });
    }

    container.addEventListener("pointerdown", onDown);

    let destroyed = false;
    return {
        isDragging, order,
        destroy() {
            if (destroyed) return;
            destroyed = true;
            container.removeEventListener("pointerdown", onDown);
            if (stop) stop();
            if (dragged) dragged.removeAttribute("data-dragging");
            dragged = null;
        },
    };
}

function identity(container) { const kids = container.children, out = new Array(kids.length); for (let i = 0, n = kids.length; i < n; i++) out[i] = i; return out; }
