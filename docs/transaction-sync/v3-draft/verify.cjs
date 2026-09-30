'use strict';

const assert = require('node:assert/strict');
const Ajv = require('ajv');
const schema = require('./observations.schema.json');
const catalog = require('./catalog.json');
const example = require('./examples.json');

const ajv = new Ajv({ allErrors: true });
const validateShape = ajv.compile(schema);
const fiat = (assetId) => assetId.startsWith('fiat:');

function validateBatch(batch, registry = catalog) {
  if (!validateShape(batch)) return { valid: false, reason: ajv.errorsText(validateShape.errors) };
  const eventIds = new Set();
  const sequences = new Set();
  const movements = new Map();
  const economicRefs = new Set();

  for (const item of batch.items) {
    if (eventIds.has(item.client_event_id)) return { valid: false, reason: 'duplicate client_event_id' };
    if (sequences.has(item.seq)) return { valid: false, reason: 'duplicate seq' };
    eventIds.add(item.client_event_id);
    sequences.add(item.seq);

    if (item.kind === 'movement') {
      const network = registry.networks[item.network_id];
      const asset = registry.assets[item.asset_id];
      if (!network || !network.rails.includes(item.rail_id) || !network.assets.includes(item.asset_id)) {
        return { valid: false, reason: 'unregistered network/rail/asset combination' };
      }
      if (!asset?.scales_by_rail?.[item.rail_id]?.includes(item.quantity.scale)) {
        return { valid: false, reason: 'unregistered asset/rail scale' };
      }
      if (!registry.movement_actions.includes(item.action_code)) {
        return { valid: false, reason: 'unregistered movement action' };
      }
      if ((item.action_code === 'send' && item.direction !== 'outgoing') ||
          (item.action_code === 'receive' && item.direction !== 'incoming')) {
        return { valid: false, reason: 'movement action/direction conflict' };
      }
      if (!registry.native_references_by_rail[item.rail_id]?.includes(item.native_ref.namespace)) {
        return { valid: false, reason: 'native reference does not match rail' };
      }
      const feeNamespace = registry.fee_native_references_by_rail[item.rail_id]?.includes(item.native_ref.namespace);
      if (item.action_code === 'fee' && (item.direction !== 'outgoing' || !feeNamespace)) {
        return { valid: false, reason: 'fee action requires outgoing fee reference' };
      }
      if (item.action_code !== 'fee' && feeNamespace) {
        return { valid: false, reason: 'fee reference requires fee action' };
      }
      const economicRef = [item.wallet_id, item.network_id, item.asset_id,
        item.native_ref.namespace, item.native_ref.value, item.native_ref.sub_index, item.direction].join('|');
      if (economicRefs.has(economicRef) && !item.supersedes_client_event_id) {
        return { valid: false, reason: 'duplicate economic movement without correction' };
      }
      economicRefs.add(economicRef);
      movements.set(item.client_event_id, item);
    } else {
      if (!registry.trade_actions.includes(item.action_code)) {
        return { valid: false, reason: 'unregistered trade action' };
      }
      for (const leg of [item.base, item.quote, ...item.fees]) {
        if (!leg) continue;
        const asset = registry.assets[leg.asset_id];
        if (!asset) return { valid: false, reason: 'unregistered trade asset' };
        const allowedScales = asset.scale === undefined
          ? Object.values(asset.scales_by_rail).flat()
          : [asset.scale];
        if (!allowedScales.includes(leg.quantity.scale)) {
          return { valid: false, reason: 'unregistered trade asset scale' };
        }
      }
      if (item.action_code === 'buy' || item.action_code === 'sell') {
        if (item.base && fiat(item.base.asset_id)) return { valid: false, reason: 'buy/sell base must be crypto' };
        if (item.quote && !fiat(item.quote.asset_id)) return { valid: false, reason: 'buy/sell quote must be fiat' };
      }
      if (item.action_code === 'swap' &&
          ((item.base && fiat(item.base.asset_id)) || (item.quote && fiat(item.quote.asset_id)))) {
        return { valid: false, reason: 'swap cannot use fiat leg' };
      }
      const settledSides = new Set();
      const settlementKeys = new Set();
      for (const settlement of item.settlement_refs) {
        const expected = settlement.side === 'base' ? item.base
          : settlement.side === 'quote' ? item.quote
            : item.fees.find(fee => fee.asset_id === settlement.asset_id);
        if (!expected || expected.asset_id !== settlement.asset_id) {
          return { valid: false, reason: 'settlement side/asset mismatch' };
        }
        if (fiat(settlement.asset_id)) {
          if (settlement.network_id !== null ||
              !registry.fiat_rails.includes(settlement.rail_id) ||
              !registry.fiat_native_references.includes(settlement.native_ref.namespace)) {
            return { valid: false, reason: 'invalid fiat settlement reference' };
          }
        } else {
          const network = registry.networks[settlement.network_id];
          if (!network || !network.rails.includes(settlement.rail_id) ||
              !network.assets.includes(settlement.asset_id) ||
              !registry.native_references_by_rail[settlement.rail_id]?.includes(settlement.native_ref.namespace)) {
            return { valid: false, reason: 'invalid crypto settlement reference' };
          }
        }
        const key = [settlement.asset_id, settlement.network_id, settlement.rail_id,
          settlement.native_ref.namespace, settlement.native_ref.value,
          settlement.native_ref.sub_index].join('|');
        if (settlementKeys.has(key)) return { valid: false, reason: 'duplicate settlement reference' };
        settlementKeys.add(key);
        settledSides.add(settlement.side);
      }
      if (item.status === 'settled' && (!settledSides.has('base') || !settledSides.has('quote'))) {
        return { valid: false, reason: 'settled trade requires base and quote references' };
      }
    }
  }

  for (const trade of batch.items.filter(item => item.kind === 'trade')) {
    for (const id of trade.linked_movement_ids) {
      const movement = movements.get(id);
      if (!movement) continue; // A linked observation may be in an earlier batch.
      if (movement.activity_id !== trade.activity_id) {
        return { valid: false, reason: 'linked movement belongs to another activity' };
      }
      if (trade.base && movement.asset_id !== trade.base.asset_id) {
        return { valid: false, reason: 'linked movement has wrong asset' };
      }
      if ((trade.action_code === 'buy' && movement.direction !== 'incoming') ||
          (trade.action_code === 'sell' && movement.direction !== 'outgoing')) {
        return { valid: false, reason: 'linked movement has wrong direction' };
      }
      if (trade.status === 'settled' && !trade.settlement_refs.some(ref =>
        ref.side === 'base' && ref.network_id === movement.network_id &&
        ref.asset_id === movement.asset_id && ref.rail_id === movement.rail_id &&
        ref.native_ref.namespace === movement.native_ref.namespace &&
        ref.native_ref.value === movement.native_ref.value &&
        ref.native_ref.sub_index === movement.native_ref.sub_index)) {
        return { valid: false, reason: 'linked movement lacks matching base settlement reference' };
      }
    }
  }
  return { valid: true };
}

