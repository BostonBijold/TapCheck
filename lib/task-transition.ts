// How long the outgoing task card holds in its exit animation (globals.css's
// task-advance-out, 260ms) before the actual task switch happens — TaskFormScreen's
// `exiting` prop and the ring/checkbox view in TaskListSessionView.tsx both
// key off this same constant so the CSS duration and the JS hold that keeps
// the outgoing card mounted long enough to finish playing it never drift
// apart. Slightly longer than the CSS duration so the animation visibly
// settles before the swap instead of getting cut off mid-motion.
export const TASK_TRANSITION_MS = 280;
