export const portalSteps = ['source', 'preview', 'dependencies', 'validation', 'push', 'pr'] as const;
export type PortalStep = typeof portalSteps[number];
export function isPortalStep(value: unknown): value is PortalStep {
  return typeof value === 'string' && portalSteps.some((step) => step === value);
}

export type PortalPreview = {
  revision: string;
  action: 'add' | 'update';
  changed: boolean;
  repository: string;
  branch: string;
  sha: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
  warnings: string[];
};
export type PortalSourceDifference = {
  repository: string; branch: string; sha: string;
  saved: Record<string, unknown>; pushed: Record<string, unknown>;
};
export type PortalResult =
  | { status: 'needs-push'; source: PortalSourceDifference }
  | { status: 'preview'; preview: PortalPreview }
  | { status: 'submitted'; url: string; message: string }
  | { status: 'unchanged'; message: string };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function readPortalResponse(value: unknown): PortalResult {
  if (object(value)) {
    const source = value.source;
    if (value.status === 'needs-push' && object(source) && typeof source.repository === 'string' && typeof source.branch === 'string'
      && typeof source.sha === 'string' && /^[a-f0-9]{40}$/.test(source.sha) && object(source.saved) && object(source.pushed)) return value as PortalResult;
    if (value.status === 'unchanged' && typeof value.message === 'string') return value as PortalResult;
    if (value.status === 'submitted' && typeof value.message === 'string' && typeof value.url === 'string'
      && /^https:\/\/github\.com\/budaya-lab\/data-portal\/pull\/[1-9]\d*$/.test(value.url)) return value as PortalResult;
    const p = value.preview;
    if (value.status === 'preview' && object(p) && typeof p.revision === 'string' && /^[a-f0-9]{64}$/.test(p.revision)
      && typeof p.sha === 'string' && /^[a-f0-9]{40}$/.test(p.sha) && typeof p.repository === 'string' && typeof p.branch === 'string'
      && (p.action === 'add' || p.action === 'update') && typeof p.changed === 'boolean'
      && (p.before === null || object(p.before)) && object(p.after) && Array.isArray(p.warnings)
      && p.warnings.every((warning) => typeof warning === 'string')) return value as PortalResult;
  }
  throw new Error('Unexpected portal response. Preview again before submitting.');
}
