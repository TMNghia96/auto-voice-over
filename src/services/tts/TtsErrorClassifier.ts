export function categorizeTtsError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('timeout') || message.includes('ETIMEDOUT')) return 'Network timeout';
  if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND')) return 'No internet connection';
  if (message.includes('429') || message.includes('rate limit')) return 'Rate limited';
  if (message.includes('ENOSPC')) return 'Disk space full';
  if (message.includes('EACCES') || message.includes('EPERM')) return 'Permission denied';
  return 'Unknown error';
}