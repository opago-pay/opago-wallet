/** Runtime compatibility profile from compliance pos-binding-runtime.md.
 * The immutable published 0.2.0 schema snapshots are not rewritten. */
export const isRuntimePosId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
