import enChat from '@/lib/i18n/locales/en/chat.json';
import enCommon from '@/lib/i18n/locales/en/common.json';
import enNotifications from '@/lib/i18n/locales/en/notifications.json';
import enOnboarding from '@/lib/i18n/locales/en/onboarding.json';
import enSettings from '@/lib/i18n/locales/en/settings.json';
import enTerminal from '@/lib/i18n/locales/en/terminal.json';
import enWorkspace from '@/lib/i18n/locales/en/workspace.json';
import deChat from '@/lib/i18n/locales/de/chat.json';
import deCommon from '@/lib/i18n/locales/de/common.json';
import deNotifications from '@/lib/i18n/locales/de/notifications.json';
import deOnboarding from '@/lib/i18n/locales/de/onboarding.json';
import deSettings from '@/lib/i18n/locales/de/settings.json';
import deTerminal from '@/lib/i18n/locales/de/terminal.json';
import deWorkspace from '@/lib/i18n/locales/de/workspace.json';
import esChat from '@/lib/i18n/locales/es/chat.json';
import esCommon from '@/lib/i18n/locales/es/common.json';
import esNotifications from '@/lib/i18n/locales/es/notifications.json';
import esOnboarding from '@/lib/i18n/locales/es/onboarding.json';
import esSettings from '@/lib/i18n/locales/es/settings.json';
import esTerminal from '@/lib/i18n/locales/es/terminal.json';
import esWorkspace from '@/lib/i18n/locales/es/workspace.json';
import frChat from '@/lib/i18n/locales/fr/chat.json';
import frCommon from '@/lib/i18n/locales/fr/common.json';
import frNotifications from '@/lib/i18n/locales/fr/notifications.json';
import frOnboarding from '@/lib/i18n/locales/fr/onboarding.json';
import frSettings from '@/lib/i18n/locales/fr/settings.json';
import frTerminal from '@/lib/i18n/locales/fr/terminal.json';
import frWorkspace from '@/lib/i18n/locales/fr/workspace.json';
import hiChat from '@/lib/i18n/locales/hi/chat.json';
import hiCommon from '@/lib/i18n/locales/hi/common.json';
import hiNotifications from '@/lib/i18n/locales/hi/notifications.json';
import hiOnboarding from '@/lib/i18n/locales/hi/onboarding.json';
import hiSettings from '@/lib/i18n/locales/hi/settings.json';
import hiTerminal from '@/lib/i18n/locales/hi/terminal.json';
import hiWorkspace from '@/lib/i18n/locales/hi/workspace.json';
import jaChat from '@/lib/i18n/locales/ja/chat.json';
import jaCommon from '@/lib/i18n/locales/ja/common.json';
import jaNotifications from '@/lib/i18n/locales/ja/notifications.json';
import jaOnboarding from '@/lib/i18n/locales/ja/onboarding.json';
import jaSettings from '@/lib/i18n/locales/ja/settings.json';
import jaTerminal from '@/lib/i18n/locales/ja/terminal.json';
import jaWorkspace from '@/lib/i18n/locales/ja/workspace.json';
import ptChat from '@/lib/i18n/locales/pt/chat.json';
import ptCommon from '@/lib/i18n/locales/pt/common.json';
import ptNotifications from '@/lib/i18n/locales/pt/notifications.json';
import ptOnboarding from '@/lib/i18n/locales/pt/onboarding.json';
import ptSettings from '@/lib/i18n/locales/pt/settings.json';
import ptTerminal from '@/lib/i18n/locales/pt/terminal.json';
import ptWorkspace from '@/lib/i18n/locales/pt/workspace.json';
import zhChat from '@/lib/i18n/locales/zh/chat.json';
import zhCommon from '@/lib/i18n/locales/zh/common.json';
import zhNotifications from '@/lib/i18n/locales/zh/notifications.json';
import zhOnboarding from '@/lib/i18n/locales/zh/onboarding.json';
import zhSettings from '@/lib/i18n/locales/zh/settings.json';
import zhTerminal from '@/lib/i18n/locales/zh/terminal.json';
import zhWorkspace from '@/lib/i18n/locales/zh/workspace.json';

// Translation files are committed JSON and bundled at build time. There is no
// runtime or network loading, so switching languages never depends on I/O.
export const resources = {
  en: {
    common: enCommon,
    chat: enChat,
    workspace: enWorkspace,
    terminal: enTerminal,
    settings: enSettings,
    notifications: enNotifications,
    onboarding: enOnboarding,
  },
  es: {
    common: esCommon,
    chat: esChat,
    workspace: esWorkspace,
    terminal: esTerminal,
    settings: esSettings,
    notifications: esNotifications,
    onboarding: esOnboarding,
  },
  hi: {
    common: hiCommon,
    chat: hiChat,
    workspace: hiWorkspace,
    terminal: hiTerminal,
    settings: hiSettings,
    notifications: hiNotifications,
    onboarding: hiOnboarding,
  },
  de: {
    common: deCommon,
    chat: deChat,
    workspace: deWorkspace,
    terminal: deTerminal,
    settings: deSettings,
    notifications: deNotifications,
    onboarding: deOnboarding,
  },
  fr: {
    common: frCommon,
    chat: frChat,
    workspace: frWorkspace,
    terminal: frTerminal,
    settings: frSettings,
    notifications: frNotifications,
    onboarding: frOnboarding,
  },
  zh: {
    common: zhCommon,
    chat: zhChat,
    workspace: zhWorkspace,
    terminal: zhTerminal,
    settings: zhSettings,
    notifications: zhNotifications,
    onboarding: zhOnboarding,
  },
  pt: {
    common: ptCommon,
    chat: ptChat,
    workspace: ptWorkspace,
    terminal: ptTerminal,
    settings: ptSettings,
    notifications: ptNotifications,
    onboarding: ptOnboarding,
  },
  ja: {
    common: jaCommon,
    chat: jaChat,
    workspace: jaWorkspace,
    terminal: jaTerminal,
    settings: jaSettings,
    notifications: jaNotifications,
    onboarding: jaOnboarding,
  },
};

export const TRANSLATION_NAMESPACES = Object.keys(resources.en);
