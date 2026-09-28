import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Dismisses an open overlay when the Android hardware back button is pressed.
 *
 * The handler consumes the press (returns `true`) so the navigation underneath
 * the overlay keeps its position; the user must press back again to leave the
 * screen. Registration only happens while `visible` is true, and the latest
 * `onDismiss` is always invoked without re-subscribing on every render.
 *
 * This is a no-op on platforms without a hardware back button (iOS, web): React
 * Native Web's `BackHandler` is unsupported and logs an error if used.
 */
export function useDismissOnBack(visible: boolean, onDismiss: () => void) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!visible || Platform.OS === 'web') {
      return undefined;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onDismissRef.current();
      return true;
    });

    return () => subscription.remove();
  }, [visible]);
}
