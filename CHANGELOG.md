# Changelog

All notable changes to `@zakkster/lite-dnd` are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-06-07

### Added
- `useDraggable(el, options?)` -- reparent-safe element dragging. Reactive
  `isDragging` / `position` / `delta` signals, `data` payload, `handle`
  (selector or element), `disabled` (boolean or function), `axis` constraint,
  `threshold` to distinguish a click from a drag, and `onStart`/`onMove`/`onEnd`
  callbacks. Sets a `data-dragging` attribute for the drag's duration.
- `useDroppable(el, options?)` -- drop targets resolved by live rect hit-testing.
  `accepts` as a `data.type` allowlist or a payload predicate, `disabled`
  (boolean or function), and `onEnter`/`onLeave`/`onOver`/`onDrop` callbacks.
  Reactive `isOver` signal. Overlapping targets resolve innermost (smallest
  area) first. `onEnter` and `onLeave` are guaranteed symmetric: every onEnter
  is paired with an onLeave, including at drop time (the entered droppable
  receives `onDrop` followed by `onLeave`) and on cancellation.
- `useSortable(container, options?)` -- managed reordering of element children
  via native `insertBefore`, preserving node identity (and lite-element
  component state). Reactive `isDragging` and `order` signals, `handle`, `axis`,
  `threshold`, `disabled`, and `onReorder(order, ctx)`. `order[newIndex]` is
  the item's original index at drag start.
- `activeDrag()` -- reactive read of the in-flight drag (`{ data, over }` or
  `null`) for global drop-zone affordances.
- `DnDError` -- typed error with a `code` of `invalid_target`, `invalid_options`,
  or `not_supported`.
- TypeScript definitions (`Dnd.d.ts`), reusing `@zakkster/lite-signal`'s
  `ReadSignal` type for state accessors.

### Notes
- **Reparent-safe by design.** The active drag is tracked on the element's
  owner window (not the node); a drag is keyed by its data payload rather than
  an element reference; sortable reorders run through native DOM moves. The
  dragged node may be reparented or removed mid-drag without interrupting the
  drag.
- **Zero-GC hot path.** Per pointermove the library allocates no JavaScript
  objects. `position()`, `delta()` and `activeDrag()` return stable references
  whose fields are mutated in place; reactivity is driven by a version-counter
  signal. Consumers read the fields synchronously inside an effect (typically
  via destructuring) and do not retain the returned reference across frames.
  The only platform-mandated per-move allocation is the `DOMRect` produced by
  `Element.getBoundingClientRect` during hit-testing, which is outside the
  library's control.
- `destroy()` is idempotent on every handle; calling it during an in-flight
  drag force-stops the drag and fires `onEnd` with `cancelled: true`.
- `@zakkster/lite-signal` (`^1.1.3`) is a peer dependency; the library has zero
  runtime dependencies of its own. ESM only.
- Out of scope for this release: custom floating drag-image clones, multi-touch
  / simultaneous drags, edge auto-scroll, keyboard-accessible dragging, and FLIP
  reorder animations. Cross-list moves are expressed with the draggable +
  droppable primitives.

[1.0.0]: https://github.com/PeshoVurtoleta/lite-dnd/releases/tag/v1.0.0
