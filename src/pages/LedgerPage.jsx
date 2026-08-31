import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal, FInput, SaveBtn } from "../components/shared";
import { formatPKR, todayStr } from "../utils/helpers";
import { ledgerApi } from "../utils/ledgerStore";

const EMPTY_PARTY = { name: "", phone: "", partyType: "", address: "", notes: "" };
const EMPTY_TX = { role: "", partyId: "", amount: "", note: "" };

function LedgerPage({ purchases = [], sales = [] }) {
  const th = useTheme();
  const { isUrdu } = useLang();
  const { isMobile } = useResponsive();

  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [remote, setRemote] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [showParty, setShowParty] = useState(false);
  const [createRole, setCreateRole] = useState("supplier");
  const [editingId, setEditingId] = useState(null);
  const [partyForm, setPartyForm] = useState(EMPTY_PARTY);
  const [savingParty, setSavingParty] = useState(false);

  const [showTx, setShowTx] = useState(false);
  const [txKind, setTxKind] = useState("take");
  const [txForm, setTxForm] = useState(EMPTY_TX);
  const [savingTx, setSavingTx] = useState(false);

  const [detail, setDetail] = useState(null);
  const [entries, setEntries] = useState([]);

  const L = isUrdu ? {
    createSupplier: "سپلائر بنائیں", createCustomer: "گاہک بنائیں",
    takeCredit: "کریڈٹ لیں", giveCredit: "کریڈٹ دیں",
    name: "نام", number: "نمبر", type: "قسم", address: "پتہ", note: "نوٹ",
    amount: "رقم", save: "محفوظ کریں",
    who: "سپلائر ہے یا گاہک؟", pick: "منتخب کریں",
    supplier: "سپلائر", customer: "گاہک",
    all: "سب", payable: "ادائیگی", receivable: "وصولی",
    search: "نام یا نمبر سے تلاش...",
    none: "ابھی کوئی کھاتہ نہیں",
    needName: "نام ضروری ہے", needPhone: "نمبر ضروری ہے",
    needWho: "پہلے سپلائر یا گاہک منتخب کریں", needParty: "نام منتخب کریں",
    needAmt: "رقم ضروری ہے",
    youOwe: "آپ ادا کریں گے", theyOwe: "وہ ادا کریں گے", settled: "حساب صاف",
    edit: "ترمیم", del: "حذف", delParty: "کیا یہ کھاتہ حذف کریں؟",
    delTx: "کیا یہ اندراج حذف کریں؟",
    loading: "لوڈ ہو رہا ہے...", importBtn: "خریداری/فروخت سے درآمد",
    history: "اندراجات",
  } : {
    createSupplier: "Create Supplier", createCustomer: "Create Customer",
    takeCredit: "Take Credit", giveCredit: "Give Credit",
    name: "Name", number: "Number", type: "Type", address: "Address", note: "Note",
    amount: "Amount", save: "Save",
    who: "Supplier or Customer?", pick: "Select",
    supplier: "Supplier", customer: "Customer",
    all: "All", payable: "Payable", receivable: "Receivable",
    search: "Search by name or number...",
    none: "No accounts yet",
    needName: "Name is required", needPhone: "Number is required",
    needWho: "Choose supplier or customer first", needParty: "Select a name",
    needAmt: "Amount is required",
    youOwe: "You will pay", theyOwe: "They will pay you", settled: "Settled",
    edit: "Edit", del: "Delete", delParty: "Delete this account?",
    delTx: "Delete this entry?",
    loading: "Loading...", importBtn: "Import from Purchases / Sales",
    history: "Entries",
  };

  const load = async () => {
    try {
      const r = await ledgerApi.list();
      if (r.success) { setParties(r.parties || []); setRemote(r.remote !== false); }
      else alert(r.message || "Could not load");
    } catch (e) {
      alert(e.message || "Could not load");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const totals = useMemo(() => ({
    payable: parties.reduce((s, p) => s + (Number(p.payable) || Math.max(0, -(Number(p.balance) || 0))), 0),
    receivable: parties.reduce((s, p) => s + (Number(p.receivable) || Math.max(0, Number(p.balance) || 0)), 0),
  }), [parties]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return parties.filter((p) => {
      const net = Number(p.balance) || 0;
      if (filter === "payable" && !(net < -0.5)) return false;
      if (filter === "receivable" && !(net > 0.5)) return false;
      if (filter === "supplier" && p.type !== "supplier") return false;
      if (filter === "customer" && p.type !== "customer") return false;
      if (!q) return true;
      return (p.name || "").toLowerCase().includes(q)
        || (p.phone || "").toLowerCase().includes(q)
        || (p.address || "").toLowerCase().includes(q);
    });
  }, [parties, search, filter]);

  const dropdownParties = useMemo(
    () => parties.filter((p) => p.type === txForm.role).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [parties, txForm.role]
  );

  const openCreate = (role) => {
    setCreateRole(role);
    setEditingId(null);
    setPartyForm(EMPTY_PARTY);
    setShowParty(true);
  };
  const openEdit = (p) => {
    setCreateRole(p.type);
    setEditingId(p._id);
    setPartyForm({
      name: p.name || "",
      phone: p.phone || "",
      partyType: p.partyType || "",
      address: p.address || "",
      notes: p.notes || "",
    });
    setShowParty(true);
  };
  const saveParty = async () => {
    if (!partyForm.name.trim()) { alert(L.needName); return; }
    if (!partyForm.phone.trim()) { alert(L.needPhone); return; }
    setSavingParty(true);
    const payload = {
      type: createRole,
      name: partyForm.name.trim(),
      phone: partyForm.phone.trim(),
      partyType: partyForm.partyType.trim(),
      address: partyForm.address.trim(),
      notes: partyForm.notes.trim(),
    };
    const res = editingId ? await ledgerApi.update(editingId, payload) : await ledgerApi.add(payload);
    if (res.success) {
      setShowParty(false);
      await load();
      if (editingId && detail && detail._id === editingId) {
        const g = await ledgerApi.get(editingId);
        if (g.success) setDetail(g.party);
      }
    } else alert(res.message);
    setSavingParty(false);
  };
  const delParty = async (p) => {
    if (!window.confirm(L.delParty)) return;
    const res = await ledgerApi.remove(p._id);
    if (res.success) {
      if (detail && detail._id === p._id) { setDetail(null); setEntries([]); }
      await load();
    } else alert(res.message);
  };

  const openTx = (kind) => {
    setTxKind(kind);
    setTxForm(EMPTY_TX);
    setShowTx(true);
  };
  const saveTx = async () => {
    if (!txForm.role) { alert(L.needWho); return; }
    if (!txForm.partyId) { alert(L.needParty); return; }
    if (!Number(txForm.amount) || Number(txForm.amount) <= 0) { alert(L.needAmt); return; }
    setSavingTx(true);
    const res = await ledgerApi.addEntry(txForm.partyId, {
      kind: txKind,
      amount: Number(txForm.amount),
      date: todayStr(),
      note: txForm.note,
    });
    if (res.success) { setShowTx(false); await load(); }
    else alert(res.message);
    setSavingTx(false);
  };

  const openDetail = async (p) => {
    const res = await ledgerApi.get(p._id);
    if (res.success) { setDetail(res.party); setEntries(res.entries || []); }
    else alert(res.message);
  };
  const delTx = async (e) => {
    if (!detail) return;
    if (!window.confirm(L.delTx)) return;
    const res = await ledgerApi.removeEntry(detail._id, e._id);
    if (res.success) {
      setDetail(res.party);
      setEntries(res.entries || []);
      await load();
    } else alert(res.message);
  };

  const doImport = async () => {
    const res = await ledgerApi.importNames(purchases, sales);
    if (res.success) {
      await load();
      alert(isUrdu ? `${res.created || 0} کھاتہ درآمد ہوئے` : `${res.created || 0} imported`);
    } else alert(res.message);
  };

  const netOf = (p) => Number(p.balance) || 0;
  const tone = (net) => (net > 0.5 ? "green" : net < -0.5 ? "red" : "zero");
  const toneColor = (t) => (t === "green" ? "#16a34a" : t === "red" ? "#dc2626" : "#64748b");
  const toneBg = (t) => (t === "green" ? "rgba(22,163,74,0.08)" : t === "red" ? "rgba(220,38,38,0.08)" : th.bgCard);
  const toneBorder = (t) => (t === "green" ? "rgba(22,163,74,0.35)" : t === "red" ? "rgba(220,38,38,0.35)" : th.border);
  const toneLabel = (net) => (net > 0.5 ? L.theyOwe : net < -0.5 ? L.youOwe : L.settled);

  const inpS = {
    background: th.input, border: `1px solid ${th.inputBorder}`, color: th.text,
    borderRadius: 12, padding: "10px 14px", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box",
  };
  const btnBase = {
    display: "flex", alignItems: "center", gap: 6, padding: isMobile ? "9px 12px" : "10px 16px",
    borderRadius: 12, border: "none", cursor: "pointer", fontWeight: 800, fontSize: isMobile ? 12 : 13, color: "#fff",
  };

  if (loading) {
    return <div style={{ textAlign: "center", padding: 60, color: th.textDim }}>⏳ {L.loading}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => openCreate("supplier")} style={{ ...btnBase, background: "#d97706" }}>
            <Icon path={ICONS.plus} size={14} /> {L.createSupplier}
          </button>
          <button onClick={() => openCreate("customer")} style={{ ...btnBase, background: "#2563eb" }}>
            <Icon path={ICONS.plus} size={14} /> {L.createCustomer}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => openTx("take")} style={{ ...btnBase, background: "#dc2626" }}>{L.takeCredit}</button>
          <button onClick={() => openTx("give")} style={{ ...btnBase, background: "#16a34a" }}>{L.giveCredit}</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr", gap: 10 }}>
        <div style={{ padding: 16, borderRadius: 16, background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.3)" }}>
          <div style={{ color: "#dc2626", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em" }}>{L.payable}</div>
          <div style={{ color: "#dc2626", fontWeight: 900, fontSize: isMobile ? 18 : 22, marginTop: 4 }}>{formatPKR(totals.payable)}</div>
          <div style={{ color: "#dc2626", fontSize: 12, marginTop: 2 }}>{L.youOwe}</div>
        </div>
        <div style={{ padding: 16, borderRadius: 16, background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.3)" }}>
          <div style={{ color: "#16a34a", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em" }}>{L.receivable}</div>
          <div style={{ color: "#16a34a", fontWeight: 900, fontSize: isMobile ? 18 : 22, marginTop: 4 }}>{formatPKR(totals.receivable)}</div>
          <div style={{ color: "#16a34a", fontSize: 12, marginTop: 2 }}>{L.theyOwe}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {[
          { id: "all", label: L.all },
          { id: "payable", label: L.payable, color: "#dc2626" },
          { id: "receivable", label: L.receivable, color: "#16a34a" },
          { id: "supplier", label: L.supplier },
          { id: "customer", label: L.customer },
        ].map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={{
            padding: "7px 12px", borderRadius: 20, cursor: "pointer", fontWeight: 700, fontSize: 12,
            border: filter === f.id ? "none" : `1px solid ${th.border}`,
            background: filter === f.id ? (f.color || "#0f766e") : "transparent",
            color: filter === f.id ? "#fff" : th.textMuted,
          }}>{f.label}</button>
        ))}
        <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: th.textMuted }}>
            <Icon path={ICONS.search} size={14} />
          </span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={L.search} style={{ ...inpS, paddingLeft: 36 }} />
        </div>
        <button onClick={doImport} style={{
          padding: "8px 12px", borderRadius: 12, border: `1px solid ${th.border}`, background: th.bgCard,
          color: th.textMuted, cursor: "pointer", fontWeight: 700, fontSize: 12,
        }}>{L.importBtn}</button>
      </div>

      {!remote && (
        <div style={{ padding: "8px 12px", borderRadius: 10, background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", color: "#b45309", fontSize: 12, fontWeight: 600 }}>
          {isUrdu ? "کھاتہ اس ڈیوائس پر محفوظ ہو رہا ہے جب تک backend deploy نہ ہو۔" : "Saved on this device until backend is deployed."}
        </div>
      )}

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 48, color: th.textDim, border: `1px dashed ${th.border}`, borderRadius: 16 }}>{L.none}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
          {filtered.map((p) => {
            const net = netOf(p);
            const t = tone(net);
            return (
              <div key={p._id} onClick={() => openDetail(p)} style={{
                padding: 16, borderRadius: 16, cursor: "pointer",
                background: toneBg(t), border: `1.5px solid ${toneBorder(t)}`,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: th.text, fontWeight: 800, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ color: th.textMuted, fontSize: 12, marginTop: 2 }}>{p.phone || "—"}</div>
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 20, flexShrink: 0,
                    background: p.type === "supplier" ? "rgba(217,119,6,0.15)" : "rgba(37,99,235,0.15)",
                    color: p.type === "supplier" ? "#d97706" : "#2563eb",
                  }}>{p.type === "supplier" ? L.supplier : L.customer}</span>
                </div>
                {(p.partyType || p.address) && (
                  <div style={{ color: th.textDim, fontSize: 12, marginTop: 8 }}>
                    {p.partyType ? p.partyType : ""}{p.partyType && p.address ? " · " : ""}{p.address || ""}
                  </div>
                )}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${toneBorder(t)}` }}>
                  <div style={{ color: toneColor(t), fontWeight: 900, fontSize: 18 }}>{formatPKR(Math.abs(net))}</div>
                  <div style={{ color: toneColor(t), fontSize: 12, fontWeight: 700 }}>{toneLabel(net)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showParty && (
        <Modal title={editingId ? (createRole === "supplier" ? L.createSupplier : L.createCustomer) : (createRole === "supplier" ? L.createSupplier : L.createCustomer)} onClose={() => setShowParty(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <FInput label={L.name} value={partyForm.name} onChange={(v) => setPartyForm((p) => ({ ...p, name: v }))} required placeholder={createRole === "supplier" ? "e.g. Ahmed Steel" : "e.g. Malik Traders"} />
            <FInput label={L.number} value={partyForm.phone} onChange={(v) => setPartyForm((p) => ({ ...p, phone: v }))} required placeholder="03xx-xxxxxxx" />
            <FInput label={L.type} value={partyForm.partyType} onChange={(v) => setPartyForm((p) => ({ ...p, partyType: v }))} placeholder={isUrdu ? "مثلاً ہول سیل / لوکل" : "e.g. Wholesale / Local"} />
            <FInput label={L.address} value={partyForm.address} onChange={(v) => setPartyForm((p) => ({ ...p, address: v }))} placeholder={isUrdu ? "پتہ" : "Address"} />
            <FInput label={L.note} value={partyForm.notes} onChange={(v) => setPartyForm((p) => ({ ...p, notes: v }))} placeholder="..." />
            <SaveBtn onClick={saveParty} loading={savingParty} label={savingParty ? "..." : L.save} />
          </div>
        </Modal>
      )}

      {showTx && (
        <Modal title={txKind === "take" ? L.takeCredit : L.giveCredit} onClose={() => setShowTx(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ color: th.textMuted, fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6 }}>{L.who} <span style={{ color: "#f87171" }}>*</span></label>
              <div style={{ display: "flex", gap: 8 }}>
                {["supplier", "customer"].map((role) => (
                  <button key={role} onClick={() => setTxForm((p) => ({ ...p, role, partyId: "" }))} style={{
                    flex: 1, padding: "10px", borderRadius: 12, cursor: "pointer", fontWeight: 800, fontSize: 13,
                    border: txForm.role === role ? "none" : `1px solid ${th.border}`,
                    background: txForm.role === role ? (role === "supplier" ? "#d97706" : "#2563eb") : th.bgCard,
                    color: txForm.role === role ? "#fff" : th.textMuted,
                  }}>{role === "supplier" ? L.supplier : L.customer}</button>
                ))}
              </div>
            </div>
            {txForm.role && (
              <div>
                <label style={{ color: th.textMuted, fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6 }}>{txForm.role === "supplier" ? L.supplier : L.customer} <span style={{ color: "#f87171" }}>*</span></label>
                <select value={txForm.partyId} onChange={(e) => setTxForm((p) => ({ ...p, partyId: e.target.value }))} style={inpS}>
                  <option value="">— {L.pick} —</option>
                  {dropdownParties.map((p) => (
                    <option key={p._id} value={p._id} style={{ background: th.bgModal }}>{p.name} {p.phone ? `(${p.phone})` : ""}</option>
                  ))}
                </select>
                {dropdownParties.length === 0 && (
                  <div style={{ color: "#d97706", fontSize: 12, marginTop: 6 }}>
                    {isUrdu ? "پہلے کھاتہ بنائیں" : "Create a party first"}
                  </div>
                )}
              </div>
            )}
            <FInput label={L.amount} value={txForm.amount} onChange={(v) => setTxForm((p) => ({ ...p, amount: v.replace(/[^0-9.]/g, "") }))} required placeholder="0" />
            <FInput label={L.note} value={txForm.note} onChange={(v) => setTxForm((p) => ({ ...p, note: v }))} placeholder="..." />
            <SaveBtn
              onClick={saveTx}
              loading={savingTx}
              color={txKind === "take" ? "#dc2626" : "#16a34a"}
              label={savingTx ? "..." : (txKind === "take" ? L.takeCredit : L.giveCredit)}
            />
          </div>
        </Modal>
      )}

      {detail && (
        <Modal title={detail.name} onClose={() => { setDetail(null); setEntries([]); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ color: th.textMuted, fontSize: 13 }}>{detail.phone || "—"}{detail.address ? ` · ${detail.address}` : ""}</div>
            <div style={{ color: toneColor(tone(netOf(detail))), fontWeight: 900, fontSize: 22 }}>{formatPKR(Math.abs(netOf(detail)))}</div>
            <div style={{ color: toneColor(tone(netOf(detail))), fontWeight: 700, fontSize: 13 }}>{toneLabel(netOf(detail))}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => openEdit(detail)} style={{ flex: 1, padding: 8, borderRadius: 10, border: `1px solid ${th.border}`, background: th.bgCard, color: th.text, cursor: "pointer", fontWeight: 700, fontSize: 12 }}>{L.edit}</button>
              <button onClick={() => delParty(detail)} style={{ flex: 1, padding: 8, borderRadius: 10, border: "1px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.08)", color: "#dc2626", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>{L.del}</button>
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: th.textMuted }}>{L.history}</div>
            {entries.length === 0 && <div style={{ color: th.textDim, fontSize: 13 }}>—</div>}
            {entries.map((e) => {
              const isTake = e.kind === "take" || (e.kind === "credit" && detail.type === "supplier");
              const isGive = e.kind === "give" || (e.kind === "credit" && detail.type === "customer");
              const red = isTake;
              const green = isGive;
              const label = e.kind === "take" ? L.takeCredit : e.kind === "give" ? L.giveCredit : e.kind;
              return (
                <div key={e._id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 0", borderTop: `1px solid ${th.border}` }}>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 12, color: red ? "#dc2626" : green ? "#16a34a" : th.text }}>{label}</div>
                    <div style={{ fontSize: 11, color: th.textDim }}>{e.date} {e.note ? `· ${e.note}` : ""}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontWeight: 900, color: red ? "#dc2626" : green ? "#16a34a" : th.text }}>{formatPKR(e.amount)}</span>
                    <button onClick={() => delTx(e)} style={{ background: "none", border: "none", cursor: "pointer", color: "#f87171" }}><Icon path={ICONS.trash} size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}

export default LedgerPage;
