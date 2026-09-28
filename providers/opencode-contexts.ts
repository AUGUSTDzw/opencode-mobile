import { createContext, useContext, type Context } from 'react';

import type {
  CapabilitiesContextValue,
  ChatContextValue,
  ConnectionContextValue,
  ConversationContextValue,
  McpContextValue,
  OnboardingContextValue,
  PreferencesContextValue,
  SessionContextValue,
  TerminalContextValue,
  WorkspaceContextValue,
} from '@/providers/opencode-provider-types';

// Domain-scoped contexts for the single OpencodeProvider. Splitting the old
// 130-member context means a screen re-renders only when the domain it reads
// changes, and each consumer declares its real dependencies.

export const OnboardingContext = createContext<OnboardingContextValue | null>(null);
export const ConnectionContext = createContext<ConnectionContextValue | null>(null);
export const CapabilitiesContext = createContext<CapabilitiesContextValue | null>(null);
export const PreferencesContext = createContext<PreferencesContextValue | null>(null);
export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);
export const SessionContext = createContext<SessionContextValue | null>(null);
export const ChatContext = createContext<ChatContextValue | null>(null);
export const ConversationContext = createContext<ConversationContextValue | null>(null);
export const TerminalContext = createContext<TerminalContextValue | null>(null);
export const McpContext = createContext<McpContextValue | null>(null);

function useDomainValue<T>(context: Context<T | null>, name: string): T {
  const value = useContext(context);
  if (!value) {
    throw new Error(`${name} must be used inside OpencodeProvider.`);
  }
  return value;
}

export const useOnboarding = () => useDomainValue(OnboardingContext, 'useOnboarding');
export const useConnection = () => useDomainValue(ConnectionContext, 'useConnection');
export const useCapabilities = () => useDomainValue(CapabilitiesContext, 'useCapabilities');
export const usePreferences = () => useDomainValue(PreferencesContext, 'usePreferences');
export const useWorkspace = () => useDomainValue(WorkspaceContext, 'useWorkspace');
export const useSessions = () => useDomainValue(SessionContext, 'useSessions');
export const useChat = () => useDomainValue(ChatContext, 'useChat');
export const useConversation = () => useDomainValue(ConversationContext, 'useConversation');
export const useTerminal = () => useDomainValue(TerminalContext, 'useTerminal');
export const useMcp = () => useDomainValue(McpContext, 'useMcp');
