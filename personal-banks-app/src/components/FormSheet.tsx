import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { radius } from "../theme";

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function FormSheet({ visible, onClose, children }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [keyboardH, setKeyboardH] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!visible) {
      setKeyboardH(0);
      return;
    }
    const show = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        setKeyboardH(e.endCoordinates.height);
        requestAnimationFrame(() => {
          scrollRef.current?.scrollToEnd({ animated: true });
        });
      }
    );
    const hide = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setKeyboardH(0)
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={[styles.backdrop, { backgroundColor: "rgba(15,23,42,0.55)" }]} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              paddingBottom: Math.max(insets.bottom, 16) + (Platform.OS === "android" ? keyboardH : 0),
              maxHeight: keyboardH > 0 ? "96%" : "92%",
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.content}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 22,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  content: { paddingBottom: 12 },
});
