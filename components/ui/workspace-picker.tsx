import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text as NativeText, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import type { OpencodeProject } from '@/providers/opencode-provider-types';
import { OverlaySheet } from './overlay-sheet';
import { TextInput } from './text-input';

export function WorkspacePickerButton({ onPress }: { onPress: () => void }) {
  const palette = Colors[useColorScheme() ?? 'light'];
  return <Pressable accessibilityRole="button" accessibilityLabel="Change workspace" onPress={onPress} style={styles.button}>
    <MaterialCommunityIcons name="folder-swap-outline" size={20} color={palette.tint} />
    <NativeText style={{ color: palette.tint }}>Workspace</NativeText>
  </Pressable>;
}

export function WorkspacePicker({ visible, onClose, projects, activePath, onSelect, onAdd, testID }: {
  visible: boolean;
  onClose: () => void;
  projects: OpencodeProject[];
  activePath?: string;
  onSelect: (path: string) => void;
  onAdd: (directory: string) => Promise<unknown>;
  testID?: string;
}) {
  const palette = Colors[useColorScheme() ?? 'light'];
  const [adding, setAdding] = useState(false);
  const [directory, setDirectory] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const close = () => { setAdding(false); setDirectory(''); setError(undefined); onClose(); };
  return <OverlaySheet visible={visible} title="Choose workspace" testID={testID} onClose={close}>
    {adding ? <View style={styles.addForm}>
      <Text style={{ color: palette.muted }}>Enter a folder path on the OpenCode server.</Text>
      <TextInput testID="workspace-add-path" mode="outlined" label="Server directory" value={directory} onChangeText={setDirectory} autoCapitalize="none" autoCorrect={false} />
      {error ? <Text style={{ color: palette.danger }}>{error}</Text> : null}
      <View style={styles.formActions}>
        <Button disabled={saving} onPress={() => { setAdding(false); setError(undefined); }}>Cancel</Button>
        <Button testID="workspace-add-submit" mode="contained" loading={saving} disabled={saving || !directory.trim()} onPress={() => {
          setSaving(true); setError(undefined);
          void onAdd(directory).then(close).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not add workspace.')).finally(() => setSaving(false));
        }}>Add workspace</Button>
      </View>
    </View> : <>
    <Button testID="workspace-add-button" icon="plus" mode="outlined" onPress={() => setAdding(true)}>Add workspace</Button>
    {projects.length === 0 ? <Text style={{ color: palette.muted }}>No workspaces available.</Text> : null}
    {projects.map((project) => <Pressable key={project.path} accessibilityRole="button" accessibilityLabel={`Select ${project.label}`} onPress={() => { onSelect(project.path); close(); }} style={[styles.project, { borderColor: project.path === activePath ? palette.tint : palette.border, backgroundColor: project.path === activePath ? palette.background : 'transparent' }]}>
      <MaterialCommunityIcons name={project.path === activePath ? 'check-circle' : 'folder-outline'} size={20} color={project.path === activePath ? palette.tint : palette.muted} />
      <View style={styles.projectText}>
        <NativeText style={[styles.projectTitle, { color: palette.text }]}>{project.label}</NativeText>
        <NativeText numberOfLines={1} style={{ color: palette.muted }}>{project.path}</NativeText>
      </View>
    </Pressable>)}
    </>}
  </OverlaySheet>;
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 44, paddingHorizontal: 6 },
  project: { minHeight: 68, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  projectText: { flex: 1, gap: 3 },
  projectTitle: { fontSize: 16, fontWeight: '600' },
  addForm: { gap: 12 },
  formActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 },
});
