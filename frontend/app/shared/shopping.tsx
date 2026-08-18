import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, TextInput, Pressable, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { T, S, R } from "@/src/lib/theme";
import { EmptyState } from "@/src/components/UI";

export default function Shopping() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [input, setInput] = useState("");

  const load = useCallback(async () => {
    try { const r = await api.get("/shopping"); setItems(r.items || []); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const add = async () => {
    const v = input.trim(); if (!v) return;
    setInput("");
    try { await api.post("/shopping", { item_name: v }); await load(); } catch {}
  };
  const toggle = async (id: string) => { try { await api.patch(`/shopping/${id}`); await load(); } catch {} };
  const remove = async (id: string) => { try { await api.del(`/shopping/${id}`); await load(); } catch {} };

  const pending = items.filter(i => !i.is_bought);
  const bought = items.filter(i => i.is_bought);

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <View style={s.header}>
        <Pressable testID="back-button" onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={T.onSurface} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Liste de courses</Text>
          <Text style={s.sub}>{pending.length} à acheter</Text>
        </View>
      </View>
      <View style={s.inputRow}>
        <TextInput testID="shopping-input" value={input} onChangeText={setInput}
          placeholder="Ajouter un article..." placeholderTextColor={T.onSurfaceMuted}
          onSubmitEditing={add} returnKeyType="done" style={s.input} />
        <Pressable testID="add-item-button" onPress={add} style={s.addBtn}>
          <Ionicons name="add" size={26} color={T.white} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: S.lg, paddingBottom: S.xxxl, gap: S.sm }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.brand} />}>
        {items.length === 0 && <EmptyState emoji="🛒" title="Le frigo est plein !" subtitle="Ajoute des articles ci-dessus" />}
        {pending.map(i => (
          <View key={i.id} style={s.row} testID={`item-${i.id}`}>
            <Pressable testID={`toggle-${i.id}`} onPress={() => toggle(i.id)} style={s.checkbox} />
            <Text style={s.itemText}>{i.item_name}</Text>
            <Pressable testID={`del-${i.id}`} onPress={() => remove(i.id)}>
              <Ionicons name="trash-outline" size={20} color={T.onSurfaceMuted} />
            </Pressable>
          </View>
        ))}
        {bought.length > 0 && <Text style={s.sectionLabel}>Déjà pris</Text>}
        {bought.map(i => (
          <View key={i.id} style={s.row} testID={`item-${i.id}`}>
            <Pressable testID={`toggle-${i.id}`} onPress={() => toggle(i.id)} style={[s.checkbox, s.checkboxDone]}>
              <Ionicons name="checkmark" size={18} color={T.white} />
            </Pressable>
            <Text style={[s.itemText, s.itemDone]}>{i.item_name}</Text>
            <Pressable testID={`del-${i.id}`} onPress={() => remove(i.id)}>
              <Ionicons name="trash-outline" size={20} color={T.onSurfaceMuted} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  header: { flexDirection: "row", padding: S.lg, gap: S.sm, alignItems: "center" },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: T.white, borderWidth: 2, borderColor: T.border },
  title: { fontSize: 22, fontWeight: "900", color: T.onSurface },
  sub: { color: T.onSurfaceMuted, fontSize: 13 },
  inputRow: { flexDirection: "row", paddingHorizontal: S.lg, gap: S.sm },
  input: { flex: 1, backgroundColor: T.white, borderRadius: R.pill, paddingHorizontal: S.md, paddingVertical: 12, borderWidth: 2, borderColor: T.border, fontSize: 15, color: T.onSurface },
  addBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: T.brand, alignItems: "center", justifyContent: "center", borderBottomWidth: 3, borderBottomColor: T.brandDark },
  row: { flexDirection: "row", alignItems: "center", gap: S.md, backgroundColor: T.white, padding: S.md, borderRadius: R.md, borderWidth: 2, borderColor: T.border },
  checkbox: { width: 28, height: 28, borderRadius: 14, borderWidth: 3, borderColor: T.brand, alignItems: "center", justifyContent: "center" },
  checkboxDone: { backgroundColor: T.brand },
  itemText: { flex: 1, color: T.onSurface, fontWeight: "700", fontSize: 15 },
  itemDone: { textDecorationLine: "line-through", color: T.onSurfaceMuted },
  sectionLabel: { marginTop: S.md, fontWeight: "900", color: T.onSurfaceMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
});
