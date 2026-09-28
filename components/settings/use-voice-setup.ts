import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getVoiceCapabilitiesAsync, type VoiceCapabilities } from '@/lib/voice/capabilities';
import { openVoiceSettingsAsync, requestVoiceInputPermissionAsync } from '@/lib/voice/permissions';
import { speakText, stopSpeaking } from '@/lib/voice/speech-output';

/**
 * Voice permission + capability + playback-test controller shared by the
 * Settings voice check and the onboarding permissions step.
 *
 * `refreshStatus()` is read-only. Permission is only requested from `enable()`.
 * The playback test exercises the real TTS path so a stale voice id surfaces
 * here instead of silently failing inside conversation mode.
 */
export function useVoiceSetup({
  locale,
  rate,
  voiceId,
}: {
  locale?: string;
  rate: number;
  voiceId?: string;
}) {
  const { t } = useTranslation();
  const [capabilities, setCapabilities] = useState<VoiceCapabilities>();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [feedback, setFeedback] = useState<string>();

  const refreshStatus = useCallback(async () => {
    setIsRefreshing(true);
    try {
      setCapabilities(await getVoiceCapabilitiesAsync());
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const enable = useCallback(async () => {
    setFeedback(undefined);
    await requestVoiceInputPermissionAsync();
    await refreshStatus();
  }, [refreshStatus]);

  const openAppSettings = useCallback(async () => {
    await openVoiceSettingsAsync();
  }, []);

  const testPlayback = useCallback(async () => {
    setIsTesting(true);
    setFeedback(undefined);
    try {
      const started = await speakText({
        language: locale,
        onDone: () => setFeedback(undefined),
        onError: () => setFeedback(t('settings:voice.check.testFailed')),
        rate,
        text: t('settings:voice.check.testPhrase'),
        voice: voiceId,
      });
      if (!started) {
        setFeedback(t('settings:voice.check.testFailed'));
      }
    } finally {
      setIsTesting(false);
    }
  }, [locale, rate, t, voiceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate voice status once on mount.
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(
    () => () => {
      void stopSpeaking().catch(() => undefined);
    },
    [],
  );

  return {
    capabilities,
    clearFeedback: useCallback(() => setFeedback(undefined), []),
    enable,
    feedback,
    isRefreshing,
    isTesting,
    openAppSettings,
    refreshStatus,
    testPlayback,
  };
}
