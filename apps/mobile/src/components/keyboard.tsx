import { useEffect, useState } from 'react';
import { Keyboard, Platform, useWindowDimensions, View } from 'react-native';

import type { KeyboardEvent, ViewProps } from 'react-native';

type KeyboardViewProps = ViewProps & { keyboardVerticalOffset?: number };

export function KeyboardView({ keyboardVerticalOffset = 0, style, ...props }: KeyboardViewProps) {
  const { height } = useWindowDimensions();
  const [keyboardTop, setKeyboardTop] = useState<number>();

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      setKeyboardTop(event.endCoordinates.screenY);
    });
    const hide = Keyboard.addListener(hideEvent, (event: KeyboardEvent) => {
      Keyboard.scheduleLayoutAnimation(event);
      setKeyboardTop(undefined);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const keyboardOverlap = keyboardTop
    ? Math.max(0, height - keyboardTop - keyboardVerticalOffset)
    : 0;

  return (
    <View
      {...props}
      style={[style, keyboardOverlap ? { paddingBottom: keyboardOverlap } : undefined]}
    />
  );
}
