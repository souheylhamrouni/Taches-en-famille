import { useCallback, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, RefreshControl, TextInput, Modal } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, storage } from "@/src/lib/api";
import { T, S, R } from "@/src/lib/theme";
import { useAuth } from "@/src/lib/auth";
import { ScreenHeader, EmptyState, Card } from "@/src/components/UI";
import ParentPinModal, { hasPinToken } from "@/src/components/ParentPinModal";

const ICONS = ["🎮", "🎬", "🍦", "🍕", "🛌", "💶", "🎁", "🚴", "📚"];

export default function RewardsAdmin() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<"catalog" | "claims">("catalog");
  const [rewards, setRewards] = useState<any[]>([]);
  const [claims, setClaims] = useState<any[]>([]);
  const [claimsFilter, setClaimsFilter] = useState<"pending" | "delivered" | "all">("pending");
  const [refreshing, setRefreshing] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [pinRequired, setPinRequired] = useState(false);
  const [pinAction, setPinAction] = useState<(() => Promise<void>) | null>(null);
  
  const [title, setTitle] = useState("");
  const [cost, setCost] = useState("100");
  const [icon, setIcon] = useState("🎁");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  
  const { user } = useAuth();
  const isParent = user?.role === "parent";

  const load = useCallback(async () => {
    try {
      const [r, c] = await Promise.all([
        api.get("/rewards"),
        api.get("/claims")
      ]);
      setRewards(r.rewards || []);
      setClaims(c.claims || []);
    } catch {}
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const resetForm = () => { setTitle(""); setCost("100"); setIcon("🎁"); setEditingId(null); };

  const requirePin = async (action: () => Promise<void>) => {
    if (await hasPinToken()) {
      await action();
    } else {
      setPinAction(() => action);
      setPinRequired(true);
    }
  };

  const openCreate = () => {
    resetForm();
    requirePin(async () => setOpenAdd(true));
  };

  const openEdit = (t: any) => {
    setEditingId(t.id);
    setTitle(t.title);
    setCost(String(t.point_cost || t.cost));
    setIcon(t.icon || "🎁");
    setErr(null);
    requirePin(async () => setOpenAdd(true));
  };

  const submit = async () => {
    setErr(null);
    try {
      await api.post("/rewards", { title, point_cost: parseInt(cost) || 100, icon });
      resetForm();
      setOpenAdd(false);
      await load();
      setFlash("✨ Récompense enregistrée");
      setTimeout(() => setFlash(null), 3000);
    } catch (e: any) {
      if (String(e.message).includes("PIN")) {
        await storage.del("parent_pin_token");
        setOpenAdd(false);
        setPinRequired(true);
      } else {
        setErr(e.message);
      }
    }
  };

  const remove = (id: string) => {
    requirePin(async () => {
      try {
        await api.del(`/rewards/${id}`);
        await load();
      } catch (e: any) {
        if (String(e.message).includes("PIN")) {
          await storage.del("parent_pin_token");
          setPinRequired(true);
        }
      }
    });
  };

  const deliverClaim = (claim: any) => {
    requirePin(async () => {
      try {
        await api.post(`/claims/${claim.id}/deliver`);
        await load();
        setFlash(`🎁 « ${claim.reward_title} » remise à ${claim.user_name} !`);
        setTimeout(() => setFlash(null), 3500);
      } catch (e: any) {
        if (String(e.message).includes("PIN")) {
          await storage.del("parent_pin_token");
          setPinRequired(true);
        } else {
          setFlash(`❌ ${e.message}`);
          setTimeout(() => setFlash(null), 3000);
        }
      }
    });
  };

  const filteredClaims = claims.filter(c => {
    if (claimsFilter === "all") return true;
    return c.status === claimsFilter;
  });

  const pendingClaimsCount = claims.filter(c => c.status === "pending").length;

  return (
    <SafeAreaView style={s.safe} edges={["top"]}>
      <ScreenHeader
        title="Récompenses"
        subtitle="Catalogue et gestion des remises"
        right={
          tab === "catalog" ? (
            <Pressable testID="open-add-reward" onPress={openCreate} style={s.addBtn}>
              <Ionicons name="add" size={22} color={T.white} />
            </Pressable>
          ) : null
        }
      />

      {/* Tabs */}
      <View style={s.tabsWrap}>
        <Pressable
          testID="tab-catalog"
          onPress={() => setTab("catalog")}
          style={[s.tabItem, tab === "catalog" && s.tabItemActive]}
        >
          <Text style={[s.tabText, tab === "catalog" && s.tabTextActive]}>📦 Catalogue ({rewards.length})</Text>
        </Pressable>
        <Pressable
          testID="tab-claims"
          onPress={() => setTab("claims")}
          style={[s.tabItem, tab === "claims" && s.tabItemActive]}
        >
          <Text style={[s.tabText, tab === "claims" && s.tabTextActive]}>
            🎁 Demandes {pendingClaimsCount > 0 ? `(${pendingClaimsCount})` : ""}
          </Text>
        </Pressable>
      </View>

      {flash ? (
        <View style={s.flash}>
          <Text style={s.flashText}>{flash}</Text>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={{ padding: S.lg, gap: S.sm, paddingBottom: S.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.orange} />}
      >
        {tab === "catalog" ? (
          <>
            {rewards.length === 0 && (
              <EmptyState emoji="🎁" title="Aucune récompense" subtitle="Ajoute-en avec le bouton +" />
            )}
            {rewards.map((r) => (
              <Card key={r.id} testID={`admin-reward-${r.id}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
                  <Text style={{ fontSize: 36 }}>{r.icon || "🎁"}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.title}>{r.title}</Text>
                    <Text style={s.sub}>{r.point_cost || r.cost} points</Text>
                  </View>
                  {isParent && (
                    <Pressable testID={`edit-reward-${r.id}`} onPress={() => openEdit(r)} style={{ padding: 6 }}>
                      <Ionicons name="create-outline" size={20} color={T.brand} />
                    </Pressable>
                  )}
                  <Pressable testID={`del-reward-${r.id}`} onPress={() => remove(r.id)} style={{ padding: 6 }}>
                    <Ionicons name="trash-outline" size={22} color={T.red} />
                  </Pressable>
                </View>
              </Card>
            ))}
          </>
        ) : (
          <>
            {/* Filter Claims */}
            <View style={s.filterRow}>
              <Pressable
                onPress={() => setClaimsFilter("pending")}
                style={[s.filterChip, claimsFilter === "pending" && s.filterChipActive]}
              >
                <Text style={[s.filterChipText, claimsFilter === "pending" && s.filterChipTextActive]}>
                  ⏳ À délivrer ({claims.filter(c => c.status === "pending").length})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setClaimsFilter("delivered")}
                style={[s.filterChip, claimsFilter === "delivered" && s.filterChipActive]}
              >
                <Text style={[s.filterChipText, claimsFilter === "delivered" && s.filterChipTextActive]}>
                  ✅ Déjà remises ({claims.filter(c => c.status === "delivered").length})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setClaimsFilter("all")}
                style={[s.filterChip, claimsFilter === "all" && s.filterChipActive]}
              >
                <Text style={[s.filterChipText, claimsFilter === "all" && s.filterChipTextActive]}>
                  Toutes ({claims.length})
                </Text>
              </Pressable>
            </View>

            {filteredClaims.length === 0 && (
              <EmptyState
                emoji="🎉"
                title={claimsFilter === "pending" ? "Tout est remis !" : "Aucune demande trouvée"}
                subtitle={claimsFilter === "pending" ? "Aucune récompense en attente de livraison" : ""}
              />
            )}

            {filteredClaims.map((c) => {
              const isDelivered = c.status === "delivered";
              return (
                <Card key={c.id} testID={`claim-card-${c.id}`} style={isDelivered ? s.deliveredCard : undefined}>
                  <View style={{ gap: S.sm }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: S.md }}>
                      <Text style={{ fontSize: 32 }}>{c.user_avatar || "🐻"}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.title}>{c.user_name} a réclamé</Text>
                        <Text style={s.claimRewardTitle}>« {c.reward_title} »</Text>
                        <Text style={s.sub}>Coût : {c.cost || c.point_cost} pts</Text>
                      </View>
                      <View style={[s.statusBadge, isDelivered ? s.badgeDelivered : s.badgePending]}>
                        <Text style={[s.statusBadgeText, isDelivered ? s.textDelivered : s.textPending]}>
                          {isDelivered ? "Remis ✅" : "En attente ⏳"}
                        </Text>
                      </View>
                    </View>

                    {!isDelivered ? (
                      <Pressable
                        testID={`deliver-btn-${c.id}`}
                        onPress={() => deliverClaim(c)}
                        style={({ pressed }) => [s.deliverBtn, pressed && { opacity: 0.85 }]}
                      >
                        <Ionicons name="gift" size={16} color={T.white} />
                        <Text style={s.deliverBtnText}>Marquer comme remise</Text>
                      </Pressable>
                    ) : (
                      <View style={s.deliveredInfo}>
                        <Text style={s.deliveredInfoText}>
                          Remis par {c.delivered_by_name || "Parent"}
                        </Text>
                      </View>
                    )}
                  </View>
                </Card>
              );
            })}
          </>
        )}
      </ScrollView>

      {/* Modal Add/Edit Reward */}
      <Modal visible={openAdd} transparent animationType="slide" onRequestClose={() => setOpenAdd(false)}>
        <View style={s.mBackdrop}>
          <View style={[s.mCard, { paddingBottom: insets.bottom + S.lg }]}>
            <Text style={s.mTitle}>
              {editingId ? "Modifier la récompense" : "Nouvelle récompense"}
            </Text>
            <TextInput
              testID="reward-title-input"
              value={title}
              onChangeText={setTitle}
              placeholder="Ex: Sortie ciné"
              placeholderTextColor={T.onSurfaceMuted}
              style={s.input}
            />
            <Text style={s.label}>Coût en points</Text>
            <TextInput
              testID="reward-cost-input"
              value={cost}
              onChangeText={setCost}
              keyboardType="number-pad"
              style={s.input}
            />
            <Text style={s.label}>Icône</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: S.sm }}>
              {ICONS.map((i) => (
                <Pressable
                  key={i}
                  testID={`icon-${i}`}
                  onPress={() => setIcon(i)}
                  style={[s.iconBtn, icon === i && s.iconBtnActive]}
                >
                  <Text style={{ fontSize: 22 }}>{i}</Text>
                </Pressable>
              ))}
            </View>
            {err ? <Text style={{ color: T.red, fontWeight: "700", marginTop: S.sm }}>{err}</Text> : null}
            <View style={{ flexDirection: "row", gap: S.sm, marginTop: S.lg }}>
              <Pressable style={s.cancelBtn} onPress={() => setOpenAdd(false)}>
                <Text style={{ fontWeight: "800", color: T.onSurfaceMuted }}>Annuler</Text>
              </Pressable>
              <Pressable testID="save-reward-button" style={s.saveBtn} onPress={submit}>
                <Text style={{ fontWeight: "900", color: T.white }}>
                  {editingId ? "Enregistrer" : "Créer"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ParentPinModal
        visible={pinRequired}
        onCancel={() => {
          setPinRequired(false);
          setPinAction(null);
        }}
        onSuccess={async () => {
          setPinRequired(false);
          if (pinAction) {
            await pinAction();
            setPinAction(null);
          }
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.surface },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.orange, alignItems: "center", justifyContent: "center", borderBottomWidth: 3, borderBottomColor: "#C77500" },
  tabsWrap: { flexDirection: "row", marginHorizontal: S.lg, marginBottom: S.sm, backgroundColor: T.surfaceSecondary, borderRadius: R.pill, padding: 4 },
  tabItem: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: R.pill },
  tabItemActive: { backgroundColor: T.white, shadowColor: T.shadow, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  tabText: { fontWeight: "800", fontSize: 13, color: T.onSurfaceMuted },
  tabTextActive: { color: T.onSurface, fontWeight: "900" },
  flash: { marginHorizontal: S.lg, marginBottom: S.sm, padding: S.md, backgroundColor: "#EFFBE0", borderRadius: R.md, borderWidth: 2, borderColor: T.brand },
  flashText: { fontWeight: "800", color: T.onSurface },
  filterRow: { flexDirection: "row", gap: S.xs, marginBottom: S.xs },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.pill, backgroundColor: T.surfaceSecondary, borderWidth: 1, borderColor: T.border },
  filterChipActive: { backgroundColor: "#FFF3E0", borderColor: T.orange },
  filterChipText: { fontSize: 12, fontWeight: "700", color: T.onSurfaceMuted },
  filterChipTextActive: { color: T.orange, fontWeight: "900" },
  title: { fontWeight: "900", fontSize: 15, color: T.onSurface },
  claimRewardTitle: { fontWeight: "800", fontSize: 16, color: T.brandDark, marginVertical: 2 },
  sub: { color: T.onSurfaceMuted, fontSize: 12 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill },
  badgePending: { backgroundColor: "#FFF3E0", borderWidth: 1, borderColor: T.orange },
  badgeDelivered: { backgroundColor: "#EFFBE0", borderWidth: 1, borderColor: T.brand },
  statusBadgeText: { fontSize: 11, fontWeight: "900" },
  textPending: { color: T.orange },
  textDelivered: { color: T.brandDark },
  deliveredCard: { opacity: 0.85, backgroundColor: "#FAFAF7" },
  deliverBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: T.brand, paddingVertical: 10, borderRadius: R.pill, borderBottomWidth: 3, borderBottomColor: T.brandDark, marginTop: 4 },
  deliverBtnText: { color: T.white, fontWeight: "900", fontSize: 13 },
  deliveredInfo: { backgroundColor: T.surfaceSecondary, padding: 8, borderRadius: R.sm, alignItems: "center" },
  deliveredInfoText: { fontSize: 12, color: T.onSurfaceMuted, fontWeight: "700" },
  mBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(26,26,26,0.6)" },
  mCard: { backgroundColor: T.white, padding: S.lg, borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg },
  mTitle: { fontWeight: "900", fontSize: 22, color: T.onSurface, marginBottom: S.md },
  input: { backgroundColor: T.surfaceSecondary, borderRadius: R.md, paddingHorizontal: S.md, paddingVertical: 12, fontSize: 15, color: T.onSurface, borderWidth: 2, borderColor: T.border, marginTop: 4 },
  label: { fontWeight: "800", color: T.onSurface, fontSize: 13, marginTop: S.md },
  iconBtn: { width: 48, height: 48, borderRadius: R.md, alignItems: "center", justifyContent: "center", backgroundColor: T.surfaceSecondary, borderWidth: 2, borderColor: T.border },
  iconBtnActive: { backgroundColor: "#EFFBE0", borderColor: T.brand },
  cancelBtn: { flex: 1, padding: 12, borderRadius: R.pill, alignItems: "center", backgroundColor: T.surfaceSecondary },
  saveBtn: { flex: 1, padding: 12, borderRadius: R.pill, alignItems: "center", backgroundColor: T.brand, borderBottomWidth: 3, borderBottomColor: T.brandDark },
});
