import { useCallback, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/lib/api";
import { T, S, R } from "@/src/lib/theme";
import { ScreenHeader, Card } from "@/src/components/UI";
import ParentPinModal, { hasPinToken } from "@/src/components/ParentPinModal";

const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MEALS = ["lunch", "dinner"] as const;
const MEAL_LABELS = { lunch: "Midi", dinner: "Soir" };

export default function MenuPage() {
  const router = useRouter();
  const [menu, setMenu] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api.get("/menu");
      const m: Record<string, string> = {};
      const n: Record<string, string> = {};
      for (const e of (r.menu || [])) {
        const key = `${e.day_of_week}:${e.meal_type}`;
        m[key] = e.title;
        n[key] = e.notes || "";
      }
      setMenu(m);
      setNotes(n);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const flashMsg = (msg: string) => { setFlash(msg); setTimeout(() => setFlash(null), 3000); };
  const [editOpen, setEditOpen] = useState(false);
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [pinOpen, setPinOpen] = useState(false);
  const [pendingSave, setPendingSave] = useState<(() => Promise<void>) | null>(null);

  const openEdit = (key: string) => {
    setEditKey(key);
    setEditTitle(menu[key] || "");
    setEditNotes(notes[key] || "");
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!editKey) return;
    const [dow, meal] = editKey.split(":") as [string, string];
    const doSave = async () => {
      await api.post("/menu", {
        day_of_week: parseInt(dow),
        meal_type: meal,
        title: editTitle,
        notes: editNotes,
      });
      setMenu((m) => ({ ...m, [editKey!]: editTitle }));
      setNotes((n) => ({ ...n, [editKey!]: editNotes }));
      setEditOpen(false);
      flashMsg("✅ Plat enregistré");
    };

    if (await hasPinToken()) {
      await doSave();
    } else {
      setPendingSave(() => doSave);
      setPinOpen(true);
    }
  };

  const handlePinSuccess = () => {
    setPinOpen(false);
    if (pendingSave) {
      pendingSave();
      setPendingSave(null);
    }
  };

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader title="Menu de la semaine" subtitle="Repas du lundi au dimanche" />

      <ScrollView contentContainerStyle={{ padding: S.lg, gap: S.sm, paddingBottom: S.xxxl }}>
        {flash ? <View style={s.flash} testID="menu-flash"><Text style={s.flashText}>{flash}</Text></View> : null}

        {DAYS.map((day, i) => (
          <View key={i} style={s.dayCard}>
            <Text style={s.dayLabel}>{day}</Text>
            {MEALS.map((meal) => {
              const key = `${i}:${meal}`;
              return (
                <View key={meal} style={s.mealRow}>
                  <View style={s.mealIcon}>
                    <Ionicons name={meal === "lunch" ? "sunny" : "moon"} size={18} color={T.orange} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.mealLabel}>{MEAL_LABELS[meal]}</Text>
                    <Text style={[s.mealTitle, !menu[key] && { color: T.onSurfaceMuted }]}
                      numberOfLines={1}>
                      {menu[key] || "Non défini"}
                    </Text>
                  </View>
                  <Pressable testID={`edit-${key}`} onPress={() => openEdit(key)} style={s.editBtn}>
                    <Ionicons name="pencil" size={16} color={T.onSurface} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={editOpen} transparent animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <View style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Modifier le plat</Text>
            <TextInput
              testID="edit-title-input"
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="Ex: Pâtes à la bolognaise"
              placeholderTextColor={T.onSurfaceMuted}
              style={s.modalInput}
            />
            <TextInput
              testID="edit-notes-input"
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="Ingrédients / notes"
              placeholderTextColor={T.onSurfaceMuted}
              style={[s.modalInput, { height: 80 }]}
              multiline
            />
            <View style={s.modalActions}>
              <Pressable testID="modal-cancel" onPress={() => setEditOpen(false)} style={[s.modalBtn, { backgroundColor: T.surfaceSecondary }]}>
                <Text style={s.modalBtnText}>Annuler</Text>
              </Pressable>
              <Pressable testID="modal-save" onPress={saveEdit} style={[s.modalBtn, { backgroundColor: T.brand }]}>
                <Text style={[s.modalBtnText, { color: T.white }]}>Enregistrer</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ParentPinModal visible={pinOpen} onCancel={() => setPinOpen(false)} onSuccess={handlePinSuccess} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  flash: { marginHorizontal: S.lg, marginTop: S.sm, padding: S.md, backgroundColor: "#EFFBE0", borderRadius: R.md, borderWidth: 2, borderColor: T.brand },
  flashText: { color: T.onSurface, fontWeight: "800" },
  dayCard: { backgroundColor: T.white, borderRadius: R.lg, padding: S.md, borderWidth: 2, borderColor: T.border, gap: 4 },
  dayLabel: { fontWeight: "900", fontSize: 14, color: T.brand, marginBottom: S.xs },
  mealRow: { flexDirection: "row", alignItems: "center", gap: S.sm },
  mealIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#FFF3E0", alignItems: "center", justifyContent: "center" },
  mealLabel: { fontWeight: "700", fontSize: 11, color: T.onSurfaceMuted, textTransform: "uppercase", marginBottom: 2 },
  mealTitle: { fontSize: 14, fontWeight: "800", color: T.onSurface },
  editBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: T.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: S.lg },
  modalCard: { backgroundColor: T.white, borderRadius: R.lg, padding: S.xl, width: "100%", maxWidth: 400, gap: S.sm },
  modalTitle: { fontSize: 18, fontWeight: "900", color: T.onSurface },
  modalInput: { backgroundColor: T.surfaceSecondary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 10, fontSize: 15, color: T.onSurface, borderWidth: 2, borderColor: T.border },
  modalActions: { flexDirection: "row", gap: S.sm, marginTop: S.sm },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: R.pill, alignItems: "center", borderBottomWidth: 3 },
  modalBtnText: { fontWeight: "900", fontSize: 14 },
});
