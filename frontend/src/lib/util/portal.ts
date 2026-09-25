/**
 * Moves an element to the end of `<body>`, and takes it away again.
 *
 * For a surface that covers the screen. Such a thing is laid out against the
 * viewport, but it is still a child of whatever rendered it — and a parent can
 * take it down with two ordinary, sensible declarations:
 *
 * - **`z-index` on an ancestor.** A positioned ancestor with a `z-index` opens
 *   a stacking context, and everything inside it is sorted *within* that
 *   context. A backdrop asking for `z-index: 100` inside a toolbar sitting at
 *   41 cannot get above anything at 42.
 * - **`pointer-events: none` on an ancestor.** It inherits. A container that
 *   switches taps off for itself and back on for the controls it knows about —
 *   which is how a floating toolbar lets taps through the gaps between its
 *   buttons — switches them off for anything else it happens to contain. The
 *   surface then looks completely normal and cannot be touched, and every tap
 *   lands on whatever is behind it.
 *
 * Both of those happened at once when the budget switcher put a sheet inside
 * the action dial: it could not be dismissed, and choosing a budget actually
 * pressed the navigation bar underneath. Neither declaration is wrong, and no
 * amount of z-index would have fixed either. The surface has to leave.
 *
 * Svelte keeps its own reference to the node, so moving it does not confuse
 * unmounting; `destroy` removes it either way, which also covers the case
 * where the component is torn down while the node is still parked on `body`.
 */
export function portal(node: HTMLElement) {
  document.body.appendChild(node)
  return {
    destroy() {
      node.remove()
    },
  }
}
