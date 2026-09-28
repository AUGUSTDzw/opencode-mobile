// Small provider-agnostic helpers that do not belong to a specific domain
// (project labels and grouping pending interactions by session).

export function getProjectLabel(path: string) {
  const normalized = path.trim().replace(/\/$/, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) || normalized || 'Project';
}

export function groupPendingRequestsBySession<T extends { id: string; sessionID: string }>(requests: T[]) {
  return requests.reduce<Record<string, T[]>>((acc, request) => {
    const existing = acc[request.sessionID] || [];
    if (existing.some((item) => item.id === request.id)) {
      return acc;
    }

    acc[request.sessionID] = [...existing, request];
    return acc;
  }, {});
}
