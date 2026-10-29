'use strict';

// All claims for a given wallet+milestone share one in-process queue.
// The durable flag is written BEFORE any UI action or native review request.
const inFlight = new Map();
function createMilestoneGate(storage) {
  async function claim(wallet, milestone) {
    if (typeof wallet !== 'string' || !wallet || !['received', 'sent', 'review'].includes(milestone)) return false;
    const key = '@opago/first-payment/v1/' + encodeURIComponent(wallet) + '/' + milestone;
    const previous = inFlight.get(key) || Promise.resolve();
    const current = previous.catch(() => undefined).then(async () => {
      if (await storage.getItem(key)) return false;
      await storage.setItem(key, '1');
      return true;
    });
    inFlight.set(key, current);
    try { return await current; }
    finally { if (inFlight.get(key) === current) inFlight.delete(key); }
  }
  return { claim };
}
function eligibleHistoryEvent(item) {
  if (!item || !['incoming', 'outgoing'].includes(item.type) || (item.internalTransfer || item.legacyDeposit || item.operation?.kind === 'transfer')) return null;
  const status = String(item.status || '').toLowerCase();
  if (!['confirmed', 'completed', 'success'].includes(status) || !(Number(item.amountValue) > 0)) return null;
  return item.type === 'incoming' ? 'received' : 'sent';
}
module.exports = { createMilestoneGate, eligibleHistoryEvent };
