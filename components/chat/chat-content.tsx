import { MaterialCommunityIcons } from '@expo/vector-icons';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, RefreshControl, ScrollView, View } from 'react-native';
import { ActivityIndicator, Button, Card, IconButton, ProgressBar, Text, TouchableRipple } from 'react-native-paper';

import { Colors } from '@/constants/theme';
import { ControlButton } from '@/components/chat/chat-controls';
import { DiffCard, PendingInteractionsCard, SessionDiffCard, TranscriptMessage } from '@/components/chat/chat-cards';
import type { TranscriptEntry } from '@/lib/opencode/format';
import type { FileDiff, Session, SessionStatus, Todo } from '@/lib/opencode/types';
import type { DiffScope, DiffTurn } from '@/providers/opencode-provider-types';
import type { PendingPermissionRequest, PendingQuestionAnswer, PendingQuestionRequest } from '@/lib/opencode/client';

import { styles } from '@/components/chat/chat-view-styles';
import { STARTER_PROMPTS } from '@/components/chat/chat-view-utils';

type Palette = typeof Colors.light;

// Skeleton placeholder shown during the initial transcript fetch. Avoids the
// "blank → populated list" snap users can read as a lock-up. Subtle opacity
// pulse (1.2s loop, native driver) signals active loading without thrashing
// the JS thread.
function TranscriptSkeletonImpl({ palette }: { palette: Palette }) {
  const [opacity] = useState(() => new Animated.Value(0.35));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 600, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  // Three placeholder bubbles mimic a typical user/assistant turn shape.
  const rows: { role: 'user' | 'assistant'; width: `${number}%` }[] = [
    { role: 'user', width: '60%' },
    { role: 'assistant', width: '90%' },
    { role: 'assistant', width: '75%' },
  ];
  return (
    <View style={styles.transcriptItem}>
      {rows.map((row, index) => (
        <Animated.View
          key={`skeleton-${index}`}
          style={[
            styles.skeletonRow,
            row.role === 'user' ? styles.skeletonUser : styles.skeletonAssistant,
            { width: row.width, backgroundColor: palette.surface, opacity },
          ]}
        />
      ))}
    </View>
  );
}

const TranscriptSkeleton = memo(TranscriptSkeletonImpl);

// Stable reference so FlashList does not treat every parent render as a prop
// change. Combined with the memoized TranscriptMessage rows this keeps
// streaming refreshes from re-rendering untouched rows.
const MAINTAIN_VISIBLE_CONTENT_POSITION = {
  autoscrollToBottomThreshold: 0,
  animateAutoScrollToBottom: false,
  startRenderingFromBottom: true,
} as const;
type DiffDetail = Extract<TranscriptEntry['details'][number], { kind: 'patch' }>;

const DIFF_SCOPE_OPTIONS: { value: DiffScope; label: string }[] = [
  { value: 'turn', label: 'Turn' },
  { value: 'uncommitted', label: 'Uncommitted' },
  { value: 'branch', label: 'Branch' },
];

type ChatContentProps = {
  activeSession?: Session;
  activeTab: 'session' | 'changes';
  awaitingUserInput: boolean;
  connection: { status: 'idle' | 'connecting' | 'connected' | 'error'; message: string };
  copiedMessageId?: string;
  currentActivityLabel?: string;
  currentDiffs: FileDiff[];
  currentDiffScope: DiffScope;
  currentPendingPermissions: PendingPermissionRequest[];
  currentPendingQuestions: PendingQuestionRequest[];
  currentTodos: Todo[];
  currentSessionId?: string;
  diffCount: number;
  diffDetails: DiffDetail[];
  diffTurns: DiffTurn[];
  displayTranscript: TranscriptEntry[];
  expandedDiffId?: string;
  isRefreshingDiffs: boolean;
  isRefreshingMessages: boolean;
  onCopyMessage: (entry: TranscriptEntry) => void;
  onForkMessage: (messageId: string) => void;
  onRevertMessage: (messageId: string) => void;
  onUnrevert: () => void;
  onExpandDiff: (id?: string) => void;
  onRefresh: () => void;
  onRefreshDiffs: () => void;
  onSelectDiffScope: (scope: DiffScope) => void;
  onSelectDiffMessage: (messageId: string) => void;
  selectedDiffMessageId?: string;
  onReplyToPermission: (requestId: string, reply: 'once' | 'always' | 'reject') => Promise<void>;
  onRejectQuestion: (requestId: string) => Promise<void>;
  onReplyToQuestion: (requestId: string, answers: PendingQuestionAnswer[]) => Promise<void>;
  onSendStarterPrompt: (prompt: string) => void;
  onToggleSpeak: (entry: TranscriptEntry) => void;
  palette: Palette;
  pendingInteractions: number;
  running: boolean;
  speakingMessageId?: string;
  status?: SessionStatus;
};

