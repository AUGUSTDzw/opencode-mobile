import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, StyleSheet, View } from 'react-native';
import { Button, HelperText, Text } from 'react-native-paper';

import { OnboardingStep } from '@/components/onboarding/onboarding-step';
import { useNotificationSetup } from '@/components/settings/use-notification-setup';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getVoiceInputPermissionAsync,
  requestVoiceInputPermissionAsync,
  type VoiceInputPermission,
} from '@/lib/voice/permissions';

export default function OnboardingPermissionsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const palette = Colors[useColorScheme() ?? 'light'];
  const notifications = useNotificationSetup();
  const [voice, setVoice] = useState<VoiceInputPermission>();
  const [isEnablingVoice, setIsEnablingVoice] = useState(false);

  useEffect(() => {
    // Read-only: never prompts. Voice setup stays optional.
    void getVoiceInputPermissionAsync().then(setVoice);
  }, []);

  async function enableVoice() {
    setIsEnablingVoice(true);
    try {
      setVoice(await requestVoiceInputPermissionAsync());
    } finally {
      setIsEnablingVoice(false);
    }
  }

  const notificationsGranted = Boolean(notifications.status?.permissionGranted);
  const notificationsUnsupported = notifications.status?.notificationsSupported === false;

  return (
    <OnboardingStep
      step={5}
      totalSteps={6}
      title={t('onboarding:permissions.title')}
      subtitle={t('onboarding:permissions.subtitle')}
      testID="onboarding-permissions"
      onBack={() => router.back()}
      footer={
        <>
          <Button
            mode="text"
            testID="onboarding-permissions-skip"
            onPress={() => router.push('/onboarding/ready')}>
            {t('onboarding:permissions.skip')}
          </Button>
          <Button
            mode="contained"
            testID="onboarding-permissions-continue"
            onPress={() => router.push('/onboarding/ready')}>
            {t('onboarding:permissions.continue')}
          </Button>
        </>
      }>
      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.cardHeader}>
          <Text variant="titleSmall" style={{ color: palette.text }}>{t('onboarding:permissions.notifications.title')}</Text>
          <Text variant="labelSmall" style={{ color: notificationsGranted ? palette.success : palette.muted }}>
            {notificationsGranted ? t('common:labels.enabled') : t('common:labels.off')}
          </Text>
        </View>
        <Text variant="bodySmall" style={{ color: palette.muted }}>{t('onboarding:permissions.notifications.body')}</Text>
        {notificationsUnsupported ? (
          <HelperText type="info">{t('onboarding:permissions.notifications.unsupported')}</HelperText>
        ) : (
          <Button
            mode="contained-tonal"
            testID="onboarding-enable-notifications"
            disabled={notificationsGranted}
            loading={notifications.isRefreshing}
            onPress={() => void notifications.enable()}>
            {t('onboarding:permissions.notifications.enable')}
          </Button>
        )}
        {notifications.feedback ? <HelperText type="info">{notifications.feedback}</HelperText> : null}
        {Platform.OS === 'android' && notificationsGranted ? (
          <Button
            mode="text"
            testID="onboarding-review-battery"
            onPress={() => void notifications.openBatterySettings()}>
            {t('onboarding:permissions.notifications.battery')}
          </Button>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <View style={styles.cardHeader}>
          <Text variant="titleSmall" style={{ color: palette.text }}>{t('onboarding:permissions.voice.title')}</Text>
          <Text variant="labelSmall" style={{ color: voice?.granted ? palette.success : palette.muted }}>
            {voice?.granted ? t('common:labels.enabled') : t('common:labels.off')}
          </Text>
        </View>
        <Text variant="bodySmall" style={{ color: palette.muted }}>{t('onboarding:permissions.voice.body')}</Text>
        {voice?.available === false ? (
          <HelperText type="info">{t('onboarding:permissions.voice.unsupported')}</HelperText>
        ) : (
          <Button
            mode="contained-tonal"
            testID="onboarding-enable-voice"
            disabled={Boolean(voice?.granted)}
            loading={isEnablingVoice}
            onPress={() => void enableVoice()}>
            {t('onboarding:permissions.voice.enable')}
          </Button>
        )}
        {voice && voice.available && !voice.granted ? (
          <HelperText type="info">{t('onboarding:permissions.voice.deniedHint')}</HelperText>
        ) : null}
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, gap: 10, padding: 16 },
  cardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
});
