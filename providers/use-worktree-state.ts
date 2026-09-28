import { useCallback, useState } from 'react';

import type { ScopedOpencodeClient } from '@/lib/opencode/client';
import type { Worktree } from '@/lib/opencode/types';
import {
  createWorktree as svcCreateWorktree,
  listWorktrees as svcListWorktrees,
  removeWorktree as svcRemoveWorktree,
  resetWorktree as svcResetWorktree,
} from '@/providers/services/workspace-service';

// Experimental worktree list plus its lifecycle actions. Creating or removing a
// worktree changes the workspace catalog, so those actions refresh it through
// the injected callback.
export function useWorktreeState({
  client,
  isCurrentClient,
  refreshWorkspaceCatalog,
}: {
  client: ScopedOpencodeClient;
  isCurrentClient: (candidate: object) => boolean;
  refreshWorkspaceCatalog: (silent?: boolean) => Promise<void>;
}) {
  const [worktrees, setWorktrees] = useState<(string | Worktree)[]>([]);

  const resetWorktrees = useCallback(() => setWorktrees([]), []);

  const refreshWorktrees = useCallback(async () => {
    const next = await svcListWorktrees(client);
    if (isCurrentClient(client)) setWorktrees(next);
  }, [client, isCurrentClient]);

  const createWorktree = useCallback(async (name?: string, startCommand?: string) => {
    await svcCreateWorktree(client, name?.trim() || undefined, startCommand?.trim() || undefined);
    await Promise.all([refreshWorktrees(), refreshWorkspaceCatalog(true)]);
  }, [client, refreshWorktrees, refreshWorkspaceCatalog]);

  const resetWorktree = useCallback(async (directory: string) => {
    await svcResetWorktree(client, directory);
    await refreshWorktrees();
  }, [client, refreshWorktrees]);

  const removeWorktree = useCallback(async (directory: string) => {
    await svcRemoveWorktree(client, directory);
    await Promise.all([refreshWorktrees(), refreshWorkspaceCatalog(true)]);
  }, [client, refreshWorktrees, refreshWorkspaceCatalog]);

  return {
    worktrees,
    refreshWorktrees,
    createWorktree,
    resetWorktree,
    removeWorktree,
    resetWorktrees,
  };
}
