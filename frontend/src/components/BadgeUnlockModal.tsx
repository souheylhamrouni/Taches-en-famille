import { useEffect, useRef } from "react";
import { View, Text, Modal, Pressable, StyleSheet, Animated, Easing } from "react-native";
import { T, S, R } from "@/src/lib/theme";

type Badge = { id: string; title: string; emoji: string; description: string };

export default function BadgeUnlockModal({ badges, onClose }: { badges: Badge[]; onClose: () => void }) {
  const visible = badges.length > 0;
  const scale = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scale.setValue(0); spin.setValue(0);
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 80 }).start();
      Animated.loop(
        Animated.timing(spin, { toValue: 1, duration: 6000, easing: Easing.linear, useNativeDriver: true })
      ).start();
    }
  }, [visible]);

  if (!visible) return null;
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <Animated.View style={[s.card, { transform: [{ scale }] }]} testID="badge-unlock-modal">
          <Animated.Text style={[s.rays, { transform: [{ rotate }] }]}>✨</Animated.Text>
          <Text style={s.header}>Badge débloqué !</Text>
          {badges.map(b => (
            <View key={b.id} style={s.badgeRow} testID={`unlocked-badge-${b.id}`}>
              <Text style={s.emoji}>{b.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{b.title}</Text>
                <Text style={s.desc}>{b.description}</Text>
              </View>
            </View>
          ))}
          <Pressable testID="badge-modal-close" onPress={onClose}
            style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }]}>
            <Text style={s.btnText}>Génial !</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(26,26,26,0.7)", alignItems: "center", justifyContent: "center", padding: S.lg },
  card: { backgroundColor: T.white, borderRadius: R.lg, padding: S.xl, width: "100%", maxWidth: 340, alignItems: "center", borderWidth: 3, borderColor: T.gold },
  rays: { position: "absolute", top: -18, fontSize: 44 },
  header: { fontSize: 22, fontWeight: "900", color: T.onSurface, marginBottom: S.md },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: "#FFFBEA", borderRadius: R.md, padding: S.md, width: "100%", marginBottom: S.sm, borderWidth: 2, borderColor: T.gold },
  emoji: { fontSize: 40 },
  title: { fontWeight: "900", fontSize: 16, color: T.onSurface },
  desc: { color: T.onSurfaceMuted, fontSize: 12, marginTop: 2 },
  btn: { backgroundColor: T.brand, borderRadius: R.pill, paddingVertical: 14, paddingHorizontal: S.xxl, marginTop: S.md, borderBottomWidth: 4, borderBottomColor: T.brandDark },
  btnText: { color: T.white, fontWeight: "900", fontSize: 16 },
});
