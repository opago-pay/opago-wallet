import type { OpagoAccount } from './account';
import { photoMatchReady } from './account';
import { OpagoError } from './api';
import type { UmaExchange, UmaDiscoveryVerified, UmaPayRequestOutput, UmaPayResponseOutput, RawHttpsResponse } from './contract-types';
import type { LightningInvoiceDetails } from '../lightning';

export type Disclosure = { id: string; receiver: string; amountMsat: number; maxFeeSats: number; expiresAt: number;
  providers: { name: string; domain: string; fields: string[] }[];
  kycStatus: 'NOT_VERIFIED'; version: string };
/** Trusted backend/KYA integration seam. 0.2.0 lacks a disclosure manifest; live UMA cannot
 * start until the team supplies a reviewed, amount/recipient-bound manifest and TRU decision.
 * This is NOT an invented public route or a wallet compliance decision. */
export interface UmaDisclosureProvider {
  readonly mode: 'backend' | 'contract-test';
  review(receiver: string, amountMsat: number, maxFeeSats: number): Promise<Disclosure>;
  assertCurrent(disclosure: Disclosure): Promise<void>;
}
export interface UmaPeerTransport {
  send(request: UmaExchange['request'] | UmaPayRequestOutput['request']): Promise<RawHttpsResponse>;
}
export type UmaPayment = { disclosure: Disclosure; consented: boolean; exchange?: UmaExchange; discovery?: UmaDiscoveryVerified;
  discoveryRaw?: RawHttpsResponse; payRaw?: RawHttpsResponse;
  request?: UmaPayRequestOutput; response?: UmaPayResponseOutput; invoice?: LightningInvoiceDetails;
  feeSats?: number; phase: 'consent' | 'preparing' | 'review' | 'submitting' | 'pending' | 'confirmed' | 'cancelled'; result?: string };

export function normalizeUmaAddress(value: string): string {
  const match = /^\$?([a-zA-Z0-9._-]{1,64})@([a-zA-Z0-9.-]+)$/.exec(value.trim());
  if (!match || !match[2].includes('.') || match[2].includes('..')) throw new Error('Invalid UMA address.');
  return '$' + match[1] + '@' + match[2].toLowerCase();
}
export function assertPeerUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.port && url.port !== '443') throw new Error('Invalid UMA target.');
  return url;
}
export function validateUmaInvoice(response: UmaPayResponseOutput, expected: {
  exchangeId: string; amountMsat: number; network: 'mainnet' | 'regtest'; now: number;
}, decode: (invoice: string) => LightningInvoiceDetails): LightningInvoiceDetails {
  if (response.exchange_id !== expected.exchangeId || response.amount_msat !== expected.amountMsat || response.network !== expected.network ||
      response.travel_rule_exchange !== 'complete' || response.failure_code !== null || !response.bolt11 ||
      !response.payment_hash || !response.invoice_description_hash || !response.expires_at) throw new OpagoError('uma_verification_failed');
  const network = response.bolt11.match(/^ln(bcrt|bc|tb|sb)(?=\d|1)/i)?.[1].toLowerCase();
  if (network !== (expected.network === 'mainnet' ? 'bc' : 'bcrt')) throw new Error('UMA invoice network mismatch.');
  const invoice = decode(response.bolt11); // Existing BOLT11 signature, amount, network and expiry checks.
  if (invoice.amountSats === null || invoice.amountSats * 1000 !== expected.amountMsat ||
      invoice.paymentHash !== response.payment_hash || invoice.descriptionHash !== response.invoice_description_hash ||
      !invoice.expiresAt || invoice.expiresAt !== Date.parse(response.expires_at) || invoice.expiresAt <= expected.now) throw new Error('UMA invoice does not match the approved payment.');
  return invoice;
}