const clone = () => structuredClone(example);
function rejects(change, reason) {
  const sample = clone();
  change(sample);
  const result = validateBatch(sample);
  assert.equal(result.valid, false);
  if (reason === 'schema') assert.match(result.reason, /oneOf/);
  else assert.equal(result.reason, reason);
}

assert.deepEqual(validateBatch(example), { valid: true });
rejects(sample => { sample.items[0].asset_id = 'hedera:mainnet/native:hbar'; },
  'unregistered network/rail/asset combination');
rejects(sample => { sample.items[2].quantity.scale = 11; }, 'unregistered asset/rail scale');
rejects(sample => { sample.items[1].direction = 'incoming'; }, 'movement action/direction conflict');
rejects(sample => { sample.items[2].native_ref.namespace = 'bitcoin.txid'; },
  'native reference does not match rail');
rejects(sample => { sample.items[2].native_ref.namespace = 'hedera.transaction_fee'; },
  'fee reference requires fee action');
rejects(sample => { sample.items[4].quote.asset_id = 'hedera:mainnet/native:hbar'; sample.items[4].quote.quantity.scale = 8; },
  'buy/sell quote must be fiat');
rejects(sample => { sample.items[4].amount_basis = 'estimated'; },
  'schema');
rejects(sample => { sample.items[0].quantity.atoms = '0'; },
  'schema');
rejects(sample => { sample.items[6].linked_movement_ids[0] = sample.items[3].client_event_id; },
  'linked movement belongs to another activity');
rejects(sample => { sample.items[4].settlement_refs[1].network_id = 'bitcoin:mainnet'; },
  'invalid fiat settlement reference');
rejects(sample => { sample.items[6].settlement_refs[0].native_ref.value = 'wrong-tx'; },
  'linked movement lacks matching base settlement reference');
rejects(sample => { sample.items[4].settlement_refs.pop(); }, 'schema');

const future = clone();
future.items = [{ ...future.items[2],
  network_id: 'hedera:mainnet',
  asset_id: 'hedera:mainnet/token:0.0.12345',
  quantity: { atoms: '123456', scale: 6 },
}];
const futureCatalog = structuredClone(catalog);
futureCatalog.networks['hedera:mainnet'].assets.push('hedera:mainnet/token:0.0.12345');
futureCatalog.assets['hedera:mainnet/token:0.0.12345'] = {
  symbol: 'SYNTHETIC', scales_by_rail: { hedera_native: [6] },
};
assert.deepEqual(validateBatch(future, futureCatalog), { valid: true });
assert.equal(validateBatch(future).reason, 'unregistered network/rail/asset combination');

console.log('Multi-asset contract draft: examples and negative cases verified.');
