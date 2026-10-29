export interface Celebration { kind: string; id: number }
export function enqueueCelebration<T extends Celebration>(queue: T[], event: T): T[];
export function finishCelebration<T extends Celebration>(queue: T[], id: number): T[];
export function createReviewScheduler(options: {
  isActive(): boolean;
  requestReview(wallet: string): Promise<boolean>;
  schedule?(callback: () => void, delay: number): ReturnType<typeof setTimeout>;
  cancel?(timer: ReturnType<typeof setTimeout>): void;
  delay?: number;
}): {
  enqueue(wallet: string): void;
  onAppStateChange(state: string): void;
  pendingCount(): number;
};

export function attemptNativeReview(wallet: string, deps: {
  isCurrent(): boolean;
  isAvailable(): Promise<boolean>;
  hasClaim(wallet: string): Promise<boolean>;
  requestReview(): Promise<unknown>;
  claim(wallet: string): Promise<boolean>;
}): Promise<boolean>;

