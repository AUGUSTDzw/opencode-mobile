import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type Action = { label: string; icon: ComponentProps<typeof MaterialCommunityIcons>['name']; onPress: () => void };

export function SwipeRow({ children, actions, title }: { children: ReactNode; actions: Action[]; title: string }) {
  const [width, setWidth] = useState(0);
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={styles.row} contentContainerStyle={styles.content}>
    <View style={{ width: width || '100%' }}>{children}</View>
    <View style={styles.actions}>{actions.map((action) => <Pressable key={action.label} accessibilityRole="button" accessibilityLabel={`${action.label} ${title}`} onPress={action.onPress} style={styles.action}>
      <MaterialCommunityIcons name={action.icon} size={20} /><Text style={styles.label}>{action.label}</Text>
    </Pressable>)}</View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  row: { flexGrow: 0 },
  content: { alignItems: 'stretch' },
  actions: { flexDirection: 'row', alignItems: 'stretch', gap: 4, paddingLeft: 6 },
  action: { width: 76, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 14, backgroundColor: 'rgba(128,128,128,0.12)' },
  label: { fontSize: 11, fontWeight: '600' },
});
