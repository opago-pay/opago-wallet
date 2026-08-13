export function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.reject(new Error('Timeout must be a positive number of milliseconds.'));
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);

    operation.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      cause => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}
