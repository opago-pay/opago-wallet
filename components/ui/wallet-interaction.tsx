import React, { forwardRef } from 'react';
import {
  TextInput as NativeTextInput,
  TouchableOpacity as NativeTouchableOpacity,
  View,
  type TextInputProps,
  type TouchableOpacityProps,
  type ViewProps,
} from 'react-native';
import { walletSession } from '@/lib/wallet-session';

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
  return <NativeTextInput {...props} ref={ref}
    onChangeText={value => { walletSession.touch(); props.onChangeText?.(value); }}
    onKeyPress={event => { walletSession.touch(); props.onKeyPress?.(event); }}
    onSubmitEditing={event => { walletSession.touch(); props.onSubmitEditing?.(event); }}
  />;
});

// Also count accessibility/keyboard activation, which may have no touch event.
export const TouchableOpacity = forwardRef<React.ComponentRef<typeof NativeTouchableOpacity>, TouchableOpacityProps>(function WalletTouchableOpacity(props, ref) {
  return <NativeTouchableOpacity {...props} ref={ref}
    onPressIn={event => { walletSession.touch(); props.onPressIn?.(event); }}
    onPress={event => { walletSession.touch(); props.onPress?.(event); }}
    onLongPress={props.onLongPress ? event => { walletSession.touch(); props.onLongPress?.(event); } : undefined}
  />;
});
