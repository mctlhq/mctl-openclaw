import { normalizeStringEntries } from "../../shared/string-normalization.js";

const MCTL_HOOK_SKILLS = [
  "mctl-agent-external",
  "mctl-platform",
  "mctl-gitops-remediation",
  "mctl-github-remediation",
] as const;

export function resolveSessionSkillFilter(sessionKey?: string): string[] | undefined {
  const normalized = sessionKey?.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized.includes(":hook:mctl-agent:")) {
    return [...MCTL_HOOK_SKILLS];
  }
  return undefined;
}

export function mergeSkillFilters(...filters: Array<string[] | undefined>): string[] | undefined {
  const normalized = filters
    .map((list) => {
      if (!Array.isArray(list)) {
        return undefined;
      }
      return normalizeStringEntries(list);
    })
    .filter((list): list is string[] => list !== undefined);
  if (normalized.length === 0) {
    return undefined;
  }
  let merged = normalized[0];
  for (const current of normalized.slice(1)) {
    if (merged.length === 0 || current.length === 0) {
      return [];
    }
    const currentSet = new Set(current);
    merged = merged.filter((name) => currentSet.has(name));
  }
  return merged;
}