export class UmaSending {
  payment: UmaPayment | null = null;
  private generation = 0;
  private confirming = false;
  private readonly key: string;
  constructor(readonly account: OpagoAccount, readonly disclosure: UmaDisclosureProvider, readonly peer: UmaPeerTransport,
    readonly decode: (invoice: string) => LightningInvoiceDetails) {
    this.key = account.operationKey('uma.state');
    if ((account.api.transport.mode === 'contract-test') !== (disclosure.mode === 'contract-test')) throw new Error('Test and live UMA cannot be mixed.');
  }
  async load() {
    this.payment = await this.account.store.read<UmaPayment>(this.key);
    // A crash after durable submission intent is ambiguous, never authorizes another send.
    if (this.payment?.phase === 'submitting') this.payment.phase = 'pending';
    if (this.payment?.phase === 'review') { this.payment.phase = 'preparing'; this.payment.consented = false; }
  }
  private save() { return this.account.store.write(this.key, this.payment); }
  private async ready() {
    await this.account.refresh();
    if (this.account.state.session?.scope !== 'wallet' || !photoMatchReady(this.account.state.wallet) ||
        this.account.state.wallet?.address?.status !== 'active') throw new OpagoError('address_pending_kyc');
  }
  async reviewDisclosure(receiver: string, amountSats: number, maxFeeSats: number) {
    if (this.payment && !['cancelled', 'confirmed'].includes(this.payment.phase)) throw new OpagoError('payment_already_open');
    if (!Number.isSafeInteger(amountSats) || amountSats <= 0 || !Number.isSafeInteger(amountSats * 1000) ||
        !Number.isSafeInteger(maxFeeSats) || maxFeeSats < 0) throw new Error('Invalid UMA amount or fee limit.');
    await this.ready();
    await this.account.finish('uma.discovery', 'uma.verify', 'uma.request', 'uma.response');
    const normalized = normalizeUmaAddress(receiver);
    const d = await this.disclosure.review(normalized, amountSats * 1000, maxFeeSats);
    if (d.receiver !== normalized || d.amountMsat !== amountSats * 1000 || d.maxFeeSats !== maxFeeSats || d.kycStatus !== 'NOT_VERIFIED' ||
        !d.id || !d.version || !Number.isFinite(d.expiresAt) || d.expiresAt <= this.account.now() || !d.providers.length ||
        d.providers.some(p => !p.name || !p.domain || !p.fields.length || p.fields.some(f => !f))) throw new Error('Required identity disclosure is unavailable.');
    const destinationDomain = normalized.split('@')[1];
    if (!d.providers.some(p => p.domain === destinationDomain)) throw new Error('Disclosure does not identify the receiving provider.');
    this.generation++; this.payment = { disclosure: d, consented: false, phase: 'consent' }; await this.save();
  }
  async consentAndPrepare(disclosureId: string, estimate: (invoice: LightningInvoiceDetails) => Promise<number>) {
    const p = this.payment;
    if (!p || p.disclosure.id !== disclosureId || !['consent', 'preparing'].includes(p.phase)) throw new Error('Review the identity disclosure again.');
    const generation = this.generation;
    const current = () => {
      if (generation !== this.generation || this.payment !== p || p.phase === 'cancelled') throw new Error('UMA preparation cancelled.');
      if (p.disclosure.expiresAt <= this.account.now()) throw new Error('Identity consent expired.');
    };
    await this.ready(); current(); await this.disclosure.assertCurrent(p.disclosure); current();
    p.consented = true; p.phase = 'preparing'; await this.save(); current();
    const fresh = (expiresAt: string) => { current(); if (Date.parse(expiresAt) <= this.account.now()) throw new Error('UMA exchange expired.'); };
    p.exchange ||= await this.account.mutate<UmaExchange>('uma.discovery', 'POST', '/api/v2/wallet/travel-rule/uma-discovery', { receiver_address: p.disclosure.receiver }, 'wallet');
    await this.save(); fresh(p.exchange.expires_at);
    const get = assertPeerUrl(p.exchange.request.url);
    const recipient = p.disclosure.receiver.split('@');
    if (get.hostname !== recipient[1] || decodeURIComponent(get.pathname) !== '/.well-known/lnurlp/' + recipient[0]) throw new Error('UMA discovery target mismatch.');
    if (!p.discovery) {
      const response = p.discoveryRaw || await this.peer.send(p.exchange.request); current();
      p.discoveryRaw = response; await this.save(); current();
      if (response.url !== p.exchange.request.url) throw new Error('UMA discovery was redirected.');
      p.discovery = await this.account.mutate<UmaDiscoveryVerified>('uma.verify', 'POST', '/api/v2/wallet/travel-rule/uma-discovery/verify', { exchange_id: p.exchange.exchange_id, response }, 'wallet');
      await this.save();
    }
    fresh(p.discovery.expires_at);
    if (p.discovery.exchange_id !== p.exchange.exchange_id || p.discovery.status !== 'uma_supported') throw new OpagoError('uma_not_supported');
    if (p.disclosure.amountMsat < p.discovery.min_sendable_msat || p.disclosure.amountMsat > p.discovery.max_sendable_msat) throw new OpagoError('amount_out_of_range');
    const callback = assertPeerUrl(p.discovery.callback);
    if (!p.disclosure.providers.some(provider => provider.domain === callback.hostname)) throw new Error('UMA callback provider is not covered by consent.');
    const metadata: unknown = JSON.parse(p.discovery.metadata);
    if (!Array.isArray(metadata) || !metadata.some(entry => Array.isArray(entry) && entry[0] === 'text/identifier' &&
        typeof entry[1] === 'string' && normalizeUmaAddress(entry[1]) === p.disclosure.receiver)) throw new Error('UMA recipient metadata mismatch.');
    p.request ||= await this.account.mutate<UmaPayRequestOutput>('uma.request', 'POST', '/api/v2/wallet/travel-rule/uma-pay-request', {
      exchange_id: p.exchange.exchange_id, amount_msat: p.disclosure.amountMsat,
    }, 'wallet');
    await this.save(); fresh(p.request.expires_at);
    if (p.request.exchange_id !== p.exchange.exchange_id || p.request.request.url !== p.discovery.callback) throw new Error('UMA pay request target mismatch.');
    if (!p.response) {
      // This is the first identity-bearing POST; consent is checked immediately before sending.
      await this.disclosure.assertCurrent(p.disclosure); current();
      const response = p.payRaw || await this.peer.send(p.request.request); current();
      p.payRaw = response; await this.save(); current();
      if (response.url !== p.request.request.url) throw new Error('UMA pay response was redirected.');
      p.response = await this.account.mutate<UmaPayResponseOutput>('uma.response', 'POST', '/api/v2/wallet/travel-rule/uma-pay-response', {
        exchange_id: p.exchange.exchange_id, request_id: p.request.request_id, response,
      }, 'wallet');
      await this.save();
    }
    current();
    p.invoice = validateUmaInvoice(p.response, { exchangeId: p.exchange.exchange_id, amountMsat: p.disclosure.amountMsat,
      network: this.account.identity.network, now: this.account.now() }, this.decode);
    p.feeSats = await estimate(p.invoice); current();
    if (!Number.isSafeInteger(p.feeSats) || p.feeSats < 0 || p.feeSats > p.disclosure.maxFeeSats) throw new Error('UMA fee exceeds the consented maximum.');
    p.phase = 'review'; await this.save();
  }
  async confirm(pay: (payment: UmaPayment, onDispatch: () => Promise<void>) => Promise<string>) {
    if (this.confirming) throw new Error('UMA confirmation already in progress.');
    this.confirming = true;
    try { await this.confirmOnce(pay); } finally { this.confirming = false; }
  }
  private async confirmOnce(pay: (payment: UmaPayment, onDispatch: () => Promise<void>) => Promise<string>) {
    const p = this.payment;
    if (!p || p.phase !== 'review' || !p.invoice || !p.consented) throw new Error('Confirm the reviewed UMA payment.');
    await this.ready();
    validateUmaInvoice(p.response!, { exchangeId: p.exchange!.exchange_id, amountMsat: p.disclosure.amountMsat,
      network: this.account.identity.network, now: this.account.now() }, this.decode);
    const generation = this.generation;
    let dispatched = false;
    p.phase = 'submitting'; await this.save();
    try {
      p.result = await pay(p, async () => {
        if (this.payment !== p || generation !== this.generation) throw new Error('UMA payment cancelled.');
        dispatched = true; p.phase = 'pending'; await this.save(); // Before SDK network dispatch, after device approval.
      });
      p.phase = 'confirmed'; await this.save();
    } catch (cause) {
      p.phase = dispatched ? 'pending' : 'review'; await this.save(); throw cause;
    }
  }
  async cancel() {
    if (this.payment && ['pending', 'submitting'].includes(this.payment.phase)) throw new Error('Payment outcome is pending. Check its status before sending again.');
    this.generation++; if (this.payment) this.payment.phase = 'cancelled'; await this.save();
    await this.account.finish('uma.discovery', 'uma.verify', 'uma.request', 'uma.response');
  }
  async reconcile(lookup: (hash: string) => Promise<'confirmed' | 'failed' | 'pending'>) {
    const p = this.payment;
    if (!p?.invoice || p.phase !== 'pending') return;
    const result = await lookup(p.invoice.paymentHash);
    if (result === 'confirmed') p.phase = 'confirmed';
    // A failed attempt is terminal too; a new user intent needs new discovery and consent.
    if (result === 'failed') p.phase = 'cancelled';
    await this.save();
  }
}
