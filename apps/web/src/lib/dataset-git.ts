export const DEFAULT_COMMIT_MESSAGE = 'chore(metadata): update dataset metadata';
export type DatasetBranch = { status: 'ready'; branch: string; changes: string[]; ahead: number | null } | { status: 'unavailable'; message: string };

export function readDatasetBranch(value: unknown): DatasetBranch {
  if (value !== null && typeof value === 'object' && 'status' in value) {
    if (value.status === 'unavailable' && 'message' in value && typeof value.message === 'string') return value as DatasetBranch;
    if (value.status === 'ready' && 'branch' in value && typeof value.branch === 'string' && 'changes' in value && Array.isArray(value.changes)
      && value.changes.every((path) => path === 'datapackage.json' || path === 'README.md') && 'ahead' in value
      && (value.ahead === null || (Number.isSafeInteger(value.ahead) && Number(value.ahead) >= 0))) return value as DatasetBranch;
  }
  throw new Error('Could not read dataset Git status. Refresh its status before committing.');
}

export function hasDatasetChanges(state: DatasetBranch | undefined): boolean {
  return state?.status === 'ready' && (state.changes.length > 0 || state.ahead === null || state.ahead > 0);
}
export type DatasetCommitResult = { status: 'pushed' | 'unchanged'; branch: string; commit: string; message: string };
export type DatasetCommitReply = DatasetCommitResult | { status: 'error'; message: string };

export async function requestDatasetCommit(endpoint: string, text: () => string, message: string, branch: string, send: typeof fetch = fetch): Promise<DatasetCommitReply> {
  const response = await send(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: text(), message, branch }) });
  const value: unknown = await response.json();
  if (value !== null && typeof value === 'object' && 'message' in value && typeof value.message === 'string') {
    if (!response.ok || ('status' in value && value.status === 'error')) return { status: 'error', message: value.message };
    if ('status' in value && (value.status === 'pushed' || value.status === 'unchanged')
      && 'branch' in value && typeof value.branch === 'string' && 'commit' in value && typeof value.commit === 'string' && /^[a-f0-9]{40}$/.test(value.commit)) return value as DatasetCommitResult;
  }
  throw new Error('Commit/push response could not be confirmed. Refresh Git status before retrying.');
}
