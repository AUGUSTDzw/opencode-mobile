import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
  type ExpoSpeechRecognitionErrorEvent,
  type SetCategoryOptions,
} from 'expo-speech-recognition';

import {
  canFallbackToNetwork,
  describeVoiceInputError,
  type VoiceRecoveryAction,
} from '@/lib/voice/speech-errors';

// How long to wait after an on-device failure before retrying with network
// recognition. Short enough to feel automatic, long enough for the native
// recognizer to fully reset after emitting `error` + `end`. It is also shorter
// than the conversation-mode listening restart delay, so the retry claims the
// session before the state machine schedules its own restart.
const NETWORK_FALLBACK_DELAY_MS = 250;

// A dictation/observation session on iOS keeps the app in `playAndRecord`.
// Pinning the category and options makes the transition deterministic and keeps
// playback routed to the speaker instead of the receiver.
const IOS_RECOGNITION_CATEGORY: SetCategoryOptions = {
  category: 'playAndRecord',
  categoryOptions: ['defaultToSpeaker', 'allowBluetooth'],
  mode: 'measurement',
};

type StartOptions = { continuous?: boolean };

// `useSpeechInput` is mounted more than once (chat dictation and conversation
// mode) while the native recognizer is a singleton. These module-level values
// let only the instance that actually started the session drive the on-device
// -> network retry, and keep the other instance from racing it or flashing a
// transient error.
let activeOwner: string | undefined;
let activeOnDevice = false;
let fallbackInProgress = false;

