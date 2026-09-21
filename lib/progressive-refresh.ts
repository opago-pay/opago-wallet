import { withTimeout } from './promise-timeout';

export interface RefreshTask<T> {
  label: string;
  load(): Promise<T[]>;
}

/** Independent sources publish as they finish, in stable source-priority order. */
export async function refreshProgressively<T>(
  tasks: RefreshTask<T>[],
  onUpdate: (result: { batches: T[][]; errors: string[]; pending: number }) => void,
  timeoutMs: number,
): Promise<void> {
  const batches: (T[] | undefined)[] = Array(tasks.length);
  const errors: (string | undefined)[] = Array(tasks.length);
  let pending = tasks.length;
  await Promise.all(tasks.map(async (task, index) => {
    try {
      batches[index] = await withTimeout(
        Promise.resolve().then(() => task.load()), timeoutMs, task.label + ' refresh timed out.',
      );
    } catch (cause) {
      errors[index] = task.label + ': ' + (cause instanceof Error ? cause.message : 'Refresh unavailable.');
    }
    pending -= 1;
    onUpdate({
      batches: batches.filter((batch): batch is T[] => batch !== undefined),
      errors: errors.filter((error): error is string => error !== undefined),
      pending,
    });
  }));
}
