import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme/ThemeContext";
import { radius } from "../theme";

type Kind = "success" | "error" | "info";

type Notice = {
  id: number;
  title: string;
  message?: string;
  kind: Kind;
};

type NotifyApi = {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
};

const NotifyContext = createContext<NotifyApi | null>(null);

export function useNotify() {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error("useNotify requires NotifyProvider");
  return ctx;
}

export function NotifyProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [notice, setNotice] = useState<Notice | null>(null);
  const slide = useRef(new Animated.Value(-120)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    Animated.parallel([
      Animated.timing(slide, { toValue: -120, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(() => setNotice(null));
  }, [opacity, slide]);

  const show = useCallback(
    (kind: Kind, title: string, message?: string) => {
      if (timer.current) clearTimeout(timer.current);
      seq.current += 1;
      setNotice({ id: seq.current, kind, title, message });
      slide.setValue(-120);
      opacity.setValue(0);
      Animated.parallel([
        Animated.spring(slide, { toValue: 0, useNativeDriver: true, friction: 9, tension: 80 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
      timer.current = setTimeout(hide, 2800);
    },
    [hide, opacity, slide]
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const api = useMemo<NotifyApi>(
    () => ({
      success: (title, message) => show("success", title, message),
      error: (title, message) => show("error", title, message),
      info: (title, message) => show("info", title, message),
    }),
    [show]
  );

  const KIND = {
    success: { bg: colors.successSoft, border: colors.success, icon: "checkmark-circle" as const, tint: colors.success },
    error: { bg: colors.dangerSoft, border: colors.danger, icon: "alert-circle" as const, tint: colors.danger },
    info: { bg: colors.blueSoft, border: colors.blue, icon: "information-circle" as const, tint: colors.blue },
  };

  const meta = notice ? KIND[notice.kind] : null;

  return (
    <NotifyContext.Provider value={api}>
      {children}
      {notice && meta ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.wrap,
            {
              paddingTop: insets.top + 8,
              opacity,
              transform: [{ translateY: slide }],
            },
          ]}
        >
          <Pressable
            style={[styles.card, { backgroundColor: meta.bg, borderColor: meta.border, shadowColor: colors.shadow }]}
            onPress={hide}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
              <Ionicons name={meta.icon} size={22} color={meta.tint} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.title, { color: colors.text }]}>{notice.title}</Text>
              {notice.message ? (
                <Text style={[styles.message, { color: colors.textSecondary }]}>{notice.message}</Text>
              ) : null}
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </NotifyContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    paddingHorizontal: 16,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 14,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { flex: 1 },
  title: { fontSize: 15, fontWeight: "800" },
  message: { fontSize: 13, marginTop: 2, lineHeight: 18 },
});
