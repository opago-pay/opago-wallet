/** Let the loading interface paint before synchronous wallet/SDK work starts. */
export function yieldToUi(): Promise<void> {
  return new Promise(resolve => {
    let frame: number | undefined;
    let afterFrame: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(fallback);
      if (afterFrame !== undefined) clearTimeout(afterFrame);
      if (frame !== undefined) cancelAnimationFrame(frame);
      resolve();
    };
    // Animation frames may pause while the app is backgrounded. The caller
    // rechecks its session after this bounded wait, before accessing any keys.
    const fallback = setTimeout(finish, 150);
    if (typeof requestAnimationFrame === 'function') {
      frame = requestAnimationFrame(() => { afterFrame = setTimeout(finish, 0); });
    } else afterFrame = setTimeout(finish, 0);
  });
}
