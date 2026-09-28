import type { TFunction } from 'i18next';

import { SUPPORTED_LANGUAGES } from '@/lib/i18n/languages';
import type { WorkingSoundVariant } from '@/lib/voice/working-sound';
import type { ResponseScope } from '@/providers/opencode-provider';

export const RESPONSE_SCOPE_OPTIONS: { value: ResponseScope }[] = [
  { value: 'brief' },
  { value: 'balanced' },
  { value: 'detailed' },
];

export const WORKING_SOUND_OPTIONS: { value: WorkingSoundVariant }[] = [
  { value: 'soft' },
  { value: 'glass' },
];

export const LANGUAGE_OPTIONS: { value: string; label: string }[] = SUPPORTED_LANGUAGES.map((language) => ({ value: language.code, label: language.nativeName }));

const KNOWN_PROVIDER_IDS = new Set([
  'openai',
  'anthropic',
  'github-copilot',
  'google',
  'groq',
  'openrouter',
  'mistral',
  'xai',
  'azure',
]);

const GENERIC_API_KEY_PROVIDERS = new Set(['anthropic', 'azure', 'google', 'groq', 'mistral', 'openai', 'openrouter', 'xai']);

export function supportsGenericApiKey(providerId?: string) {
  return Boolean(providerId && GENERIC_API_KEY_PROVIDERS.has(providerId));
}

export function getProviderCopy(providerId: string, fallbackLabel: string, t: TFunction) {
  if (!KNOWN_PROVIDER_IDS.has(providerId)) {
    return {
      label: fallbackLabel,
      description: undefined,
    };
  }

  return {
    label: t(`settings:providerCopy.${providerId}.label`),
    description: t(`settings:providerCopy.${providerId}.description`),
  };
}
