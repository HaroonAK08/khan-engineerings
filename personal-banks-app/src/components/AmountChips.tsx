import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { radius, type } from "../theme";

const CHIPS = [500, 1000, 5000, 10000];

type Props = {
  value: string;
  onChange: (next: string) => void;
};

export function AmountChips({ value, onChange }: Props) {
  const { colors } = useTheme();
  const current = Number(value) || 0;

  return (
    <View style={styles.row}>
      {CHIPS.map((n) => (
        <Pressable
          key={n}
          style={({ pressed }) => [
            styles.chip,
            {
              backgroundColor: colors.surfaceMuted,
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          onPress={() => onChange(String(current + n))}
        >
          <Text style={[type.meta, { color: colors.accent }]}>+{n.toLocaleString("en-PK")}</Text>
        </Pressable>
      ))}
      {current > 0 ? (
        <Pressable
          style={({ pressed }) => [
            styles.chip,
            {
              backgroundColor: colors.dangerSoft,
              borderColor: colors.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          onPress={() => onChange("")}
        >
          <Text style={[type.meta, { color: colors.danger }]}>Clear</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
});
