import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ActivityIndicator,
  Appbar,
  Button,
  Card,
  Divider,
  IconButton,
  List,
  Snackbar,
  Text,
} from 'react-native-paper';

import { Colors, Fonts } from '@/constants/theme';
import { TextInput } from '@/components/ui/text-input';
import { TopTab } from '@/components/chat/chat-controls';
import { WorkspacePicker } from '@/components/ui/workspace-picker';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useOpencode } from '@/providers/opencode-provider';

export default function WorkspaceScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const colorScheme = useColorScheme() ?? 'light';
  const palette = Colors[colorScheme];
  const {
    activeProject,
    addWorkspace,
    connection,
    currentProjectPath,
    isRefreshingWorkspaceCatalog,
    projects,
    refreshWorkspaceCatalog,
    refreshWorkspaceStatus,
    selectProject,
    serverCapabilities,
    serverRootPath,
    searchWorkspaceFiles,
    openWorkspaceFile,
    workspaceFiles,
    workspaceFileStatuses,
    selectedWorkspaceFile,
    saveWorkspaceFile,
    vcsInfo,
    worktrees,
    refreshWorktrees,
    createWorktree,
    resetWorktree,
    removeWorktree,
  } = useOpencode();
  const [activePanel, setActivePanel] = useState<'files' | 'tools'>('files');
  const [workspacePickerVisible, setWorkspacePickerVisible] = useState(false);
  const [fileQuery, setFileQuery] = useState('');
  const [fileDetailsOpen, setFileDetailsOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<{ path: string; original: string; value: string }>();
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [worktreeName, setWorktreeName] = useState('');
  const [worktreeStartCommand, setWorktreeStartCommand] = useState('');
  const [isCreatingWorktree, setIsCreatingWorktree] = useState(false);
  const [isRefreshingWorktrees, setIsRefreshingWorktrees] = useState(false);
  const [updatingWorktree, setUpdatingWorktree] = useState<string>();
  const [error, setError] = useState<string>();

  const isRefreshing = isRefreshingWorkspaceCatalog;
  async function handleRefresh() {
    await Promise.all([refreshWorkspaceCatalog(), refreshWorkspaceStatus()])
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not refresh the workspace.'));
  }

  function confirmDestructive(title: string, message: string, actionLabel: string, action: () => void) {
    if (Platform.OS === 'web') {
      if (globalThis.confirm(`${title}\n\n${message}`)) action();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: actionLabel, style: 'destructive', onPress: action },
    ]);
  }

  return (
    <>
      <Appbar.Header
        style={[styles.header, { backgroundColor: palette.surface, paddingTop: insets.top, height: 64 + insets.top }]}
        statusBarHeight={0}
        elevated>
        <View style={styles.headerMain}>
          <Pressable accessibilityRole="button" accessibilityLabel="Change workspace" onPress={() => setWorkspacePickerVisible(true)} style={({ pressed }) => [styles.headerSelector, pressed && styles.headerSelectorPressed]}>
            <View style={styles.headerCopy}>
              <Text numberOfLines={1} variant="titleMedium" style={[styles.headerTitle, { color: palette.text }]}>{activeProject?.label || 'Workspace'}</Text>
              <Text numberOfLines={1} variant="bodySmall" style={{ color: palette.muted }}>{connection.status === 'connected' ? activeProject?.path || currentProjectPath || serverRootPath : connection.message}</Text>
            </View>
            <MaterialCommunityIcons name="chevron-down" size={20} color={palette.muted} />
          </Pressable>
        </View>
        <View style={styles.headerActions}>
          <Appbar.Action testID="workspace-sync-button" icon="sync" accessibilityLabel="Sync projects" onPress={() => void refreshWorkspaceCatalog()} />
          <Appbar.Action testID="workspace-refresh-button" icon="refresh" accessibilityLabel="Refresh workspace" onPress={() => void handleRefresh()} />
        </View>
      </Appbar.Header>
      <WorkspacePicker visible={workspacePickerVisible} testID="workspace-picker" projects={projects} activePath={activeProject?.path} onClose={() => setWorkspacePickerVisible(false)} onSelect={selectProject} onAdd={addWorkspace} />
      <View style={[styles.tabsRow, { backgroundColor: palette.surface, borderBottomColor: palette.border }]}>
        <TopTab active={activePanel === 'files'} label="Files" onPress={() => setActivePanel('files')} />
        <TopTab active={activePanel === 'tools'} label="Worktrees" onPress={() => setActivePanel('tools')} />
      </View>
      <ScrollView
        style={[styles.screen, { backgroundColor: palette.background }]}
        contentContainerStyle={[styles.content, styles.centeredContent]}
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void handleRefresh()} tintColor={palette.tint} />}>
      {activePanel === 'files' ? <Card mode="contained" style={styles.panel}>
        <Card.Title title="Workspace files" subtitle={vcsInfo?.branch ? `Branch: ${vcsInfo.branch}` : 'Search and inspect files'} />
        <Card.Content style={styles.fileSection}>
          <View style={[styles.renameRow, compact && styles.compactFormRow]}>
            <TextInput testID="workspace-file-search" mode="outlined" dense placeholder="Search files" value={fileQuery} onChangeText={setFileQuery} style={styles.renameInput} />
            <Button mode="contained" onPress={() => void searchWorkspaceFiles(fileQuery).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not search workspace files.'))}>Search</Button>
          </View>
          {serverCapabilities.fileStatus && workspaceFileStatuses.length > 0 ? <Text style={{ color: palette.muted }}>{workspaceFileStatuses.length} changed files</Text> : null}
          {workspaceFiles.map((path) => <List.Item key={path} title={path} onPress={() => void openWorkspaceFile(path).then(() => { setEditingFile(undefined); setFileDetailsOpen(true); }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not open the file.'))} />)}
          {selectedWorkspaceFile ? (
            <Modal visible={fileDetailsOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setFileDetailsOpen(false)}>
              <KeyboardAvoidingView style={{ flex: 1, backgroundColor: palette.background }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                <Appbar.Header statusBarHeight={0} style={{ backgroundColor: palette.surface, paddingTop: insets.top, height: 64 + insets.top }}>
                  <Appbar.BackAction accessibilityLabel="Close file" onPress={() => setFileDetailsOpen(false)} />
                  <Appbar.Content title={selectedWorkspaceFile.path.split('/').pop() || selectedWorkspaceFile.path} subtitle={selectedWorkspaceFile.path} />
                </Appbar.Header>
                <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: Math.max(insets.bottom, 16) + 16 }}>
            <View style={[styles.filePreview, { borderColor: palette.border, backgroundColor: palette.surface }]}>
              <Text variant="labelLarge" style={{ color: palette.text }}>{selectedWorkspaceFile.path}</Text>
              {editingFile?.path === selectedWorkspaceFile.path ? (
                <>
                  <Text style={{ color: palette.warning }}>Saving applies your edits as a VCS patch to the working tree. Review the changes before continuing.</Text>
                  <TextInput
                    testID="workspace-file-editor"
                    mode="outlined"
                    multiline
                    value={editingFile.value}
                    onChangeText={(value) => setEditingFile({ ...editingFile, value })}
                    style={[styles.fileEditor, styles.code]}
                  />
                  <View style={styles.inlineActions}>
                    <Button
                      testID="workspace-file-save-button"
                      mode="contained"
                      loading={isSavingFile}
                      disabled={isSavingFile || editingFile.value === editingFile.original}
                      onPress={() => {
                        setIsSavingFile(true);
                        void saveWorkspaceFile(editingFile.path, editingFile.original, editingFile.value)
                          .then(() => setEditingFile(undefined))
                          .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not save the file.'))
                          .finally(() => setIsSavingFile(false));
                      }}>
                      Save patch
                    </Button>
                    <Button disabled={isSavingFile} onPress={() => setEditingFile(undefined)}>Cancel</Button>
                  </View>
                </>
              ) : (
                <>
                  <Text selectable style={[styles.code, { color: palette.text }]}>{selectedWorkspaceFile.content.content}</Text>
                  {serverCapabilities.fileSave ? (
                    <Button
                      mode="outlined"
                      style={styles.selfStart}
                      onPress={() => setEditingFile({
                        path: selectedWorkspaceFile.path,
                        original: selectedWorkspaceFile.content.content,
                        value: selectedWorkspaceFile.content.content,
                      })}>
                      Edit
                    </Button>
                  ) : (
                    <Text style={{ color: palette.muted }}>Editing is not available on this server.</Text>
                  )}
                </>
              )}
            </View>
                </ScrollView>
              </KeyboardAvoidingView>
            </Modal>
          ) : null}
        </Card.Content>
      </Card> : null}

      {activePanel === 'tools' ? <Card mode="contained" style={styles.panel}>
        <Card.Title
          title="Worktrees"
          subtitle="Create isolated working directories or manage existing ones."
          right={() => (
            isRefreshingWorktrees
              ? <ActivityIndicator style={styles.headerAction} color={palette.tint} />
              : <IconButton
                  icon="refresh"
                  accessibilityLabel="Refresh worktrees"
                  disabled={!activeProject}
                  onPress={() => {
                    setIsRefreshingWorktrees(true);
                    void refreshWorktrees()
                      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not refresh worktrees.'))
                      .finally(() => setIsRefreshingWorktrees(false));
                  }}
                />
          )}
        />
        <Card.Content style={styles.worktreeSection}>
          <View style={[styles.worktreeForm, compact && styles.compactFormRow]}>
            <TextInput testID="workspace-worktree-name" mode="outlined" dense label="Name (optional)" value={worktreeName} onChangeText={setWorktreeName} style={styles.renameInput} />
            <TextInput testID="workspace-worktree-command" mode="outlined" dense label="Start command (optional)" value={worktreeStartCommand} onChangeText={setWorktreeStartCommand} style={styles.renameInput} />
            <Button
              testID="workspace-worktree-create"
              mode="contained"
              loading={isCreatingWorktree}
              disabled={!activeProject || isCreatingWorktree}
              onPress={() => {
                setIsCreatingWorktree(true);
                void createWorktree(worktreeName, worktreeStartCommand)
                  .then(() => { setWorktreeName(''); setWorktreeStartCommand(''); })
                  .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not create the worktree.'))
                  .finally(() => setIsCreatingWorktree(false));
              }}>
              Create
            </Button>
          </View>
          {worktrees.length === 0 ? <Text style={{ color: palette.muted }}>No worktrees available.</Text> : null}
          {worktrees.map((worktree, index) => {
            const directory = typeof worktree === 'string' ? worktree : worktree.directory;
            const title = typeof worktree === 'string' ? directory.split('/').filter(Boolean).pop() || directory : worktree.name;
            const detail = typeof worktree === 'string' || !worktree.branch ? directory : `${worktree.branch} · ${directory}`;
            return (
              <View key={directory}>
                <View style={[styles.archiveRow, compact && styles.compactArchiveRow]}>
                  <View style={styles.archiveCopy}>
                    <Text variant="titleMedium" style={{ color: palette.text }}>{title}</Text>
                    <Text selectable style={{ color: palette.muted }}>{detail}</Text>
                  </View>
                  <View style={styles.iconActions}>
                    {serverCapabilities.worktreeReset ? (
                      <IconButton
                        icon="backup-restore"
                        accessibilityLabel={`Reset ${title}`}
                        loading={updatingWorktree === directory}
                        disabled={updatingWorktree === directory}
                        iconColor={palette.danger}
                        onPress={() => confirmDestructive(
                          'Reset worktree?',
                          `This discards uncommitted changes in ${directory}.`,
                          'Reset',
                          () => {
                            setUpdatingWorktree(directory);
                            void resetWorktree(directory)
                              .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not reset the worktree.'))
                              .finally(() => setUpdatingWorktree(undefined));
                          },
                        )}
                      />
                    ) : null}
                    <IconButton
                      icon="delete-outline"
                      accessibilityLabel={`Remove ${title}`}
                      disabled={updatingWorktree === directory}
                      iconColor={palette.danger}
                      onPress={() => confirmDestructive(
                        'Remove worktree?',
                        `${directory} will be removed. This cannot be undone.`,
                        'Remove',
                        () => {
                          setUpdatingWorktree(directory);
                          void removeWorktree(directory)
                            .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not remove the worktree.'))
                            .finally(() => setUpdatingWorktree(undefined));
                        },
                      )}
                    />
                  </View>
                </View>
                {index < worktrees.length - 1 ? <Divider /> : null}
              </View>
            );
          })}
        </Card.Content>
      </Card> : null}
      </ScrollView>
      <Snackbar visible={Boolean(error)} onDismiss={() => setError(undefined)}>{error}</Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 28, width: '100%' },
  centeredContent: { maxWidth: 1100, alignSelf: 'center' },
  header: { elevation: 0 },
  headerMain: { alignSelf: 'stretch', flex: 1, justifyContent: 'center', minWidth: 0 },
  headerActions: { alignItems: 'center', flexDirection: 'row', flexShrink: 0 },
  headerSelector: { alignItems: 'center', alignSelf: 'stretch', borderRadius: 14, flexDirection: 'row', gap: 8, justifyContent: 'center', marginRight: 8, minHeight: 48, paddingRight: 4 },
  headerSelectorPressed: { opacity: 0.82 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { fontFamily: Fonts.display, fontWeight: '700' },
  tabsRow: { flexDirection: 'row', borderBottomWidth: 1 },
  actions: { flexDirection: 'row', gap: 12 },
  panel: { backgroundColor: 'transparent', borderRadius: 0 },
  listContent: { paddingHorizontal: 0 },
  filterRow: { paddingHorizontal: 16, paddingBottom: 8, alignItems: 'flex-start' },
  headerAction: { marginRight: 16, alignSelf: 'center' },
  sessionMeta: { alignItems: 'flex-end', justifyContent: 'center', gap: 4 },
  compactSessionMeta: { paddingHorizontal: 16, paddingBottom: 8, alignItems: 'flex-start' },
  sessionDetails: { flexDirection: 'row', gap: 8 },
  inlineActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  iconActions: { flexDirection: 'row', alignItems: 'center' },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  compactFormRow: { flexDirection: 'column', alignItems: 'stretch' },
  renameInput: { flex: 1 },
  emptyText: { paddingHorizontal: 16, paddingBottom: 8 },
  archiveRow: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  compactArchiveRow: { alignItems: 'flex-start', flexDirection: 'column' },
  archiveCopy: { flex: 1, minWidth: 0 },
  fileSection: { gap: 8, paddingHorizontal: 0 },
  filePreview: { margin: 16, padding: 12, borderWidth: 1, borderRadius: 12, gap: 8 },
  fileEditor: { minHeight: 240 },
  selfStart: { alignSelf: 'flex-start' },
  worktreeSection: { gap: 8 },
  worktreeForm: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  code: { fontFamily: 'monospace', fontSize: 12 },
  favoritesBar: { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 8, paddingVertical: 6 },
  favoritesScroll: { alignItems: 'center', gap: 6, paddingHorizontal: 8 },
  favoriteChip: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', paddingLeft: 12 },
  favoriteChipBody: { paddingVertical: 6, paddingRight: 4, maxWidth: 160 },
  favoriteChipBodyPressed: { opacity: 0.72 },
});
