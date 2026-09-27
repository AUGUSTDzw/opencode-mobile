import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Switch, Text as NativeText, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { OverlaySheet } from '@/components/ui/overlay-sheet';
import { SwipeRow } from '@/components/ui/swipe-row';
import { TextInput } from '@/components/ui/text-input';
import { WorkspacePicker, WorkspacePickerButton } from '@/components/ui/workspace-picker';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { formatRelativeTime, getSessionSubtitle } from '@/lib/opencode/format';
import type { Session } from '@/lib/opencode/types';
import { useOpencode } from '@/providers/opencode-provider';

export function ChatLibrary({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const palette = Colors[useColorScheme() ?? 'light'];
  const {
    activeProject, addWorkspace, archivedSessions, archiveSession, chatPreferences, clearFavoriteSession,
    createSession, currentSessionId, deleteSession, favoriteSessions, isFavoriteSession,
    openSession, openSessionInProject, projects, refreshArchivedSessions, refreshWorkspaceCatalog,
    renameSession, restoreSession, selectProject, serverCapabilities, sessionPreviewById,
    sessionStatuses, sessions, shareSession, toggleFavoriteSession, unshareSession,
    updateChatPreferences,
  } = useOpencode();
  const [workspaceVisible, setWorkspaceVisible] = useState(false);
  const [query, setQuery] = useState('');
  const [section, setSection] = useState<'active' | 'archived'>('active');
  const [renamingId, setRenamingId] = useState<string>();
  const [renameValue, setRenameValue] = useState('');
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState<string>();
  const needle = query.trim().toLowerCase();
  const matches = (title: string, detail = '') => `${title} ${detail}`.toLowerCase().includes(needle);
  const visibleSessions = sessions.filter((session) => !chatPreferences.hideSubagentChats || !session.parentID)
    .filter((session) => matches(session.title || 'Untitled chat', sessionPreviewById[session.id] || ''))
    .sort((left, right) => {
      const priority = (session: Session) => session.id === currentSessionId ? 0 : sessionStatuses[session.id]?.type === 'idle' ? 2 : 1;
      return priority(left) - priority(right) || right.time.updated - left.time.updated;
    });
  const visibleFavorites = favoriteSessions.filter((favorite) => matches(favorite.title || 'Untitled chat', favorite.projectPath));
  const visibleArchived = archivedSessions.filter((session) => matches(session.title || 'Untitled chat', session.directory));

  function confirm(title: string, message: string, action: string, run: () => void) {
    if (Platform.OS === 'web') { if (globalThis.confirm(`${title}\n\n${message}`)) run(); return; }
    Alert.alert(title, message, [{ text: 'Cancel', style: 'cancel' }, { text: action, style: 'destructive', onPress: run }]);
  }
  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id); setError(undefined);
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update chat.'); }
    finally { setBusyId(undefined); }
  }
  const close = () => { setWorkspaceVisible(false); setRenamingId(undefined); onClose(); };
  const open = (id: string) => void run(id, async () => { await openSession(id); close(); });

  return <>
    <OverlaySheet visible={visible && !workspaceVisible} title="Chats" testID="chat-library" onClose={close} headerAction={<WorkspacePickerButton onPress={() => { void refreshWorkspaceCatalog(); setWorkspaceVisible(true); }} />}>
      <TextInput mode="outlined" testID="chat-library-search" placeholder="Search chats" value={query} onChangeText={setQuery} />
      <Text variant="bodySmall" style={{ color: palette.muted }}>{activeProject?.label || 'Choose a workspace'} · Swipe left for actions</Text>
      <View style={styles.sectionTabs}>
        <Button compact mode={section === 'active' ? 'contained-tonal' : 'text'} onPress={() => setSection('active')}>Active</Button>
        {serverCapabilities.archive ? <Button compact mode={section === 'archived' ? 'contained-tonal' : 'text'} onPress={() => { setSection('archived'); void refreshArchivedSessions().catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load archived chats.')); }}>Archived</Button> : null}
        <View style={styles.filterToggle}><Text variant="labelMedium">Hide subagents</Text><Switch value={chatPreferences.hideSubagentChats} onValueChange={(hideSubagentChats) => updateChatPreferences({ hideSubagentChats })} accessibilityLabel="Hide subagent chats" /></View>
      </View>
      {error ? <Text style={{ color: palette.danger }}>{error}</Text> : null}
      {section === 'active' ? <>
        {visibleFavorites.length > 0 ? <Text variant="labelLarge" style={{ color: palette.muted }}>Favorites</Text> : null}
        {visibleFavorites.map((favorite) => <SwipeRow key={`${favorite.connectionScope}:${favorite.sessionId}`} title={favorite.title || 'Untitled chat'} actions={[{ label: 'Unfavorite', icon: 'star-off-outline', onPress: () => clearFavoriteSession(favorite.sessionId) }]}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${favorite.title || 'Untitled chat'}`} accessibilityHint="Swipe left to remove from favorites" onPress={() => void run(favorite.sessionId, async () => { await openSessionInProject(favorite.projectPath, favorite.sessionId, favorite.connectionScope); close(); })} style={[styles.sessionItem, { borderColor: palette.border }]}>
            <MaterialCommunityIcons name="star" size={20} color={palette.tint} /><View style={styles.sessionText}><NativeText numberOfLines={1} style={[styles.sessionTitle, { color: palette.text }]}>{favorite.title || 'Untitled chat'}</NativeText><NativeText numberOfLines={1} style={{ color: palette.muted }}>{favorite.projectPath.split('/').filter(Boolean).pop() || favorite.projectPath}</NativeText></View>
          </Pressable>
        </SwipeRow>)}
        <Text variant="labelLarge" style={{ color: palette.muted }}>Chats</Text>
        {visibleSessions.length === 0 ? <Text style={{ color: palette.muted }}>No chats found in this workspace.</Text> : null}
        {visibleSessions.map((session) => <View key={session.id}>
          <SwipeRow title={session.title || 'Untitled chat'} actions={[
            { label: 'Rename', icon: 'pencil-outline', onPress: () => { setRenamingId(session.id); setRenameValue(session.title || ''); } },
            { label: isFavoriteSession(session.id) ? 'Unfavorite' : 'Favorite', icon: isFavoriteSession(session.id) ? 'star-off-outline' : 'star-outline', onPress: () => toggleFavoriteSession(session.id, activeProject?.path || '', session.title) },
            ...(serverCapabilities.share ? [{ label: session.share?.url ? 'Unshare' : 'Share', icon: 'share-variant-outline' as const, onPress: () => {
              const share = () => void run(session.id, async () => { if (session.share?.url) await unshareSession(session.id); else { const result = await shareSession(session.id); if (result.share?.url) await Clipboard.setStringAsync(result.share.url); } });
              if (session.share?.url) share(); else confirm('Share session publicly?', 'Anyone with the link may view this session.', 'Share', share);
            } }] : []),
            ...(serverCapabilities.archive ? [{ label: 'Archive', icon: 'archive-outline' as const, onPress: () => void run(session.id, () => archiveSession(session.id)) }] : []),
            { label: 'Delete', icon: 'delete-outline', onPress: () => confirm('Delete session?', `“${session.title || 'Untitled chat'}” and all its data will be permanently deleted.`, 'Delete', () => void run(session.id, () => deleteSession(session.id))) },
          ]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Open ${session.title || 'Untitled chat'}`} accessibilityHint="Swipe left for chat actions" onPress={() => open(session.id)} style={[styles.sessionItem, { backgroundColor: currentSessionId === session.id ? palette.background : 'transparent', borderColor: currentSessionId === session.id ? palette.tint : palette.border }]}>
              <MaterialCommunityIcons name={currentSessionId === session.id ? 'check-circle' : 'message-outline'} size={20} color={currentSessionId === session.id ? palette.tint : palette.muted} /><View style={styles.sessionText}><NativeText numberOfLines={1} style={[styles.sessionTitle, { color: palette.text }]}>{session.parentID ? '↳ ' : ''}{session.title || 'Untitled chat'}</NativeText><NativeText numberOfLines={1} style={{ color: palette.muted }}>{sessionPreviewById[session.id] || getSessionSubtitle(session)}</NativeText></View>
            </Pressable>
          </SwipeRow>
          {renamingId === session.id ? <View style={styles.renameRow}><TextInput testID="chat-library-title-input" mode="outlined" value={renameValue} onChangeText={setRenameValue} style={styles.renameInput} /><Button onPress={() => void run(session.id, async () => { await renameSession(session.id, renameValue); setRenamingId(undefined); })}>Save</Button><Button onPress={() => setRenamingId(undefined)}>Cancel</Button></View> : null}
        </View>)}
      </> : <>
        {visibleArchived.length === 0 ? <Text style={{ color: palette.muted }}>No archived chats.</Text> : null}
        {visibleArchived.map((session) => <SwipeRow key={session.id} title={session.title || 'Untitled chat'} actions={[
          { label: 'Restore', icon: 'restore', onPress: () => void run(session.id, () => restoreSession(session.id)) },
          { label: 'Delete', icon: 'delete-outline', onPress: () => confirm('Delete archived session?', `“${session.title || 'Untitled chat'}” and all its data will be permanently deleted.`, 'Delete', () => void run(session.id, async () => { await deleteSession(session.id); await refreshArchivedSessions(); })) },
        ]}><View style={[styles.sessionItem, { borderColor: palette.border }]}><MaterialCommunityIcons name="archive-outline" size={20} color={palette.muted} /><View style={styles.sessionText}><NativeText numberOfLines={1} style={[styles.sessionTitle, { color: palette.text }]}>{session.title || 'Untitled chat'}</NativeText><NativeText numberOfLines={1} style={{ color: palette.muted }}>{session.directory} · {formatRelativeTime(session.time.updated)}</NativeText></View></View></SwipeRow>)}
      </>}
      <Button icon="plus" disabled={!activeProject || Boolean(busyId)} onPress={() => void run('new', async () => { const session = await createSession(); await openSession(session.id); close(); })}>New chat</Button>
    </OverlaySheet>

    <WorkspacePicker visible={visible && workspaceVisible} testID="chat-workspace-picker" projects={projects} activePath={activeProject?.path} onClose={() => setWorkspaceVisible(false)} onSelect={(path) => { selectProject(path); close(); }} onAdd={async (path) => { await addWorkspace(path); close(); }} />
  </>;
}

const styles = StyleSheet.create({
  sectionTabs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  filterToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  sessionItem: { minHeight: 68, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  sessionText: { flex: 1, gap: 3 },
  sessionTitle: { fontSize: 16, fontWeight: '600' },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  renameInput: { flex: 1 },
});
