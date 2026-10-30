import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { jcs, utf8 } from './encoding';
import type { Candidate, SourcePage } from './tx-sync';

type Key = [string, string];
const compare = (a: Key, b: Key) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
/** Keyset pages, not array offsets: pruning/reordering cannot move unseen rows
 * behind a numeric offset. New facts before the cursor are read on the next cycle.
 * Include the fact digest so distinct observations sharing an identity survive.
 * This only reads existing journals; it never prunes or rewrites them. */
export function localSourcePage(items: Candidate[], cursor: string | null, skipped = 0): SourcePage {
  let after: Key | null = null;
  if (cursor !== null) {
    try { after = JSON.parse(cursor); } catch { throw new Error('sync_invalid_contract'); }
    if (!Array.isArray(after) || after.length !== 2 || typeof after[0] !== 'string' || !after[0] || after[0].length > 512 ||
      typeof after[1] !== 'string' || !/^[0-9a-f]{64}$/.test(after[1])) throw new Error('sync_invalid_contract');
  }
  const rows = items.map(item => {
    if (!item.localId || item.localId.length > 512) throw new Error('sync_invalid_contract');
    const { observed_at: ignored, ...facts } = item.report; void ignored;
    return { item, key: [item.localId, bytesToHex(sha256(utf8(jcs(facts))))] as Key };
  }).sort((a, b) => compare(a.key, b.key))
    .filter((row, index, all) => (!after || compare(row.key, after) > 0) && (!index || compare(row.key, all[index - 1].key) !== 0));
  const page = rows.slice(0, 50);
  return { items: page.map(row => row.item), next: rows.length > page.length ? JSON.stringify(page[page.length - 1].key) : null,
    skipped: cursor === null ? skipped : 0 };
}