export function useSpeechInput({
  levelStep = 1,
  locale,
  onResult,
  preferOnDevice,
  volumeUpdateIntervalMillis = 120,
}: {
  levelStep?: number;
  locale?: string;
  preferOnDevice: boolean;
  onResult: (transcript: string, isFinal: boolean) => void;
  volumeUpdateIntervalMillis?: number;
}) {
  const [error, setError] = useState<string>();
  const [errorCode, setErrorCode] = useState<ExpoSpeechRecognitionErrorEvent['error']>();
  const [errorAction, setErrorAction] = useState<VoiceRecoveryAction>('none');
  const [isListening, setIsListening] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [supportsLocalRecognition, setSupportsLocalRecognition] = useState(() => ExpoSpeechRecognitionModule.supportsOnDeviceRecognition());
  const [isAvailable, setIsAvailable] = useState(() => ExpoSpeechRecognitionModule.isRecognitionAvailable());
  const [level, setLevel] = useState(0);
  // Stable identity for this hook instance, used to coordinate the shared
  // native recognizer across the chat and conversation mounts.
  const ownerId = useId();
  const ignoreErrorsUntilRef = useRef(0);
  const lastLevelRef = useRef(0);
  // Once the on-device model proves unusable we stop asking for it, so a
  // conversation loop does not fail on every turn.
  const onDeviceFallbackRef = useRef(false);
  const lastStartOptionsRef = useRef<StartOptions>({});
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const restrictedRef = useRef(false);
  const canAskAgainRef = useRef(false);

  const quantizeLevel = useCallback(
    (value: number) => {
      const safeStep = Math.max(0.25, levelStep);
      return Math.round(Math.max(0, value) / safeStep) * safeStep;
    },
    [levelStep],
  );

  const shouldIgnoreError = useCallback((event: ExpoSpeechRecognitionErrorEvent) => {
    if (event.error === 'aborted') {
      return true;
    }

    if (event.error === 'client' && Date.now() < ignoreErrorsUntilRef.current) {
      return true;
    }

    return false;
  }, []);

  const clearPendingFallback = useCallback(() => {
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = undefined;
    }
    if (activeOwner === ownerId) {
      fallbackInProgress = false;
    }
  }, [ownerId]);

  const readCapabilities = useCallback(() => {
    let available = false;
    let onDevice = false;
    try {
      available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
      available = false;
    }
    try {
      onDevice = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    } catch {
      onDevice = false;
    }
    return { onDevice, available };
  }, []);

  useSpeechRecognitionEvent('start', () => {
    fallbackInProgress = false;
    setError(undefined);
    setErrorCode(undefined);
    setErrorAction('none');
    setIsStarting(false);
    setIsListening(true);
    ignoreErrorsUntilRef.current = 0;
  });

  useSpeechRecognitionEvent('end', () => {
    setIsListening(false);
    setIsStarting(false);
    lastLevelRef.current = 0;
    setLevel(0);
  });

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript?.trim();
    if (!transcript) {
      return;
    }

    if (event.isFinal) {
      ignoreErrorsUntilRef.current = Date.now() + 1500;
    }

    onResult(transcript, event.isFinal);
  });

  const startRecognition = useCallback(
    async (options: StartOptions = {}, forceNetwork = false) => {
      clearPendingFallback();
      setError(undefined);
      setErrorCode(undefined);
      setErrorAction('none');
      setIsStarting(true);
      ignoreErrorsUntilRef.current = 0;

      const capabilities = readCapabilities();
      setIsAvailable(capabilities.available);
      setSupportsLocalRecognition(capabilities.onDevice);

      if (!capabilities.available) {
        const info = describeVoiceInputError('service-not-allowed', undefined, {
          canAskAgain: canAskAgainRef.current,
          onDeviceRequested: false,
          restricted: restrictedRef.current,
        });
        setError(info.message);
        setErrorCode('service-not-allowed');
        setErrorAction(info.action);
        setIsStarting(false);
        return false;
      }

      const permissions = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      const nextRestricted = Boolean(permissions.restricted);
      const nextCanAskAgain = Boolean(permissions.canAskAgain);
      restrictedRef.current = nextRestricted;
      canAskAgainRef.current = nextCanAskAgain;

      if (!permissions.granted) {
        const info = describeVoiceInputError('not-allowed', undefined, {
          canAskAgain: nextCanAskAgain,
          onDeviceRequested: false,
          restricted: nextRestricted,
        });
        setError(info.message);
        setErrorCode('not-allowed');
        setErrorAction(info.action);
        setIsStarting(false);
        return false;
      }

      const wantsOnDevice = !forceNetwork && !onDeviceFallbackRef.current && preferOnDevice && capabilities.onDevice;
      lastStartOptionsRef.current = { continuous: options.continuous };

      try {
        ExpoSpeechRecognitionModule.start({
          addsPunctuation: true,
          continuous: options.continuous ?? Platform.OS !== 'ios',
          interimResults: true,
          iosCategory: IOS_RECOGNITION_CATEGORY,
          iosTaskHint: 'dictation',
          lang: locale || 'en-US',
          requiresOnDeviceRecognition: wantsOnDevice,
          volumeChangeEventOptions: {
            enabled: true,
            intervalMillis: volumeUpdateIntervalMillis,
          },
        });

        activeOwner = ownerId;
        activeOnDevice = wantsOnDevice;
        return true;
      } catch (startError) {
        setError(startError instanceof Error ? startError.message : 'Voice input failed to start.');
        setErrorCode(undefined);
        setErrorAction('retry');
        return false;
      } finally {
        setIsStarting(false);
      }
    },
    [clearPendingFallback, locale, ownerId, preferOnDevice, readCapabilities, volumeUpdateIntervalMillis],
  );

  useSpeechRecognitionEvent('error', (event) => {
    setIsStarting(false);
    if (shouldIgnoreError(event)) {
      setErrorCode(undefined);
      setIsListening(false);
      lastLevelRef.current = 0;
      setLevel(0);
      return;
    }

    const ownsSession = activeOwner === ownerId;

    // The on-device model may be missing (or Siri/Dictation disabled for it)
    // while the network recognizer still works. Only the instance that started
    // this session retries, once, with network recognition.
    if (ownsSession && canFallbackToNetwork(event.error, activeOnDevice) && !onDeviceFallbackRef.current) {
      onDeviceFallbackRef.current = true;
      activeOnDevice = false;
      setIsListening(false);
      lastLevelRef.current = 0;
      setLevel(0);
      clearPendingFallback();
      fallbackInProgress = true;
      fallbackTimeoutRef.current = setTimeout(() => {
        fallbackTimeoutRef.current = undefined;
        void startRecognition(lastStartOptionsRef.current, true);
      }, NETWORK_FALLBACK_DELAY_MS);
      return;
    }

    // Another instance is mid-retry; stay quiet instead of flashing a failure
    // that the retry may immediately resolve.
    if (fallbackInProgress && !ownsSession) {
      setIsListening(false);
      lastLevelRef.current = 0;
      setLevel(0);
      return;
    }

    const info = describeVoiceInputError(event.error, event.message, {
      canAskAgain: canAskAgainRef.current,
      onDeviceRequested: ownsSession && activeOnDevice,
      restricted: restrictedRef.current,
    });
    setError(info.message);
    setErrorCode(event.error);
    setErrorAction(info.action);
    setIsListening(false);
    lastLevelRef.current = 0;
    setLevel(0);
  });

  useSpeechRecognitionEvent('volumechange', (event) => {
    if (!isListening) {
      return;
    }

    const nextLevel = quantizeLevel(event.value);
    if (nextLevel === lastLevelRef.current) {
      return;
    }

    lastLevelRef.current = nextLevel;
    setLevel(nextLevel);
  });

  const start = useCallback(
    (options?: StartOptions) => startRecognition(options, false),
    [startRecognition],
  );

  const stop = useCallback(() => {
    clearPendingFallback();
    ignoreErrorsUntilRef.current = Date.now() + 1500;
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      // Ignore stop errors from transient native state.
    }
  }, [clearPendingFallback]);

  const abort = useCallback(() => {
    clearPendingFallback();
    ignoreErrorsUntilRef.current = Date.now() + 1500;
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch {
      // Ignore abort errors from transient native state.
    } finally {
      setIsListening(false);
      lastLevelRef.current = 0;
      setLevel(0);
    }
  }, [clearPendingFallback]);

  useEffect(() => () => clearPendingFallback(), [clearPendingFallback]);

  return useMemo(
    () => ({
      abort,
      error,
      errorAction,
      errorCode,
      isAvailable,
      isListening,
      isStarting,
      level,
      start,
      stop,
      supportsLocalRecognition,
    }),
    [
      abort,
      error,
      errorAction,
      errorCode,
      isAvailable,
      isListening,
      isStarting,
      level,
      start,
      stop,
      supportsLocalRecognition,
    ],
  );
}
