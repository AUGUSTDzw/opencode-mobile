import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

export type VoiceInputPermission = {
  granted: boolean;
  canAskAgain: boolean;
  available: boolean;
};

const UNAVAILABLE: VoiceInputPermission = { granted: false, canAskAgain: false, available: false };

function toPermission(result: { granted?: boolean; canAskAgain?: boolean } | undefined): VoiceInputPermission {
  if (!result) {
    return UNAVAILABLE;
  }

  return {
    granted: Boolean(result.granted),
    canAskAgain: Boolean(result.canAskAgain),
    available: true,
  };
}

/**
 * Reads the current microphone/speech-recognition permission without prompting.
 * Safe to call on mount; voice setup stays optional.
 */
export async function getVoiceInputPermissionAsync(): Promise<VoiceInputPermission> {
  try {
    return toPermission(await ExpoSpeechRecognitionModule.getPermissionsAsync());
  } catch {
    return UNAVAILABLE;
  }
}

/**
 * Prompts for microphone/speech-recognition permission. Called only from an
 * explicit "Enable voice input" action, never automatically.
 */
export async function requestVoiceInputPermissionAsync(): Promise<VoiceInputPermission> {
  try {
    return toPermission(await ExpoSpeechRecognitionModule.requestPermissionsAsync());
  } catch {
    return UNAVAILABLE;
  }
}
