export type OnchainNetwork = 'mainnet' | 'testnet' | 'signet' | 'regtest';
export type WalletAccount = 'bitcoin_onchain' | 'bitcoin_spark' | 'hedera';
export interface OnchainBalance {
  totalSats: number;
  confirmedSats: number;
  availableSats: number;
  pendingSats: number;
  reservedSats: number;
  updatedAt: number;
}
export interface OnchainTransaction {
  txid: string;
  receivedSats: number;
  sentSats: number;
  feeSats: number | null;
  confirmed: boolean;
  observedAt: number;
  outputs: { address: string | null; valueSats: number; owned: boolean; vout: number }[];
}
export interface OnchainQuote {
  version: 1;
  scope: string;
  network: OnchainNetwork;
  address: string;
  amountSats: number;
  feeSats: number;
  totalSats: number;
  feeRate: number;
  expiresAt: number;
  psbt: string;
  txid: string;
  vout: number;
  inputs: string[];
}
export type OnchainOperationState = 'prepared' | 'broadcast_pending' | 'broadcast' | 'confirmed' | 'aborted';
export interface OnchainOperation {
  version: 1;
  id: string;
  scope: string;
  network: OnchainNetwork;
  kind: 'send' | 'to_lightning' | 'from_lightning' | 'refund';
  state: OnchainOperationState;
  quote: OnchainQuote | null;
  address: string;
  amountSats: number;
  feeSats: number | null;
  txid: string | null;
  vout: number | null;
  rawTransaction: string | null;
  createdAt: string;
  updatedAt: string;
  refund?: import('./refund').RefundPlan;
  withdrawalQuote?: import('../bitcoin/onchain').PreparedBitcoinWithdrawal;
  actualFeeSats?: number;
  claimFeeSats?: number | null;
  sparkTransferId?: string;
  sparkScope: string | null;
  sparkOperationId: string | null;
  transferStage: 'waiting_onchain' | 'claim_required' | 'claim_checking' | 'completed' | 'refund_checking' | 'refunded' | null;
}
export interface OnchainJournal {
  list(scope: string): Promise<OnchainOperation[]>;
  reserve(operation: OnchainOperation): Promise<void>;
  update(scope: string, id: string, update: Partial<OnchainOperation>, expected?: Pick<Partial<OnchainOperation>, 'state' | 'transferStage'>): Promise<OnchainOperation>;
}
export interface OnchainWallet {
  readonly scope: string;
  readonly network: OnchainNetwork;
  receiveAddress(): Promise<string>;
  ownsAddress(address: string): boolean;
  sync(): Promise<OnchainBalance>;
  balance(): Promise<OnchainBalance>;
  transactions(): Promise<OnchainTransaction[]>;
  prepare(address: string, amountSats: number, assertCurrent: () => void): Promise<Readonly<OnchainQuote>>;
  send(quote: OnchainQuote, assertAuthorized: () => void, kind?: 'send' | 'to_lightning',
    spark?: { scope: string; operationId: string }): Promise<OnchainOperation>;
  rebroadcast(operation: OnchainOperation, assertCurrent: () => void): Promise<OnchainOperation>;
  cleanupConnections(): Promise<void>;
}
