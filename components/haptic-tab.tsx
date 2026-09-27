import { Tabs, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type { ComponentProps } from 'react';
import { Platform, Pressable } from 'react-native';

// Derived from expo-router's own tab screen options. expo-router 57 vendors
// react-navigation and is no longer compatible with the standalone
// @react-navigation packages, so the button is rendered with RN Pressable.
type TabBarButtonProps = Parameters<
  NonNullable<
    Exclude<
      NonNullable<ComponentProps<typeof Tabs.Screen>['options']>,
      (...args: never[]) => unknown
    >['tabBarButton']
  >
>[0];

export function HapticTab({ onPressIn, route, ...props }: TabBarButtonProps & { route: string }) {
  const routerPathname = usePathname();
  const pathname = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.pathname : routerPathname;
  const selected = route === '/' ? pathname === '/' || pathname.startsWith('/session/') : pathname.startsWith(route);
  return (
    <Pressable
      {...(props as ComponentProps<typeof Pressable>)}
      {...(Platform.OS === 'web' ? { accessibilityState: { ...props.accessibilityState, selected }, 'aria-selected': selected } : {})}
      ref={(node) => {
        if (Platform.OS === 'web' && node) {
          // Expo Router's static web tabs retain the initial route's ARIA state.
          (node as unknown as HTMLElement).setAttribute('aria-selected', String(selected));
        }
      }}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onPressIn?.(ev);
      }}
    />
  );
}
