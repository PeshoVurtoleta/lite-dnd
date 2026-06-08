// Type definitions for @zakkster/lite-dnd
// Project: https://www.npmjs.com/package/@zakkster/lite-dnd
// Definitions by: Zahary Shinikchiev

import type { ReadSignal } from "@zakkster/lite-signal";

export type DnDErrorCode = "invalid_target" | "invalid_options" | "not_supported";

/** Typed error thrown synchronously for misuse. `code` identifies the failure category. */
export class DnDError extends Error {
    name: "DnDError";
    code: DnDErrorCode;
    constructor(code: DnDErrorCode, message: string);
}

/** A boolean, or a function returning one (evaluated at pointerdown). */
export type MaybeDynamicBool = boolean | (() => boolean);

/**
 * Snapshot handed to drag/drop callbacks.
 *
 * For zero per-move allocation this object is reused across a drag's callbacks
 * (mutated in place between invocations). It is only valid synchronously inside
 * the callback that received it; copy any fields you need to retain.
 */
export interface DragContext {
    /** The draggable's data payload. */
    data: unknown;
    /** Current pointer position (viewport coordinates). */
    x: number;
    y: number;
    /** Pointer delta from drag start (axis-constrained for draggables). */
    dx: number;
    dy: number;
    /** The droppable element currently under the pointer, if any. */
    over: Element | null;
    /** True when the drag ended via cancellation (Escape / pointercancel). */
    cancelled: boolean;
}

export interface DraggableOptions {
    /** Arbitrary payload carried by the drag; surfaced to droppables. */
    data?: unknown;
    /** Restrict drag initiation to a handle (selector resolved within the element, or an element). */
    handle?: string | Element;
    /** Disable dragging (boolean or a function evaluated at pointerdown). */
    disabled?: MaybeDynamicBool;
    /** Constrain the reported delta to an axis. Default "both". */
    axis?: "x" | "y" | "both";
    /** Pixels the pointer must travel before a drag begins (distinguishes click from drag). Default 4. */
    threshold?: number;
    onStart?(ctx: DragContext): void;
    onMove?(ctx: DragContext): void;
    onEnd?(ctx: DragContext): void;
}

export interface DraggableHandle {
    /** Reactive: true while this element is being dragged. */
    readonly isDragging: ReadSignal<boolean>;
    /**
     * Reactive: current pointer position in viewport coordinates.
     *
     * Returns a stable, in-place-mutated object across the drag (zero
     * per-move allocation). Read its fields synchronously inside an effect --
     * e.g. `const { x, y } = drag.position();` -- do not retain the reference
     * across frames.
     */
    readonly position: ReadSignal<{ x: number; y: number }>;
    /**
     * Reactive: pointer delta from drag start (axis-constrained).
     *
     * Same shared-object contract as `position`: stable reference, fields
     * mutated in place. Destructure on read.
     */
    readonly delta: ReadSignal<{ dx: number; dy: number }>;
    /** The data payload passed in options. */
    readonly data: unknown;
    /** Detach all listeners and reset state. Idempotent. */
    destroy(): void;
}

export interface DroppableOptions {
    /** Accept only matching drags: a list of `data.type` strings, or a predicate over the payload. */
    accepts?: string[] | ((data: unknown) => boolean);
    /** Disable this drop target (boolean or a function evaluated during hit-testing). */
    disabled?: MaybeDynamicBool;
    onEnter?(ctx: DragContext): void;
    onLeave?(ctx: DragContext): void;
    onOver?(ctx: DragContext): void;
    onDrop?(data: unknown, ctx: DragContext): void;
}

export interface DroppableHandle {
    /** Reactive: true while an accepted drag is over this element. */
    readonly isOver: ReadSignal<boolean>;
    /** Unregister this drop target. Idempotent. */
    destroy(): void;
}

export interface SortableOptions {
    /** Restrict drag initiation on each item to a handle (selector resolved within the item). */
    handle?: string;
    /** Sort axis. Default "y". */
    axis?: "x" | "y";
    /** Disable sorting (boolean or a function evaluated at pointerdown). */
    disabled?: MaybeDynamicBool;
    /** Pixels the pointer must travel before sorting begins. Default 4. */
    threshold?: number;
    /**
     * Called on drop with the new order: an array where `order[newIndex]` is the
     * item's original index at drag start. Apply it to your data model with
     * `next = order.map(i => prev[i])`.
     */
    onReorder?(order: number[], ctx: { container: Element; item: Element }): void;
}

export interface SortableHandle {
    /** Reactive: true while an item in this container is being dragged. */
    readonly isDragging: ReadSignal<boolean>;
    /** Reactive: current order as a permutation of original indices (updates live during a drag). */
    readonly order: ReadSignal<number[]>;
    /** Detach listeners. Idempotent. */
    destroy(): void;
}

/**
 * Make an element draggable. The active drag is tracked on the element's owner
 * window, so the element may be reparented or removed mid-drag without breaking
 * the drag.
 */
export function useDraggable(el: Element, opts?: DraggableOptions): DraggableHandle;

/** Register an element as a drop target. Drops are resolved by rect hit-testing. */
export function useDroppable(el: Element, opts?: DroppableOptions): DroppableHandle;

/**
 * Make a container's element children sortable by dragging. Reordering is
 * performed with native `insertBefore`, preserving each item's DOM identity
 * (and, for @zakkster/lite-element items, their component state).
 */
export function useSortable(container: Element, opts?: SortableOptions): SortableHandle;

/**
 * Reactive read of the in-flight drag: `{ data, over }` while dragging,
 * otherwise null.
 *
 * The returned object is reused across transitions (mutated in place) for zero
 * per-move allocation; use its fields synchronously inside the effect and do
 * not retain the reference across frames.
 */
export function activeDrag(): { data: unknown; over: Element | null } | null;
