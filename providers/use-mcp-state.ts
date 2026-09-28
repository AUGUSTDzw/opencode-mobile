import { useCallback, useState } from 'react';

import type { ScopedOpencodeClient } from '@/lib/opencode/client';
import type { McpLocalConfig, McpRemoteConfig, McpStatus } from '@/lib/opencode/types';
import {
  addMcpServer as svcAddMcpServer,
  completeMcpOAuth as svcCompleteMcpOAuth,
  connectMcpServer as svcConnectMcpServer,
  disconnectMcpServer as svcDisconnectMcpServer,
  getMcpStatus,
  setMcpServerEnabled as svcSetMcpServerEnabled,
  startMcpOAuth as svcStartMcpOAuth,
} from '@/providers/services/mcp-service';

// MCP server status plus its lifecycle actions. Enabling or adding a server can
// change the capability set, so those actions refresh chat capabilities through
// the injected callback.
export function useMcpState({
  client,
  isCurrentClient,
  refreshChatCapabilities,
}: {
  client: ScopedOpencodeClient;
  isCurrentClient: (candidate: object) => boolean;
  refreshChatCapabilities: () => Promise<void>;
}) {
  const [mcpStatuses, setMcpStatuses] = useState<Record<string, McpStatus>>({});

  const resetMcpState = useCallback(() => setMcpStatuses({}), []);

  const refreshMcpServers = useCallback(async () => {
    const next = await getMcpStatus(client);
    if (isCurrentClient(client)) setMcpStatuses(next);
  }, [client, isCurrentClient]);

  const addMcpServer = useCallback(async (name: string, config: McpLocalConfig | McpRemoteConfig) => {
    await svcAddMcpServer(client, name.trim(), config);
    await Promise.all([refreshMcpServers(), refreshChatCapabilities()]);
  }, [client, refreshChatCapabilities, refreshMcpServers]);

  const connectMcpServer = useCallback(async (name: string) => {
    await svcConnectMcpServer(client, name);
    await refreshMcpServers();
  }, [client, refreshMcpServers]);

  const disconnectMcpServer = useCallback(async (name: string) => {
    await svcDisconnectMcpServer(client, name);
    await refreshMcpServers();
  }, [client, refreshMcpServers]);

  const setMcpServerEnabled = useCallback(async (name: string, enabled: boolean) => {
    await svcSetMcpServerEnabled(client, name, enabled);
    await Promise.all([refreshMcpServers(), refreshChatCapabilities()]);
  }, [client, refreshChatCapabilities, refreshMcpServers]);

  const startMcpOAuth = useCallback(async (name: string) => {
    return (await svcStartMcpOAuth(client, name)).authorizationUrl;
  }, [client]);

  const completeMcpOAuth = useCallback(async (name: string, code: string) => {
    await svcCompleteMcpOAuth(client, name, code.trim());
    await refreshMcpServers();
  }, [client, refreshMcpServers]);

  return {
    mcpStatuses,
    refreshMcpServers,
    addMcpServer,
    connectMcpServer,
    disconnectMcpServer,
    setMcpServerEnabled,
    startMcpOAuth,
    completeMcpOAuth,
    resetMcpState,
  };
}
