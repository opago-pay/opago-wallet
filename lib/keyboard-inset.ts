/** Full-screen modal coordinates: only compensate overlap not already removed
 * by Android's native adjustResize. This avoids double keyboard avoidance. */
export function modalKeyboardInset(viewportHeight: number, frame: { screenY: number; height: number } | null): number {
  if (!frame || !Number.isFinite(viewportHeight) || viewportHeight <= 0 || !Number.isFinite(frame.height) || frame.height <= 0) return 0;
  const top = Number.isFinite(frame.screenY) && frame.screenY > 0 ? frame.screenY : viewportHeight - frame.height;
  return Math.min(viewportHeight, Math.max(0, viewportHeight - top));
}
