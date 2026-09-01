import React from "react";
import { View, Text, Pressable, StyleSheet, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { T, S, R } from "@/src/lib/theme";

export function ScreenHeader({ title, subtitle, right, left }: { title: string; subtitle?: string; right?: React.ReactNode; left?: React.ReactNode }) {
  return (
    <View style={h.wrap}>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={h.title}>{title}</Text>
        {subtitle ? <Text style={h.sub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function PointsPill({ value, color = T.gold }: { value: number; color?: string }) {
  return (
    <View style={[p.pill, { borderColor: color }]}>
      <Ionicons name="star" size={14} color={color} />
      <Text style={[p.text, { color: T.onSurface }]} testID="points-value">{value}</Text>
    </View>
  );
}

export function StreakPill({ value }: { value: number }) {
  return (
    <View style={[p.pill, { borderColor: T.orange, backgroundColor: "#FFF3E0" }]}>
      <Text style={{ fontSize: 14 }}>🔥</Text>
      <Text style={[p.text, { color: T.onSurface }]}>{value}</Text>
    </View>
  );
}

export function Card({ children, style, testID }: { children: React.ReactNode; style?: ViewStyle; testID?: string }) {
  return <View testID={testID} style={[c.card, style]}>{children}</View>;
}

export function BigButton({ label, onPress, disabled, color = T.brand, testID, icon }:
  { label: string; onPress: () => void; disabled?: boolean; color?: string; testID?: string; icon?: any }) {
  const dark = color === T.brand ? T.brandDark : "#00000022";
  return (
    <Pressable
      testID={testID}
      onPress={onPress} disabled={disabled}
      style={({ pressed }) => [b.btn, { backgroundColor: color, borderBottomColor: dark }, pressed && { opacity: 0.85 }, disabled && { opacity: 0.5 }]}
    >
      {icon ? <Ionicons name={icon} size={18} color={T.white} /> : null}
      <Text style={b.txt}>{label}</Text>
    </Pressable>
  );
}

export function EmptyState({ emoji, title, subtitle }: { emoji: string; title: string; subtitle?: string }) {
  return (
    <View style={e.wrap}>
      <Text style={{ fontSize: 64 }}>{emoji}</Text>
      <Text style={e.title}>{title}</Text>
      {subtitle ? <Text style={e.sub}>{subtitle}</Text> : null}
    </View>
  );
}

const h = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", padding: S.lg, paddingBottom: S.md, gap: S.md },
  title: { fontSize: 26, fontWeight: "900", color: T.onSurface, letterSpacing: -0.5 },
  sub: { fontSize: 13, color: T.onSurfaceMuted, marginTop: 2 },
});
const p = StyleSheet.create({
  pill: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 2, backgroundColor: "#FFFBEA", paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.pill },
  text: { fontWeight: "900", fontSize: 13 },
});
const c = StyleSheet.create({
  card: { backgroundColor: T.white, borderRadius: R.lg, padding: S.lg, borderWidth: 2, borderColor: T.border },
});
const b = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: R.pill, paddingVertical: 14, paddingHorizontal: S.lg, borderBottomWidth: 4 },
  txt: { color: T.white, fontWeight: "900", fontSize: 15 },
});
const e = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", padding: S.xxl, gap: S.sm },
  title: { fontWeight: "900", fontSize: 18, color: T.onSurface, marginTop: S.md },
  sub: { color: T.onSurfaceMuted, textAlign: "center", fontSize: 14 },
});