export function ChatContent({
  activeSession,
  activeTab,
  awaitingUserInput,
  connection,
  copiedMessageId,
  currentActivityLabel,
  currentDiffs,
  currentDiffScope,
  currentPendingPermissions,
  currentPendingQuestions,
  currentTodos,
  currentSessionId,
  diffCount,
  diffDetails,
  diffTurns,
  displayTranscript,
  expandedDiffId,
  isRefreshingDiffs,
  isRefreshingMessages,
  onCopyMessage,
  onForkMessage,
  onRevertMessage,
  onUnrevert,
  onExpandDiff,
  onRefresh,
  onRefreshDiffs,
  onSelectDiffScope,
  onSelectDiffMessage,
  selectedDiffMessageId,
  onRejectQuestion,
  onReplyToPermission,
  onReplyToQuestion,
  onSendStarterPrompt,
  onToggleSpeak,
  palette,
  pendingInteractions,
  running,
  speakingMessageId,
  status,
}: ChatContentProps) {
  const [todosExpanded, setTodosExpanded] = useState(false);
  const transcriptRef = useRef<FlashListRef<TranscriptEntry>>(null);
  const shouldPositionInitialTranscriptRef = useRef(false);
  const previousTranscriptRef = useRef({ sessionId: currentSessionId, length: displayTranscript.length });
  const completedTodoCount = currentTodos.filter((todo) => todo.status === 'completed').length;
  const isTurnScope = currentDiffScope === 'turn';
  const isLatestTurn = diffTurns.length === 0 || selectedDiffMessageId === diffTurns[diffTurns.length - 1]?.id;
  const scopeTitle = currentDiffScope === 'uncommitted'
    ? 'Uncommitted changes'
    : currentDiffScope === 'branch'
      ? 'Changes vs default branch'
      : isLatestTurn
        ? 'Latest turn diff'
        : 'Selected turn diff';
  const scopeEmptyMessage = currentDiffScope === 'uncommitted'
    ? 'No uncommitted changes.'
    : currentDiffScope === 'branch'
      ? 'No changes against the default branch.'
      : 'No file changes yet.';
  const showDiffDetails = isTurnScope && currentDiffs.length === 0;

  useLayoutEffect(() => {
    const previous = previousTranscriptRef.current;
    if (previous.sessionId !== currentSessionId || (previous.length === 0 && displayTranscript.length > 0)) {
      shouldPositionInitialTranscriptRef.current = true;
    }
    previousTranscriptRef.current = { sessionId: currentSessionId, length: displayTranscript.length };
  }, [currentSessionId, displayTranscript.length]);

  const extraData = useMemo(() => ({ copiedMessageId, speakingMessageId }), [copiedMessageId, speakingMessageId]);

  return (
    <View style={styles.chatArea}>
      {activeTab === 'session' ? (
        <FlashList
          key={currentSessionId || 'no-session'}
          ref={transcriptRef}
          data={displayTranscript}
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            currentTodos.length > 0 ? { paddingBottom: todosExpanded ? 320 : 76 } : null,
          ]}
          extraData={extraData}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          keyExtractor={(entry) => `${entry.id}-${entry.createdAt}`}
          maintainVisibleContentPosition={MAINTAIN_VISIBLE_CONTENT_POSITION}
          onContentSizeChange={() => {
            if (!shouldPositionInitialTranscriptRef.current || displayTranscript.length === 0) {
              return;
            }
            shouldPositionInitialTranscriptRef.current = false;
            transcriptRef.current?.scrollToEnd({ animated: false });
          }}
          refreshControl={<RefreshControl refreshing={isRefreshingMessages} onRefresh={onRefresh} tintColor={palette.tint} />}
          renderItem={({ item: entry }) => (
            <View style={styles.transcriptItem}>
              <TranscriptMessage
                canSpeak={entry.role === 'assistant' && Boolean(entry.text.trim())}
                copied={copiedMessageId === entry.id}
                entry={entry}
                onCopy={() => onCopyMessage(entry)}
                onFork={entry.role === 'user' ? () => onForkMessage(entry.id) : undefined}
                onRevert={entry.role === 'user' ? () => onRevertMessage(entry.id) : undefined}
                onToggleSpeak={() => onToggleSpeak(entry)}
                speaking={speakingMessageId === entry.id}
              />
            </View>
          )}
          ListHeaderComponent={connection.status === 'error' ? (
            <Card mode="contained" style={[styles.noticeCard, styles.transcriptItem, { backgroundColor: palette.surface }]}>
              <Card.Content>
                <Text variant="titleMedium" style={{ color: palette.text }}>Connection issue</Text>
                <Text variant="bodyMedium" style={{ color: palette.muted }}>{connection.message}</Text>
              </Card.Content>
            </Card>
          ) : null}
          ListEmptyComponent={isRefreshingMessages && currentSessionId ? (
            <TranscriptSkeleton palette={palette} />
          ) : (
            <Card mode="contained" style={[styles.emptyCard, { backgroundColor: palette.surface }]}>
              <Card.Content style={styles.emptyContent}>
                <Text variant="headlineSmall" style={[styles.emptyTitle, { color: palette.text }]}>Start a new task</Text>
                <Text variant="bodyMedium" style={{ color: palette.muted }}>
                  Keep the prompt specific and OpenCode will inspect the workspace, show progress, and stream back file changes.
                </Text>
                <View style={styles.promptStack}>
                  {STARTER_PROMPTS.map((prompt) => (
                    <TouchableRipple
                      key={prompt}
                      style={[styles.promptCard, { borderColor: palette.border, backgroundColor: palette.background }]}
                      onPress={() => onSendStarterPrompt(prompt)}>
                      <View style={styles.promptCardInner}>
                        <MaterialCommunityIcons name="lightning-bolt" size={18} color={palette.tint} />
                        <Text variant="bodyMedium" style={{ color: palette.text }}>{prompt}</Text>
                      </View>
                    </TouchableRipple>
                  ))}
                </View>
              </Card.Content>
            </Card>
          )}
          ListFooterComponent={(
            <View style={styles.transcriptFooter}>
              {pendingInteractions > 0 ? (
                <PendingInteractionsCard
                  permissions={currentPendingPermissions}
                  questions={currentPendingQuestions}
                  onPermissionReply={onReplyToPermission}
                  onQuestionReject={onRejectQuestion}
                  onQuestionReply={onReplyToQuestion}
                />
              ) : null}

              {activeSession?.revert ? (
                <Card mode="contained" style={[styles.noticeCard, { backgroundColor: palette.surface }]}>
                  <Card.Content>
                    <Text variant="titleMedium" style={{ color: palette.text }}>Session is reverted</Text>
                    <Button mode="outlined" onPress={onUnrevert}>Restore reverted work</Button>
                  </Card.Content>
                </Card>
              ) : null}

              {awaitingUserInput ? (
                <Card mode="contained" style={[styles.noticeCard, { backgroundColor: palette.surface }]}>
                  <Card.Content style={styles.waitingNoticeContent}>
                    <View style={styles.waitingNoticeHeader}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={18} color={palette.warning} />
                      <Text variant="titleMedium" style={{ color: palette.text }}>Waiting for your input</Text>
                    </View>
                    <Text style={{ color: palette.muted }}>
                      OpenCode is blocked on {pendingInteractions === 1 ? 'a response' : `${pendingInteractions} responses`} below.
                    </Text>
                  </Card.Content>
                </Card>
              ) : null}

              {running && !awaitingUserInput ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color={palette.tint} />
                  <Text style={{ color: palette.muted }}>
                    {currentActivityLabel ? `OpenCode is ${currentActivityLabel.toLowerCase()}...` : 'OpenCode is working through the current step...'}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardDismissMode="on-drag"
          refreshControl={<RefreshControl refreshing={isRefreshingDiffs} onRefresh={onRefreshDiffs} tintColor={palette.tint} />}>
          {connection.status === 'error' ? (
            <Card mode="contained" style={[styles.noticeCard, { backgroundColor: palette.surface }]}>
              <Card.Content>
                <Text variant="titleMedium" style={{ color: palette.text }}>Connection issue</Text>
                <Text variant="bodyMedium" style={{ color: palette.muted }}>{connection.message}</Text>
              </Card.Content>
            </Card>
          ) : null}

          <View style={styles.sectionStack}>
          <Card mode="contained" style={[styles.sectionCard, { backgroundColor: palette.surface }]}>
            <Card.Content style={styles.sectionHeaderCard}>
              <View>
                <Text variant="titleMedium" style={{ color: palette.text }}>{scopeTitle}</Text>
                <Text variant="bodyMedium" style={{ color: palette.muted }}>
                  {currentDiffs.length > 0
                    ? `${diffCount} files changed, +${currentDiffs.reduce((total, diff) => total + diff.additions, 0)} / -${currentDiffs.reduce((total, diff) => total + diff.deletions, 0)}`
                    : `${diffCount} files changed`}
                </Text>
              </View>
              <Text variant="labelMedium" style={{ color: palette.tint }}>{isRefreshingDiffs ? 'Syncing' : status?.type || 'idle'}</Text>
            </Card.Content>
          </Card>

          <View style={styles.diffScopeRow}>
            {DIFF_SCOPE_OPTIONS.map((option) => (
              <ControlButton
                key={option.value}
                grow
                active={currentDiffScope === option.value}
                onPress={() => onSelectDiffScope(option.value)}>
                {option.label}
              </ControlButton>
            ))}
          </View>

          {isTurnScope && diffTurns.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.diffTurnRow}>
              {diffTurns.map((turn) => (
                <ControlButton
                  key={turn.id}
                  active={selectedDiffMessageId === turn.id}
                  onPress={() => onSelectDiffMessage(turn.id)}>
                  {turn.label}
                </ControlButton>
              ))}
            </ScrollView>
          ) : null}

          {currentDiffs.length === 0 && !(showDiffDetails && diffDetails.length > 0) ? (
            <Card mode="contained" style={[styles.sectionCard, { backgroundColor: palette.surface }]}>
              <Card.Content>
                <Text variant="bodyMedium" style={{ color: palette.muted }}>{scopeEmptyMessage}</Text>
              </Card.Content>
            </Card>
          ) : null}

          {currentDiffs.length > 0 || (showDiffDetails && diffDetails.length > 0) ? (
            <Card mode="contained" style={[styles.sectionCard, { backgroundColor: palette.surface }]}>
              <Card.Content style={styles.diffListCardContent}>
                {currentDiffs.map((diff) => {
                  const accordionId = `diff:${currentDiffScope}:${diff.file}`;
                  return <SessionDiffCard key={accordionId} diff={diff} expanded={expandedDiffId === accordionId} onPress={() => onExpandDiff(expandedDiffId === accordionId ? undefined : accordionId)} />;
                })}
                {showDiffDetails
                  ? diffDetails.map((detail) => {
                      const accordionId = `detail:${detail.id}`;
                      return <DiffCard key={detail.id} detail={detail} expanded={expandedDiffId === accordionId} onPress={() => onExpandDiff(expandedDiffId === accordionId ? undefined : accordionId)} />;
                    })
                  : null}
              </Card.Content>
            </Card>
          ) : null}
          </View>
        </ScrollView>
      )}

      {activeTab === 'session' && currentTodos.length > 0 ? (
        <Card mode="elevated" style={[styles.todoOverlay, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Card.Content style={styles.todoHeaderContent}>
            <View style={styles.todoHeader}>
              <View style={styles.todoSummary}>
                <Text variant="labelLarge" style={{ color: palette.text }}>Plan</Text>
                <Text variant="bodySmall" style={{ color: palette.muted }}>
                  {`${completedTodoCount} of ${currentTodos.length} tasks completed`}
                </Text>
              </View>
              <IconButton
                accessibilityLabel={todosExpanded ? 'Collapse plan' : 'Expand plan'}
                icon={todosExpanded ? 'chevron-down' : 'chevron-up'}
                size={20}
                style={styles.todoToggleButton}
                onPress={() => setTodosExpanded((expanded) => !expanded)}
              />
            </View>
            <ProgressBar
              progress={completedTodoCount / currentTodos.length}
              color={palette.tint}
              style={styles.todoProgress}
            />
          </Card.Content>
          {todosExpanded ? (
            <ScrollView style={styles.todoListScroll} contentContainerStyle={styles.todoList} nestedScrollEnabled>
              {currentTodos.map((todo, index) => (
                <View key={`${todo.content}-${index}`} style={styles.todoItemRow}>
                  <IconButton icon={todo.status === 'completed' ? 'check-circle' : todo.status === 'in_progress' ? 'progress-clock' : 'circle-outline'} size={20} disabled style={styles.todoStatusIcon} />
                  <View style={styles.todoTextWrap}>
                    <Text variant="bodyMedium" style={{ color: palette.text }}>{todo.content || 'Untitled task'}</Text>
                    {todo.priority ? <Text variant="bodySmall" style={{ color: palette.muted }}>{todo.priority}</Text> : null}
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : null}
        </Card>
      ) : null}
    </View>
  );
}
