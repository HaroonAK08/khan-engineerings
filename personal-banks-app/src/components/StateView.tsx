import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { radius, space, type } from "../theme";

type Props = {
  kind?: "empty" | "error" | "offline";
  title: string;
  message?: string;
  onRetry?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
};

export function StateView({ kind = "empty", title, message, onRetry, icon }: Props) {
  const { colors } = useTheme();
  const resolvedIcon =
    icon ||
    (kind === "offline" ? "cloud-offline-outline" : kind === "error" ? "alert-circle-outline" : "file-tray-outline");
  const tint =
    kind === "offline" ? colors.amber : kind === "error" ? colors.danger : colors.muted;

  return (
    <View style={styles.wrap}>
      <View style={[styles.icon, { backgroundColor: colors.surfaceMuted }]}>
        <Ionicons name={resolvedIcon} size={32} color={tint} />
      </View>
      <Text style={[type.subtitle, { color: colors.text, textAlign: "center" }]}>{title}</Text>
      {message ? (
        <Text style={[type.body, { color: colors.muted, textAlign: "center", marginTop: 6, lineHeight: 21 }]}>
          {message}
        </Text>
      ) : null}
      {onRetry ? (
        <Pressable
          style={({ pressed }) => [
            styles.btn,
            { backgroundColor: colors.accent, opacity: pressed ? 0.88 : 1 },
          ]}
          onPress={onRetry}
        >
          <Ionicons name="refresh" size={16} color="#fff" />
          <Text style={styles.btnText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", paddingVertical: 48, paddingHorizontal: 28, gap: 4 },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  btn: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.sm,
  },
  btnText: { color: "#fff", fontWeight: "700" },
});
