import { Tabs, usePathname } from 'expo-router';
import React from 'react';
import { Platform, Text, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const routerPathname = usePathname();
  const pathname = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.pathname : routerPathname;
  const insets = useSafeAreaInsets();
  const palette = Colors[colorScheme ?? 'light'];
  const selected = (route: string) => route === '/' ? pathname === '/' || pathname.startsWith('/session/') : pathname.startsWith(route);
  const iconColor = (route: string, color: ColorValue) => Platform.OS === 'web' ? selected(route) ? palette.tint : palette.tabIconDefault : color;
  const label = (route: string, value: string) => function TabLabel({ color }: { color: ColorValue }) {
    return <Text style={{ color: Platform.OS === 'web' ? selected(route) ? palette.tint : palette.tabIconDefault : color, fontSize: 12, fontWeight: '600' }}>{value}</Text>;
  };

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].tabIconDefault,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: Colors[colorScheme ?? 'light'].tabBackground,
          borderTopColor: Colors[colorScheme ?? 'light'].border,
          height: 56 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        headerShown: false,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'OpenCode Mobile',
          tabBarLabel: label('/', 'Chat'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="message.fill" color={iconColor('/', color)} />,
          tabBarButton: (props) => <HapticTab {...props} route="/" />,
        }}
      />
      <Tabs.Screen
        name="terminal"
        options={{
          title: 'Terminal',
          tabBarLabel: label('/terminal', 'Terminal'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="terminal.fill" color={iconColor('/terminal', color)} />,
          tabBarButton: (props) => <HapticTab {...props} route="/terminal" />,
        }}
      />
      <Tabs.Screen
        name="workspace"
        options={{
          title: 'Workspace',
          tabBarLabel: label('/workspace', 'Workspace'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="folder.fill" color={iconColor('/workspace', color)} />,
          tabBarButton: (props) => <HapticTab {...props} route="/workspace" />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarLabel: label('/settings', 'Settings'),
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="gearshape.fill" color={iconColor('/settings', color)} />,
          tabBarButton: (props) => <HapticTab {...props} route="/settings" />,
        }}
      />
    </Tabs>
  );
}
