import React, { forwardRef, useRef } from 'react';
import {
  TextInput as NativeTextInput,
  Pressable as NativePressable,
  TouchableOpacity as NativeTouchableOpacity,
  View,
  type PressableProps,
  type TextInputProps,
  type TouchableOpacityProps,
  type ViewProps,
} from 'react-native';
import { walletSession } from '@/lib/wallet-session';
import { beginPerformanceSpan, recordPerformanceDuration } from '@/lib/performance-trace';
import { useColorMode } from '@/hooks/useColorMode';
import { adaptColor, themeColor } from '@/lib/theme-styles';

// Observe gestures before a child consumes them, without claiming its responder.
// Native modals need their own boundary because they have a separate view root.
export function WalletActivityBoundary(props: ViewProps) {
  return <View {...props}
    onStartShouldSetResponderCapture={event => {
      walletSession.touch();
      return props.onStartShouldSetResponderCapture?.(event) ?? false;
    }}
    onMoveShouldSetResponderCapture={event => {
      walletSession.touch();
      return props.onMoveShouldSetResponderCapture?.(event) ?? false;
    }}
    onTouchMove={event => { walletSession.touch(); props.onTouchMove?.(event); }}
    onTouchEnd={event => { walletSession.touch(); props.onTouchEnd?.(event); }}
  />;
}

// Software keyboard events do not pass through the surrounding touch responder.
export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function WalletTextInput(props, ref) {
  const { mode } = useColorMode();
  return <NativeTextInput {...props} ref={ref}
    keyboardAppearance={props.keyboardAppearance ?? mode}
    selectionColor={props.selectionColor ?? themeColor('accentText')}
    placeholderTextColor={typeof props.placeholderTextColor === 'string'
      ? adaptColor(props.placeholderTextColor, 'color') : props.placeholderTextColor ?? themeColor('muted')}
    onChangeText={value => { walletSession.touch(); props.onChangeText?.(value); }}
    onKeyPress={event => { walletSession.touch(); props.onKeyPress?.(event); }}
    onSubmitEditing={event => { walletSession.touch(); props.onSubmitEditing?.(event); }}
  />;
});

// Also count accessibility/keyboard activation, which may have no touch event.
export const TouchableOpacity = forwardRef<React.ComponentRef<typeof NativeTouchableOpacity>, TouchableOpacityProps>(function WalletTouchableOpacity(props, ref) {
  const pressedAt = useRef<number | null>(null);
  return <NativeTouchableOpacity {...props} ref={ref} activeOpacity={props.activeOpacity ?? 0.72}
    onPressIn={event => { pressedAt.current = performance.now(); walletSession.touch(); props.onPressIn?.(event); }}
    onPress={event => {
      if (pressedAt.current !== null) recordPerformanceDuration('ui.tap_to_handler', performance.now() - pressedAt.current);
      pressedAt.current = null;
      const finish = beginPerformanceSpan('ui.handler');
      try { walletSession.touch(); props.onPress?.(event); } finally { finish(); }
    }}
    onLongPress={props.onLongPress ? event => {
      pressedAt.current = null;
      const finish = beginPerformanceSpan('ui.handler');
      try { walletSession.touch(); props.onLongPress?.(event); } finally { finish(); }
    } : undefined}
  />;
});

export const Pressable = forwardRef<View, PressableProps>(function WalletPressable(props, ref) {
  const pressedAt = useRef<number | null>(null);
  return <NativePressable {...props} ref={ref}
    style={state => [typeof props.style === 'function' ? props.style(state) : props.style,
      state.pressed && !props.disabled ? { opacity: 0.72 } : undefined]}
    onPressIn={event => { pressedAt.current = performance.now(); walletSession.touch(); props.onPressIn?.(event); }}
    onPress={event => {
      if (pressedAt.current !== null) recordPerformanceDuration('ui.tap_to_handler', performance.now() - pressedAt.current);
      pressedAt.current = null;
      const finish = beginPerformanceSpan('ui.handler');
      try { walletSession.touch(); props.onPress?.(event); } finally { finish(); }
    }}
    onLongPress={props.onLongPress ? event => {
      pressedAt.current = null;
      const finish = beginPerformanceSpan('ui.handler');
      try { walletSession.touch(); props.onLongPress?.(event); } finally { finish(); }
    } : undefined}
  />;
});
