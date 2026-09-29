import { memo, useMemo } from 'react';
import { Linking } from 'react-native';
import { EnrichedMarkdownText, type MarkdownStyle } from 'react-native-enriched-markdown';

const allowedLinkProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:']);

function openMarkdownLink(url: string) {
  try {
    if (!allowedLinkProtocols.has(new URL(url).protocol.toLowerCase())) {
      return;
    }
  } catch {
    return;
  }

  void Linking.openURL(url).catch(() => undefined);
}

function MarkdownTextImpl({ text, color, mutedColor }: { text: string; color: string; mutedColor: string }) {
  const markdownStyle = useMemo<MarkdownStyle>(() => ({
    paragraph: { fontSize: 16, color, lineHeight: 26 },
    h1: { fontSize: 24, fontWeight: '700', color },
    h2: { fontSize: 18, fontWeight: '700', color },
    h3: { fontSize: 16, fontWeight: '700', color },
    h4: { fontSize: 15, fontWeight: '700', color },
    h5: { fontSize: 14, fontWeight: '700', color },
    h6: { fontSize: 13, fontWeight: '700', color },
    list: { fontSize: 16, color, lineHeight: 26, bulletColor: color, markerColor: color, gapWidth: 10 },
    link: { color, underline: true },
    code: { fontFamily: 'monospace', fontSize: 15, color, backgroundColor: 'rgba(0,0,0,0.08)' },
    codeBlock: { fontFamily: 'monospace', fontSize: 15, lineHeight: 18, color, backgroundColor: 'rgba(0,0,0,0.08)', padding: 14, borderRadius: 14 },
    blockquote: { color, fontSize: 15, borderColor: mutedColor, borderWidth: 3 },
    table: {
      fontSize: 15,
      lineHeight: 20,
      color,
      borderColor: mutedColor,
      borderRadius: 8,
      headerBackgroundColor: 'rgba(0,0,0,0.08)',
      headerTextColor: color,
      rowEvenBackgroundColor: 'transparent',
      rowOddBackgroundColor: 'rgba(0,0,0,0.04)',
      cellPaddingHorizontal: 8,
      cellPaddingVertical: 6,
    },
    thematicBreak: { color: mutedColor },
  }), [color, mutedColor]);

  return (
    <EnrichedMarkdownText
      markdown={text}
      flavor="github"
      selectable
      containerStyle={{ alignSelf: 'stretch', minWidth: 0 }}
      markdownStyle={markdownStyle}
      onLinkPress={({ url }) => openMarkdownLink(url)}
    />
  );
}

// Keep the transcript boundary memoized; only the active streaming message
// changes text on each server delta.
export const MarkdownText = memo(MarkdownTextImpl);
