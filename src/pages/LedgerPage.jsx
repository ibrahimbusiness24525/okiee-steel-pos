import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal, FInput, SaveBtn } from "../components/shared";
import { formatPKR, todayStr, printThermalOrA4, downloadInvoicePdf } from "../utils/helpers";
import { ledgerApi, signedOpeningBalance, openingKindOf } from "../utils/ledgerStore";
import { ensureParty, liveBalance } from "../utils/tradeFinance";
import { adjustAccountBalance } from "../utils/accountBalance";
import { useAccounts, accId, accLabel, AccountOptGroups } from "../components/PaymentTerms";
import PartyLedgerSheet, { buildPartyLedger } from "../components/PartyLedgerSheet";

const EMPTY_PARTY = { name: "", phone: "", partyType: "", address: "", notes: "", openingBalance: "", openingKind: "lana" };
const EMPTY_TX = { role: "", partyId: "", amount: "", note: "", accountId: "" };

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
  const [txSearch, setTxSearch] = useState("");
  const [savingTx, setSavingTx] = useState(false);
  const accounts = useAccounts();

  const [detail, setDetail] = useState(null);
  const [entries, setEntries] = useState([]);
  const [ledgerFrom, setLedgerFrom] = useState("");
  const [ledgerTo, setLedgerTo] = useState("");
  const [pendingPrint, setPendingPrint] = useState(null);

  const L = isUrdu ? {
    createSupplier: "سپلائر بنائیں", createCustomer: "گاہک بنائیں",
    takeCredit: "میں نے لیے", giveCredit: "میں نے دیے",
    name: "نام", number: "نمبر", type: "قسم", address: "پتہ", note: "نوٹ",
    openingBal: "اوپننگ بیلنس",
    lana: "میں نے لینا ہے",
    dena: "میں نے دینا ہے",
    amount: "رقم", save: "محفوظ کریں",
    who: "سپلائر ہے یا گاہک؟", pick: "منتخب کریں",
    supplier: "سپلائر", customer: "گاہک",
    all: "سب", payable: "میں دوں گا", receivable: "میں لوں گا",
    search: "نام یا نمبر سے تلاش...",
    none: "ابھی کوئی کھاتہ نہیں",
    needName: "نام ضروری ہے", needPhone: "نمبر ضروری ہے",
    needWho: "پہلے سپلائر یا گاہک منتخب کریں", needParty: "نام منتخب کریں",
    needAmt: "رقم ضروری ہے", needAccount: "بینک / والٹ منتخب کریں",
    account: "بینک / والٹ",
    takeHint: "رقم منتخب بینک / والٹ میں آئے گی",
    giveHint: "رقم منتخب بینک / والٹ سے نکلے گی",
    youOwe: "میں دوں گا", theyOwe: "میں لوں گا", settled: "حساب صاف",
    edit: "ترمیم", del: "حذف", delParty: "کیا یہ کھاتہ حذف کریں؟",
    delTx: "کیا یہ اندراج حذف کریں؟",
    loading: "لوڈ ہو رہا ہے...", importBtn: "خریداری/فروخت سے درآمد",
    history: "اندراجات",
    printA4: "A4 پرنٹ", printThermal: "تھرمل", printPdf: "PDF",
    from: "سے", to: "تک",
    source: "حوالہ", desc: "تفصیل", debit: "میں نے دیے", credit: "میں نے لیے", balance: "بیلنس",
    opening: "اوپننگ بیلنس", total: "کل",
  } : {
    createSupplier: "Create Supplier", createCustomer: "Create Customer",
    takeCredit: "Maine Liye", giveCredit: "Maine Diye",
    name: "Name", number: "Number", type: "Type", address: "Address", note: "Note",
    openingBal: "Opening balance",
    lana: "Maine lana hain",
    dena: "Maine dena hain",
    amount: "Amount", save: "Save",
    who: "Supplier or Customer?", pick: "Select",
    supplier: "Supplier", customer: "Customer",
    all: "All", payable: "I will give", receivable: "I will get",
    search: "Search by name or number...",
    none: "No accounts yet",
    needName: "Name is required", needPhone: "Number is required",
    needWho: "Choose supplier or customer first", needParty: "Select a name",
    needAmt: "Amount is required", needAccount: "Select a bank or wallet",
    account: "Bank / Wallet",
    takeHint: "Money will come IN to this bank or wallet",
    giveHint: "Money will go OUT of this bank or wallet",
    youOwe: "I will give", theyOwe: "I will get", settled: "Settled",
    edit: "Edit", del: "Delete", delParty: "Delete this account?",
    delTx: "Delete this entry?",
    loading: "Loading...", importBtn: "Import from Purchases / Sales",
    history: "Entries",
    printA4: "A4 Print", printThermal: "Thermal", printPdf: "PDF",
    from: "From", to: "To",
    source: "Source", desc: "Description", debit: "Maine Diye", credit: "Maine Liye", balance: "Balance",
    opening: "Opening Balance", total: "Total",
  };

  const load = async () => {
    try {
      let r = await ledgerApi.list();
      if (!r.success) { alert(r.message || "Could not load"); return; }
      const have = new Set(
        (r.parties || []).map((p) => `${p.type}::${String(p.name || "").trim().toLowerCase()}`)
      );
      const missingFromTrade = (purchases || []).some((p) => {
        const n = (p.supplier || p.supplierName || "").trim();
        return n && n !== "—" && !have.has(`supplier::${n.toLowerCase()}`);
      }) || (sales || []).some((s) => {
        const n = (s.customer || "").trim();
        return n && n !== "—" && !have.has(`customer::${n.toLowerCase()}`);
      });
      if (missingFromTrade) {
        await ledgerApi.importNames(purchases, sales);
        r = await ledgerApi.list();
      }
      if (r.success) { setParties(r.parties || []); setRemote(r.remote !== false); }
      else alert(r.message || "Could not load");
    } catch (e) {
      alert(e.message || "Could not load");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const directory = useMemo(() => {
    const list = [...parties];
    const have = new Set(list.map((p) => `${p.type}::${String(p.name || "").trim().toLowerCase()}`));
    const addGhost = (type, name) => {
      const n = (name || "").trim();
      if (!n || n === "—") return;
      const key = `${type}::${n.toLowerCase()}`;
      if (have.has(key)) return;
      have.add(key);
      list.push({
        _id: `ghost:${type}:${n.toLowerCase()}`,
        type,
        name: n,
        phone: "",
        balance: 0,
        payable: 0,
        receivable: 0,
        openingBalance: 0,
        ghost: true,
      });
    };
    (purchases || []).forEach((p) => addGhost("supplier", p.supplier || p.supplierName));
    (sales || []).forEach((s) => addGhost("customer", s.customer));
    return list;
  }, [parties, purchases, sales]);

  const totals = useMemo(() => ({
    payable: directory.reduce((s, p) => s + (Number(p.payable) || Math.max(0, -(Number(p.balance) || 0))), 0),
    receivable: directory.reduce((s, p) => s + (Number(p.receivable) || Math.max(0, Number(p.balance) || 0)), 0),
  }), [directory]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return directory.filter((p) => {
      const net = Number(p.balance) || 0;
      if (filter === "payable" && !(net < -0.5)) return false;
      if (filter === "receivable" && !(net > 0.5)) return false;
      if (filter === "supplier" && p.type !== "supplier") return false;
      if (filter === "customer" && p.type !== "customer") return false;
      if (!q) return true;
      return (p.name || "").toLowerCase().includes(q)
        || (p.phone || "").toLowerCase().includes(q)
        || (p.address || "").toLowerCase().includes(q);
    }).sort((a, b) => {
      const na = Math.abs(Number(a.balance) || 0);
      const nb = Math.abs(Number(b.balance) || 0);
      const aOpen = na > 0.5 ? 1 : 0;
      const bOpen = nb > 0.5 ? 1 : 0;
      if (aOpen !== bOpen) return bOpen - aOpen;
      if (nb !== na) return nb - na;
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [directory, search, filter]);

  const dropdownParties = useMemo(
    () => directory.filter((p) => p.type === txForm.role && !p.ghost).sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [directory, txForm.role]
  );
  const txMatches = useMemo(() => {
    const q = txSearch.trim().toLowerCase();
    if (!q) return dropdownParties;
    return dropdownParties.filter((p) =>
      (p.name || "").toLowerCase().includes(q)
      || (p.phone || "").toLowerCase().includes(q)
      || (p.address || "").toLowerCase().includes(q)
    );
  }, [dropdownParties, txSearch]);
  const txPicked = dropdownParties.find((p) => p._id === txForm.partyId);

  const openCreate = (role) => {
    setCreateRole(role);
    setEditingId(null);
    setPartyForm({ ...EMPTY_PARTY, openingKind: role === "supplier" ? "dena" : "lana" });
    setShowParty(true);
  };
  const openEdit = (p) => {
    setCreateRole(p.type);
    setEditingId(p._id);
    const stored = Number(p.openingBalance) || 0;
    setPartyForm({
      name: p.name || "",
      phone: p.phone || "",
      partyType: p.partyType || "",
      address: p.address || "",
      notes: p.notes || "",
      openingBalance: stored ? String(Math.abs(stored)) : "",
      openingKind: openingKindOf(p.type, stored),
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
      openingBalance: signedOpeningBalance(createRole, partyForm.openingBalance, partyForm.openingKind),
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

  const openTx = (kind) => {
    setTxKind(kind);
    setTxForm(EMPTY_TX);
    setTxSearch("");
    setShowTx(true);
  };
  const saveTx = async () => {
    if (!txForm.role) { alert(L.needWho); return; }
    if (!txForm.partyId) { alert(L.needParty); return; }
    if (!Number(txForm.amount) || Number(txForm.amount) <= 0) { alert(L.needAmt); return; }
    if (accounts.length > 0 && !txForm.accountId) { alert(L.needAccount); return; }
    setSavingTx(true);
    const acc = (accounts || []).find((a) => accId(a) === txForm.accountId);
    const accountName = acc ? accLabel(acc) : "";
    const amt = Number(txForm.amount);
    const res = await ledgerApi.addEntry(txForm.partyId, {
      kind: txKind,
      amount: amt,
      date: todayStr(),
      note: txForm.note,
      accountId: txForm.accountId || "",
      accountName,
    });
    if (res.success) {
      if (txForm.accountId) {
        try {
          await adjustAccountBalance(txForm.accountId, {
            amount: amt,
            direction: txKind === "take" ? "in" : "out",
            accountName,
          });
        } catch (e) {
          console.error("account adjust failed", e);
        }
      }
      setShowTx(false);
      await load();
    } else alert(res.message);
    setSavingTx(false);
  };

  const openDetail = async (p) => {
    let id = p._id;
    if (p.ghost) {
      const created = await ensureParty(p.type, p.name);
      id = created?._id || created?.id;
      if (!id) { alert(isUrdu ? "کھاتہ نہیں کھل سکا" : "Could not open this account"); return; }
      await load();
    }
    const res = await ledgerApi.get(id);
    if (res.success) {
      setDetail(res.party);
      setEntries(res.entries || []);
      setLedgerFrom("");
      setLedgerTo("");
    }
    else alert(res.message);
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

  useEffect(() => {
    if (!pendingPrint || !detail) return;
    const mode = pendingPrint;
    const t = setTimeout(() => {
      const file = `ledger-${String(detail.name || "party").replace(/\s+/g, "-")}`;
      try {
        if (mode === "pdf") downloadInvoicePdf(file);
        else printThermalOrA4(mode, file);
      } finally {
        setPendingPrint(null);
      }
    }, 80);
    return () => clearTimeout(t);
  }, [pendingPrint]);

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
        </div>
        <div style={{ padding: 16, borderRadius: 16, background: "rgba(22,163,74,0.08)", border: "1px solid rgba(22,163,74,0.3)" }}>
          <div style={{ color: "#16a34a", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em" }}>{L.receivable}</div>
          <div style={{ color: "#16a34a", fontWeight: 900, fontSize: isMobile ? 18 : 22, marginTop: 4 }}>{formatPKR(totals.receivable)}</div>
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
            <FInput
              label={L.openingBal}
              value={partyForm.openingBalance}
              onChange={(v) => setPartyForm((p) => ({ ...p, openingBalance: v.replace(/[^0-9.]/g, "") }))}
              placeholder="0"
            />
            <div style={{ display: "flex", gap: 8, marginTop: -6 }}>
              {[
                { id: "lana", label: L.lana, color: "#16a34a" },
                { id: "dena", label: L.dena, color: "#dc2626" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPartyForm((p) => ({ ...p, openingKind: opt.id }))}
                  style={{
                    flex: 1, padding: "10px", borderRadius: 12, cursor: "pointer", fontWeight: 800, fontSize: 13,
                    border: partyForm.openingKind === opt.id ? "none" : `1px solid ${th.border}`,
                    background: partyForm.openingKind === opt.id ? opt.color : th.bgCard,
                    color: partyForm.openingKind === opt.id ? "#fff" : th.textMuted,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
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
                  <button key={role} onClick={() => { setTxForm((p) => ({ ...p, role, partyId: "" })); setTxSearch(""); }} style={{
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
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 12, top: 12, color: th.textMuted, pointerEvents: "none" }}>
                    <Icon path={ICONS.search} size={14} />
                  </span>
                  <input
                    value={txSearch}
                    onChange={(e) => {
                      setTxSearch(e.target.value);
                      setTxForm((p) => (p.partyId ? { ...p, partyId: "" } : p));
                    }}
                    placeholder={L.search}
                    autoFocus
                    style={{ ...inpS, paddingLeft: 36 }}
                  />
                </div>
                {txPicked && (
                  <div style={{
                    marginTop: 8, padding: "8px 10px", borderRadius: 10,
                    border: `1px solid ${txForm.role === "supplier" ? "rgba(217,119,6,0.35)" : "rgba(37,99,235,0.35)"}`,
                    background: txForm.role === "supplier" ? "rgba(217,119,6,0.08)" : "rgba(37,99,235,0.08)",
                    color: th.text, fontSize: 13, fontWeight: 700,
                  }}>
                    {txPicked.name}{txPicked.phone ? ` · ${txPicked.phone}` : ""}
                  </div>
                )}
                <div style={{
                  marginTop: 8, maxHeight: 220, overflowY: "auto",
                  border: `1px solid ${th.border}`, borderRadius: 12,
                  background: th.bgCard,
                }}>
                  {dropdownParties.length === 0 && (
                    <div style={{ padding: 14, color: "#d97706", fontSize: 12, fontWeight: 600 }}>
                      {isUrdu ? "پہلے کھاتہ بنائیں" : "Create a party first"}
                    </div>
                  )}
                  {dropdownParties.length > 0 && txMatches.length === 0 && (
                    <div style={{ padding: 14, color: th.textDim, fontSize: 13, textAlign: "center" }}>
                      {isUrdu ? "کوئی نام نہیں ملا" : "No name matched"}
                    </div>
                  )}
                  {txMatches.map((p) => {
                    const on = txForm.partyId === p._id;
                    return (
                      <button
                        key={p._id}
                        type="button"
                        onClick={() => {
                          setTxForm((f) => ({ ...f, partyId: p._id }));
                          setTxSearch(p.name || "");
                        }}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          padding: "10px 12px", cursor: "pointer",
                          border: "none", borderBottom: `1px solid ${th.border}`,
                          background: on ? (txForm.role === "supplier" ? "rgba(217,119,6,0.16)" : "rgba(37,99,235,0.16)") : "transparent",
                          color: th.text, fontWeight: on ? 800 : 600, fontSize: 13,
                        }}
                      >
                        <div>{p.name}</div>
                        {p.phone ? <div style={{ color: th.textMuted, fontSize: 11, marginTop: 2 }}>{p.phone}</div> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <FInput label={L.amount} value={txForm.amount} onChange={(v) => setTxForm((p) => ({ ...p, amount: v.replace(/[^0-9.]/g, "") }))} required placeholder="0" />
            <div>
              <label style={{ color: th.textMuted, fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6 }}>
                {L.account} {accounts.length > 0 ? <span style={{ color: "#f87171" }}>*</span> : null}
              </label>
              {accounts.length === 0 ? (
                <div style={{ padding: "10px 12px", borderRadius: 10, border: `1px dashed ${th.border}`, color: th.textMuted, fontSize: 12 }}>
                  {isUrdu ? "پہلے بینک اور والٹ میں کیش / بینک بنائیں" : "Add a cash or bank in Banks and Wallet first"}
                </div>
              ) : (
                <select value={txForm.accountId} onChange={(e) => setTxForm((p) => ({ ...p, accountId: e.target.value }))} style={inpS}>
                  <option value="">— {L.account} —</option>
                  <AccountOptGroups accounts={accounts} th={th} isUrdu={isUrdu} />
                </select>
              )}
              <div style={{ color: txKind === "take" ? "#16a34a" : "#dc2626", fontSize: 12, fontWeight: 700, marginTop: 6 }}>
                {txKind === "take" ? L.takeHint : L.giveHint}
              </div>
            </div>
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
        <Modal
          title={detail.name}
          onClose={() => { setDetail(null); setEntries([]); setPendingPrint(null); }}
          xl
          headerRight={
            <>
              {[
                { id: "a4", label: L.printA4, color: "#2563eb" },
                { id: "thermal", label: L.printThermal, color: "#0f766e" },
                { id: "pdf", label: L.printPdf, color: "#7c3aed" },
              ].map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setPendingPrint(b.id)}
                  style={{ padding: "5px 9px", borderRadius: 8, border: "none", cursor: "pointer", background: b.color, color: "#fff", fontWeight: 800, fontSize: 11, whiteSpace: "nowrap" }}
                >
                  {b.label}
                </button>
              ))}
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minHeight: isMobile ? 0 : 520 }}>
            <div style={{ color: th.textMuted, fontSize: 13 }}>{detail.phone || "—"}{detail.address ? ` · ${detail.address}` : ""}</div>
            <div style={{ color: toneColor(tone(netOf(detail))), fontWeight: 900, fontSize: 26 }}>{formatPKR(Math.abs(netOf(detail)))}</div>
            <div style={{ color: toneColor(tone(netOf(detail))), fontWeight: 700, fontSize: 13 }}>{toneLabel(netOf(detail))}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button onClick={() => openEdit(detail)} style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${th.border}`, background: th.bgCard, color: th.text, cursor: "pointer", fontWeight: 700, fontSize: 12 }}>{L.edit}</button>
              <label style={{ color: th.textMuted, fontSize: 12, fontWeight: 700 }}>{L.from}</label>
              <input type="date" value={ledgerFrom} onChange={(e) => setLedgerFrom(e.target.value)} style={{ ...inpS, width: "auto", padding: "6px 10px" }} />
              <label style={{ color: th.textMuted, fontSize: 12, fontWeight: 700 }}>{L.to}</label>
              <input type="date" value={ledgerTo} onChange={(e) => setLedgerTo(e.target.value)} style={{ ...inpS, width: "auto", padding: "6px 10px" }} />
            </div>
            {(() => {
              const pack = buildPartyLedger({ party: detail, entries, from: ledgerFrom, to: ledgerTo, isUrdu });
              const thS = { textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 800, color: th.textMuted, borderBottom: `1px solid ${th.border}`, whiteSpace: "nowrap" };
              const tdS = { padding: "8px 10px", borderBottom: `1px solid ${th.border}`, fontSize: 13, color: th.text };
              const numS = { ...tdS, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
              return (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: th.textMuted }}>{L.history}</div>
                    <div style={{ fontSize: 12, fontWeight: 800, color: th.text }}>{L.opening}: {formatPKR(pack.opening)}</div>
                  </div>
                  <div style={{ overflowX: "auto", border: `1px solid ${th.border}`, borderRadius: 12 }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
                      <thead>
                        <tr style={{ background: th.dark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.03)" }}>
                          <th style={thS}>#</th>
                          <th style={thS}>{isUrdu ? "تاریخ" : "Date"}</th>
                          <th style={thS}>{L.source}</th>
                          <th style={thS}>{L.desc}</th>
                          <th style={{ ...thS, textAlign: "right" }}>{L.debit}</th>
                          <th style={{ ...thS, textAlign: "right" }}>{L.credit}</th>
                          <th style={{ ...thS, textAlign: "right" }}>{L.balance}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(pack.rows.length ? pack.rows : [{ date: "—", source: "—", description: "—", debit: 0, credit: 0, balance: pack.opening }]).map((r, i) => (
                          <tr key={i}>
                            <td style={tdS}>{i + 1}</td>
                            <td style={{ ...tdS, whiteSpace: "nowrap" }}>{r.date}</td>
                            <td style={tdS}>{r.source}</td>
                            <td style={tdS}>{r.description}</td>
                            <td style={numS}>{formatPKR(r.debit)}</td>
                            <td style={numS}>{formatPKR(r.credit)}</td>
                            <td style={{ ...numS, fontWeight: 800 }}>{formatPKR(r.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td style={{ ...tdS, borderBottom: "none", fontWeight: 800 }} colSpan={4}>{L.total}</td>
                          <td style={{ ...numS, borderBottom: "none", fontWeight: 800 }}>{formatPKR(pack.totalDebit)}</td>
                          <td style={{ ...numS, borderBottom: "none", fontWeight: 800 }}>{formatPKR(pack.totalCredit)}</td>
                          <td style={{ ...numS, borderBottom: "none", fontWeight: 800 }}>{formatPKR(pack.closing)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              );
            })()}
            <div style={{ position: "fixed", left: -10000, top: 0, pointerEvents: "none" }} aria-hidden="true">
              <PartyLedgerSheet
                party={detail}
                entries={entries}
                from={ledgerFrom}
                to={ledgerTo}
                isUrdu={isUrdu}
                compact={pendingPrint === "thermal"}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default LedgerPage;
