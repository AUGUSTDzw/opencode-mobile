import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, HelperText } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TextInput } from '@/components/ui/text-input';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { isValidServerUrl } from '@/lib/opencode/client';

export type ConnectionProfileFormValues = {
  name: string;
  serverUrl: string;
  username: string;
  password: string;
};

// Mounted only while open, so its form state is seeded fresh each time. The
// parent owns what happens on submit (persist a profile, apply live settings,
// optionally connect).
export function ConnectionProfileDialog({
  title,
  submitLabel,
  showName = true,
  initial,
  onSubmit,
  onDismiss,
}: {
  title: string;
  submitLabel: string;
  showName?: boolean;
  initial?: Partial<ConnectionProfileFormValues>;
  onSubmit: (values: ConnectionProfileFormValues) => Promise<void> | void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const palette = Colors[useColorScheme() ?? 'light'];
  const [name, setName] = useState(initial?.name ?? '');
  const [serverUrl, setServerUrl] = useState(initial?.serverUrl ?? '');
  const [username, setUsername] = useState(initial?.username ?? '');
  const [password, setPassword] = useState(initial?.password ?? '');
  const [error, setError] = useState<string>();
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    const trimmedName = name.trim();
    const trimmedUrl = serverUrl.trim();
    if (showName && !trimmedName) {
      setError('Enter a name for this connection.');
      return;
    }
    if (!trimmedUrl) {
      setError('Enter the server URL.');
      return;
    }
    if (!isValidServerUrl(trimmedUrl)) {
      setError('Enter a complete server URL, such as http://192.168.1.10:4096.');
      return;
    }

    setError(undefined);
    setSaving(true);
    try {
      await onSubmit({
        name: trimmedName,
        serverUrl: trimmedUrl,
        username: username.trim(),
        password,
      });
    } catch (submitError) {
      // Keep the dialog open with the values intact so the user can retry.
      setError(submitError instanceof Error ? submitError.message : 'Could not save this connection.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={saving ? undefined : onDismiss}>
      <KeyboardAvoidingView style={[styles.screen, { backgroundColor: palette.background }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Appbar.Header statusBarHeight={0} style={{ backgroundColor: palette.surface, paddingTop: insets.top, height: 64 + insets.top }}>
          <Appbar.BackAction accessibilityLabel="Cancel" disabled={saving} onPress={onDismiss} />
          <Appbar.Content title={title} />
        </Appbar.Header>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {showName ? (
            <TextInput
              mode="outlined"
              label="Name"
              testID="connection-profile-name-input"
              value={name}
              onChangeText={setName}
              autoFocus
            />
          ) : null}
          <TextInput
            mode="outlined"
            label="Server URL"
            testID="connection-profile-url-input"
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="http://192.168.1.10:4096"
          />
          <TextInput
            mode="outlined"
            label="Username"
            testID="connection-profile-username-input"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            mode="outlined"
            label="Password"
            testID="connection-profile-password-input"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <HelperText type="error" visible={Boolean(error)}>{error}</HelperText>
        </ScrollView>
        <View style={[styles.actions, { backgroundColor: palette.surface, borderTopColor: palette.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Button testID="connection-profile-save-cancel" disabled={saving} onPress={onDismiss}>Cancel</Button>
          <Button mode="contained" testID="connection-profile-save-confirm" loading={saving} disabled={saving} onPress={() => void handleSubmit()}>
            {submitLabel}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 10 },
  actions: { borderTopWidth: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 12 },
});
