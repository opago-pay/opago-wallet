type Leaf = { id: string; value: number };
const MAX_LEAVES = 256;
const MAX_STATES = 4096;
const MAX_VISITS = 100_000;
const MAX_SATS = 2_100_000_000_000_000;

function valid(leaves: Leaf[], amount: number): boolean {
  return leaves.length <= MAX_LEAVES && Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_SATS &&
    leaves.every(leaf => typeof leaf.id === 'string' && leaf.id.length > 0 &&
      Number.isSafeInteger(leaf.value) && leaf.value > 0 && leaf.value <= MAX_SATS) &&
    new Set(leaves.map(leaf => leaf.id)).size === leaves.length;
}

/** Bounded exact-fit search; never changes balances, locks, keys or leaf objects. */
export function selectExactLeaves<T extends Leaf>(leaves: T[], amount: number): T[] | null {
  if (!valid(leaves, amount)) return null;
  const single = leaves.find(leaf => leaf.value === amount);
  if (single) return [single];
  const sorted = leaves.filter(leaf => leaf.value < amount).sort((a, b) => b.value - a.value);
  let remaining = amount;
  const greedy: T[] = [];
  for (const leaf of sorted) {
    if (leaf.value <= remaining) { greedy.push(leaf); remaining -= leaf.value; }
  }
  let best = remaining === 0 ? greedy : null;
  if (best?.length === 2) return best;

  type Choice = { leaf: T; previous: Choice | null; count: number };
  const states = new Map<number, Choice | null>([[0, null]]);
  let visits = 0;
  for (const leaf of sorted) {
    // Snapshot avoids using the same leaf twice, even when values repeat.
    for (const [sum, previous] of [...states]) {
      if (++visits > MAX_VISITS) return best;
      const next = sum + leaf.value;
      const count = (previous?.count ?? 0) + 1;
      if (next > amount || (best && count >= best.length)) continue;
      const choice = { leaf, previous, count };
      if (next === amount) {
        const selected: T[] = [];
        for (let node: Choice | null = choice; node; node = node.previous) selected.push(node.leaf);
        best = selected;
        if (best.length === 2) return best;
      } else if (!states.has(next) || states.get(next)!.count > count) {
        if (!states.has(next) && states.size >= MAX_STATES) return best;
        states.set(next, choice);
      }
    }
  }
  return best;
}

/** Minimum input count for a necessary swap; prefer smallest excess for one input. */
export function selectSwapLeaves<T extends Leaf>(leaves: T[], amount: number): T[] | null {
  if (!valid(leaves, amount)) return null;
  const sorted = [...leaves].sort((a, b) => b.value - a.value);
  const single = [...sorted].reverse().find(leaf => leaf.value >= amount);
  if (single) return [single];
  const selected: T[] = [];
  let total = 0;
  for (const leaf of sorted) {
    selected.push(leaf);
    total += leaf.value;
    if (total >= amount) return selected;
  }
  return null;
}

type LeafManager = {
  getAvailableLeaves(): Leaf[];
  selectLeaves(amounts: number[]): [Record<number, Leaf[]>, boolean];
  determineLeavesToSwap(amount: number): Leaf[];
};
const installed = new WeakSet<object>();

/**
 * Pinned SDK 0.7.12 extension of ONLY its synchronous selection functions.
 * The SDK still owns the mutex, AVAILABLE filtering, lock/state transitions,
 * renewal, network swap, failure recovery and actual transfer execution.
 */
export function installSparkLeafSelection(value: unknown): void {
  const manager = value as LeafManager | null;
  if (!manager || installed.has(manager) || typeof manager.getAvailableLeaves !== 'function' ||
      typeof manager.selectLeaves !== 'function' || typeof manager.determineLeavesToSwap !== 'function') return;
  const originalSelect = manager.selectLeaves;
  const originalSwap = manager.determineLeavesToSwap;
  manager.selectLeaves = function (amounts) {
    // Multi-output allocation keeps the SDK's existing behavior.
    if (amounts.length === 1) {
      const exact = selectExactLeaves(this.getAvailableLeaves(), amounts[0]);
      if (exact) return [{ 0: exact }, true];
    }
    return originalSelect.call(this, amounts);
  };
  manager.determineLeavesToSwap = function (amount) {
    return selectSwapLeaves(this.getAvailableLeaves(), amount) ?? originalSwap.call(this, amount);
  };
  installed.add(manager);
}
