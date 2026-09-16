import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { radius } from "../theme";

export function Skeleton({
  height = 16,
  width = "100%",
  style,
  radius: r = radius.md,
}: {
  height?: number;
  width?: number | `${number}%`;
  style?: ViewStyle;
  radius?: number;
}) {
  const { colors } = useTheme();
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          height,
          width,
          borderRadius: r,
          backgroundColor: colors.skeleton,
          opacity,
        },
        style,
      ]}
    />
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.card}>
          <Skeleton height={44} width={44} radius={14} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton height={14} width="55%" />
            <Skeleton height={12} width="35%" />
          </View>
          <Skeleton height={14} width={64} />
        </View>
      ))}
    </View>
  );
}

export function HomeSkeleton() {
  return (
    <View style={{ gap: 14 }}>
      <Skeleton height={140} radius={28} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Skeleton height={110} width="48%" radius={22} />
        <Skeleton height={110} width="48%" radius={22} />
        <Skeleton height={110} width="48%" radius={22} />
        <Skeleton height={110} width="48%" radius={22} />
      </View>
      <Skeleton height={72} radius={22} />
      <Skeleton height={120} radius={22} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 12, marginTop: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
});
