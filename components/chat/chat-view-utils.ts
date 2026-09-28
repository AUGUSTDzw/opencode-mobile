import type { ModelOption, ReasoningLevel } from '@/providers/opencode-provider';

export const STARTER_PROMPT_KEYS = [
  'chat:starter.prompts.polish',
  'chat:starter.prompts.review',
  'chat:starter.prompts.implement',
];

export const REASONING_OPTIONS: { id: ReasoningLevel; labelKey: string }[] = [
  { id: 'low', labelKey: 'chat:reasoning.low' },
  { id: 'default', labelKey: 'chat:reasoning.default' },
  { id: 'high', labelKey: 'chat:reasoning.high' },
];

export const TRANSCRIPT_PAGE_SIZE = 20;

export function getModelLabel(models: ModelOption[], modelId: string | undefined, fallback: string) {
  const match = models.find((model) => model.id === modelId);
  return match ? match.label : fallback;
}

export function getAutoApproveIcon(autoApprove: boolean) {
  return autoApprove ? 'shield-check' : 'shield-key';
}
