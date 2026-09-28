import { createContext, useContext } from 'react';

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

function useDomainContext<T>(value: T | null, name: string): T {
  if (!value) {
    throw new Error(`${name} must be used inside OpencodeProvider.`);
  }
  return value;
}

export function useOnboarding() {
  return useDomainContext(useContext(OnboardingContext), 'useOnboarding');
}

export function useConnection() {
  return useDomainContext(useContext(ConnectionContext), 'useConnection');
}

export function useCapabilities() {
  return useDomainContext(useContext(CapabilitiesContext), 'useCapabilities');
}

export function usePreferences() {
  return useDomainContext(useContext(PreferencesContext), 'usePreferences');
}

export function useWorkspace() {
  return useDomainContext(useContext(WorkspaceContext), 'useWorkspace');
}

export function useSessions() {
  return useDomainContext(useContext(SessionContext), 'useSessions');
}

export function useChat() {
  return useDomainContext(useContext(ChatContext), 'useChat');
}

export function useConversation() {
  return useDomainContext(useContext(ConversationContext), 'useConversation');
}

export function useTerminal() {
  return useDomainContext(useContext(TerminalContext), 'useTerminal');
}

export function useMcp() {
  return useDomainContext(useContext(McpContext), 'useMcp');
}
