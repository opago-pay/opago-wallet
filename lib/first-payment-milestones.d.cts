export interface MilestoneStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
}
export type FirstMilestone = 'received' | 'sent' | 'review';
export function createMilestoneGate(storage: MilestoneStorage): { claim(wallet: string, milestone: FirstMilestone): Promise<boolean> };
export function eligibleHistoryEvent(item: {
  type: string; status: string; amountValue?: number; internalTransfer?: string;
} | null): 'received' | 'sent' | null;
