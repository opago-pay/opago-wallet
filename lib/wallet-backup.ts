export const BACKUP_STATUS_KEY = 'opago_wallet_backup_v1';

export function readBackupStatus(raw: string | null, publicKey: string): 'required' | 'deferred' | 'verified' {
  try {
    const record = JSON.parse(raw || 'null');
    if (record?.publicKey !== publicKey) return 'required';
    return record.status === 'verified' || record.status === 'deferred' ? record.status : 'required';
  } catch {
    return 'required';
  }
}
