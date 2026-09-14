import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS, Modal, FInput, SaveBtn, StatCard, Table, DateFilterBar } from "../components/shared";
import { formatPKR, todayStr, inDateFilter } from "../utils/helpers";
import { expenseApi, applyExpenseFinance, reverseExpenseFinance, ensurePendingAccountCuts, DEFAULT_EXPENSE_TYPES } from "../utils/expenseStore";
import { useAccounts, AccountOptGroups } from "../components/PaymentTerms";
import { liveBalance } from "../utils/tradeFinance";

const EMPTY = {
  date: todayStr(),
  type: "Misc",
  amount: "",
  note: "",
  accountId: "",
};

export default function ExpensesPage({ loadExpenses: reloadExpensesInApp, loadParties: reloadPartiesInApp }) {
  const th = useTheme();
  const { isUrdu } = useLang();
  const { isMobile } = useResponsive();
  const accounts = useAccounts();

  const L = isUrdu ? {
    title: "اخراجات",
    add: "اخراج شامل کریں",
    types: "قسمیں",
    type: "قسم",
    amount: "رقم",
    note: "نوٹ",
    date: "تاریخ",
    paid: "ادا شدہ",
    payable: "قابل ادائیگی",
    receivable: "قابل وصول",
    account: "بینک / والٹ",
    fromAccount: "اخراج کس بینک / والٹ سے",
    allAccounts: "تمام بینک / والٹ",
    party: "نام",
    supplier: "سپلائر",
    customer: "گاہک",
    save: "محفوظ کریں",
    total: "کل اخراج",
    none: "اس مدت میں کوئی اخراج نہیں",
    needType: "قسم منتخب کریں",
    needAmt: "رقم لکھیں",
    needAccount: "بینک / والٹ منتخب کریں",
    needParty: "نام منتخب کریں",
    del: "کیا یہ اخراج حذف کریں؟",
    addType: "نئی قسم",
    editType: "قسم تبدیل کریں",
    typeName: "قسم کا نام",
    pickType: "قسم منتخب کریں",
    delType: "کیا یہ قسم حذف کریں؟",
    all: "سب",
    search: "تلاش...",
    settle: "حساب",
    loading: "لوڈ ہو رہا ہے...",
    paidHint: "کیش / بینک سے ابھی ادا",
    payableHint: "ابھی ادا نہیں — سپلائر کے کھاتے میں payable",
    receivableHint: "ہم نے ادا کیا — گاہک کے کھاتے میں receivable",
  } : {
    title: "Expenses",
    add: "Add expense",
    types: "Types",
    type: "Type",
    amount: "Amount",
    note: "Note",
    date: "Date",
    paid: "Paid",
    payable: "Payable",
    receivable: "Receivable",
    account: "Bank / Wallet",
    fromAccount: "Expense from bank / wallet",
    allAccounts: "All banks / wallets",
    party: "Name",
    supplier: "Supplier",
    customer: "Customer",
    save: "Save",
    total: "Total expenses",
    none: "No expenses in this period",
    needType: "Select a type",
    needAmt: "Enter an amount",
    needAccount: "Select a bank or wallet",
    needParty: "Select a name",
    del: "Delete this expense?",
    addType: "New type",
    editType: "Edit type",
    typeName: "Type name",
    pickType: "Select type",
    delType: "Delete this type?",
    all: "All",
    search: "Search...",
    settle: "Settlement",
    loading: "Loading...",
    paidHint: "Paid now from cash / bank",
    payableHint: "Not paid yet — goes to supplier payable",
    receivableHint: "We paid — customer owes us (receivable)",
  };

  const [expenses, setExpenses] = useState([]);
  const [types, setTypes] = useState(DEFAULT_EXPENSE_TYPES);
  const [typeRecords, setTypeRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showTypes, setShowTypes] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [newType, setNewType] = useState("");
  const [saving, setSaving] = useState(false);
  const [dateFilter, setDateFilter] = useState("today");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [search, setSearch] = useState("");

  const inpS = {
    background: th.input, border: `1px solid ${th.inputBorder}`, color: th.text,
    borderRadius: 10, padding: "10px 12px", fontSize: 14, outline: "none",
    width: "100%", boxSizing: "border-box",
  };

  const load = async () => {
    try {
      const [er, tr] = await Promise.all([expenseApi.list(), expenseApi.types()]);
      if (er.success) {
        await ensurePendingAccountCuts(er.expenses || []);
        setExpenses(er.expenses || []);
      }
      if (tr.success) {
        setTypes(tr.types?.length ? tr.types : DEFAULT_EXPENSE_TYPES);
        setTypeRecords(tr.records || tr.custom || []);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const accOf = (id) => accounts.find((x) => String(x._id || x.id) === String(id));
  const accName = (id) => {
    const a = accOf(id);
    return a?.name || a?.accountName || a?.bankName || "";
  };
  const accKind = (id, fallback) => {
    const a = accOf(id);
    return a?.type || a?.accountType || fallback || "";
  };
  const accLabel = (a) => {
    if (!a) return "";
    const name = a.name || a.accountName || a.bankName || L.account;
    const kind = a.type || a.accountType || "";
    return `${name}${kind ? ` · ${kind}` : ""} · ${formatPKR(liveBalance(a))}`;
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (expenses || []).filter((e) => {
      if (!inDateFilter(e.date, dateFilter, customFrom, customTo, e.createdAt)) return false;
      if (typeFilter !== "all" && e.type !== typeFilter) return false;
      if (accountFilter !== "all" && String(e.accountId || "") !== String(accountFilter)) return false;
      if (!q) return true;
      return (e.type || "").toLowerCase().includes(q)
        || (e.note || "").toLowerCase().includes(q)
        || (e.partyName || "").toLowerCase().includes(q)
        || (e.invoice || "").toLowerCase().includes(q)
        || (e.accountName || "").toLowerCase().includes(q)
        || accName(e.accountId).toLowerCase().includes(q);
    });
  }, [expenses, dateFilter, customFrom, customTo, typeFilter, accountFilter, search, accounts]);

  const totals = useMemo(() => {
    let total = 0;
    filtered.forEach((e) => { total += Number(e.amount) || 0; });
    return { total };
  }, [filtered]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY, date: todayStr(), type: types[0] || "Misc", accountId: accounts[0]?._id || accounts[0]?.id || "" });
    setShowForm(true);
  };
  const openEdit = (e) => {
    setEditing(e);
    setForm({
      date: e.date || todayStr(),
      type: e.type || "Misc",
      amount: String(e.amount || ""),
      note: e.note || "",
      accountId: e.accountId || "",
    });
    setShowForm(true);
  };

  const save = async () => {
    const type = (form.type || "").trim();
    const amount = Number(form.amount);
    if (!type) { alert(L.needType); return; }
    if (!amount || amount <= 0) { alert(L.needAmt); return; }
    if (!form.accountId) { alert(L.needAccount); return; }
    setSaving(true);
    const payload = {
      date: form.date || todayStr(),
      type,
      amount,
      note: form.note || "",
      payMode: "paid",
      accountId: form.accountId,
      accountName: accName(form.accountId),
      partyName: "",
      partyType: "",
    };
    try {
      if (editing) {
        await reverseExpenseFinance(editing);
        const r = await expenseApi.update(editing._id, payload);
        if (!r.success) { alert(r.message || "Error"); setSaving(false); return; }
        await applyExpenseFinance(r.expense);
      } else {
        const r = await expenseApi.add(payload);
        if (!r.success) { alert(r.message || "Error"); setSaving(false); return; }
        await applyExpenseFinance(r.expense);
      }
      await load();
      // Reload data in parent App component for Dashboard
      if (reloadExpensesInApp) await reloadExpensesInApp();
      if (reloadPartiesInApp) await reloadPartiesInApp();
      setShowForm(false);
    } catch (e) {
      alert(e.message || "Error");
      await load();
    }
    setSaving(false);
  };

  const del = async (e) => {
    if (!window.confirm(L.del)) return;
    await reverseExpenseFinance(e);
    const r = await expenseApi.remove(e._id);
    if (r.success) {
      await load();
      // Reload data in parent App component for Dashboard
      if (reloadExpensesInApp) await reloadExpensesInApp();
      if (reloadPartiesInApp) await reloadPartiesInApp();
    }
    else alert(r.message || "Error");
  };

  const recordOf = (name) => (typeRecords || []).find((c) => String(c.name || c) === String(name));

  const addType = async (preset) => {
    const name = String(preset !== undefined ? preset : (window.prompt(L.typeName) || "")).trim();
    if (!name) return;
    const r = await expenseApi.addType(name);
    if (r.success) {
      setNewType("");
      await load();
      setForm((p) => ({ ...p, type: name }));
    }
    else alert(r.message || "Error");
  };
  const editType = async (t) => {
    const rec = (typeof t === "object" && t) ? t : (recordOf(t) || { _id: t, name: String(t || "") });
    if (!rec.name) return;
    const name = String(window.prompt(L.editType, rec.name || "") || "").trim();
    if (!name || name === rec.name) return;
    const r = await expenseApi.updateType(rec._id || rec.name, name);
    if (r.success) {
      await load();
      if (form.type === rec.name) setForm((p) => ({ ...p, type: name }));
    }
    else alert(r.message || "Error");
  };
  const delType = async (t) => {
    const rec = (typeof t === "object" && t) ? t : (recordOf(t) || { _id: t, name: String(t || "") });
    if (!rec.name) return;
    if (!window.confirm(L.delType)) return;
    const r = await expenseApi.removeType(rec._id || rec.name);
    if (r.success) {
      await load();
      if (form.type === rec.name) setForm((p) => ({ ...p, type: "" }));
    }
    else alert(r.message || "Error");
  };

  const usedTypes = useMemo(() => {
    const set = new Set(expenses.map((e) => e.type).filter(Boolean));
    return ["all", ...types.filter((t) => set.has(t) || t === typeFilter)];
  }, [expenses, types, typeFilter]);

  if (loading) {
    return <div style={{ textAlign: "center", padding: 60, color: th.textDim }}>⏳ {L.loading}</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", padding: "12px 14px", borderRadius: 14, border: `1px solid ${th.border}`, background: th.bgCard }}>
        <DateFilterBar
          filter={dateFilter === "all" ? "" : dateFilter}
          setFilter={setDateFilter}
          customFrom={customFrom}
          setCustomFrom={setCustomFrom}
          customTo={customTo}
          setCustomTo={setCustomTo}
          extra={
            <button
              type="button"
              onClick={() => setDateFilter("all")}
              style={{
                padding: "7px 12px", borderRadius: 10, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 12,
                background: dateFilter === "all" ? "linear-gradient(135deg,#1abc9c,#2980b9)" : th.thHead,
                color: dateFilter === "all" ? "#fff" : th.textMuted,
              }}
            >{L.all}</button>
          }
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <StatCard label={L.total} value={formatPKR(totals.total)} icon={ICONS.coins} color="#0f766e" sub={`${filtered.length} ${isUrdu ? "اندراجات" : "entries"}`} />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <div>
          <h3 style={{ color: th.text, fontWeight: 700, margin: 0, fontSize: 16 }}>{L.title}</h3>
          <p style={{ color: th.textMuted, fontSize: 12, margin: "4px 0 0" }}>{filtered.length} {isUrdu ? "ریکارڈ" : "records"}</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setShowTypes(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 12, border: `1px solid ${th.border}`, cursor: "pointer", background: th.bgCard, color: th.text, fontWeight: 700, fontSize: 14 }}
          >
            {L.types}
          </button>
          <button
            type="button"
            onClick={openAdd}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 12, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#1abc9c,#2980b9)", color: "white", fontWeight: 600, fontSize: 14 }}
          >
            <Icon path={ICONS.plus} size={15} /> {L.add}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {usedTypes.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            style={{
              padding: "6px 11px", borderRadius: 20, cursor: "pointer", fontWeight: 700, fontSize: 12,
              border: typeFilter === t ? "none" : `1px solid ${th.border}`,
              background: typeFilter === t ? "#0f766e" : "transparent",
              color: typeFilter === t ? "#fff" : th.textMuted,
            }}
          >{t === "all" ? L.all : t}</button>
        ))}
        {accounts.length > 0 && (
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            style={{ ...inpS, width: "auto", maxWidth: 240, padding: "6px 10px", fontSize: 12, fontWeight: 700 }}
          >
            <option value="all">{L.allAccounts}</option>
            {accounts.map((a) => (
              <option key={a._id || a.id} value={a._id || a.id} style={{ background: th.bgModal }}>
                {a.name || a.accountName || a.bankName}
              </option>
            ))}
          </select>
        )}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={L.search}
          style={{ ...inpS, maxWidth: 220, padding: "7px 12px" }}
        />
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: th.textDim, border: `1px dashed ${th.border}`, borderRadius: 16 }}>{L.none}</div>
      ) : (
        <Table
          compact
          cols={[L.date, L.type, L.amount, L.account, L.note]}
          rows={filtered.map((e) => {
            return {
              data: e,
              cells: [
                <span style={{ whiteSpace: "nowrap", fontSize: 13 }}>{e.date || "—"}</span>,
                <span style={{ fontWeight: 700 }}>{e.type}</span>,
                <span style={{ fontWeight: 800, color: "#0f766e", whiteSpace: "nowrap" }}>{formatPKR(e.amount)}</span>,
                <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                  <span style={{ fontWeight: 700, color: th.text }}>{e.accountName || accName(e.accountId) || "—"}</span>
                  <span style={{ fontSize: 11, color: th.textMuted, textTransform: "capitalize" }}>{accKind(e.accountId) || "—"}</span>
                </span>,
                <span style={{ color: th.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180, display: "block" }}>{e.note || "—"}</span>,
              ],
            };
          })}
          onEdit={openEdit}
          onDelete={del}
        />
      )}

      {showForm && (
        <Modal title={editing ? (isUrdu ? "اخراج ترمیم" : "Edit expense") : L.add} onClose={() => setShowForm(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <FInput label={L.date} type="date" value={form.date} onChange={(v) => setForm((p) => ({ ...p, date: v }))} required />
            <div>
              <label style={{ color: th.textMuted, fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6 }}>{L.type} <span style={{ color: "#f87171" }}>*</span></label>
              <div style={{ display: "flex", gap: 4 }}>
                <select value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))} style={{ ...inpS, flex: 1 }}>
                  <option value="">— {L.pickType} —</option>
                  {types.map((t) => <option key={t} value={t} style={{ background: th.bgModal }}>{t}</option>)}
                </select>
                <button type="button" title={L.addType} onClick={() => addType()} style={{ width: 36, flexShrink: 0, border: "none", borderRadius: 8, cursor: "pointer", background: "#2563eb", color: "#fff", fontWeight: 800, fontSize: 16 }}>+</button>
                <button type="button" title={L.editType} onClick={() => editType(form.type)} disabled={!form.type} style={{ width: 36, flexShrink: 0, border: "none", borderRadius: 8, cursor: form.type ? "pointer" : "not-allowed", background: form.type ? "#d97706" : "#94a3b8", color: "#fff", fontWeight: 800, fontSize: 14 }}>✎</button>
                <button type="button" title={isUrdu ? "حذف" : "Delete"} onClick={() => delType(form.type)} disabled={!form.type} style={{ width: 36, flexShrink: 0, border: "none", borderRadius: 8, cursor: form.type ? "pointer" : "not-allowed", background: form.type ? "#dc2626" : "#94a3b8", color: "#fff", fontWeight: 800, fontSize: 16 }}>−</button>
              </div>
            </div>
            <FInput label={L.amount} value={form.amount} onChange={(v) => setForm((p) => ({ ...p, amount: v.replace(/[^0-9.]/g, "") }))} required placeholder="0" />
            <div>
              <label style={{ color: th.textMuted, fontSize: 11, fontWeight: 700, display: "block", marginBottom: 6 }}>{L.fromAccount} <span style={{ color: "#f87171" }}>*</span></label>
              <select value={form.accountId} onChange={(e) => setForm((p) => ({ ...p, accountId: e.target.value }))} style={inpS}>
                <option value="">— {L.account} —</option>
                <AccountOptGroups accounts={accounts} th={th} isUrdu={isUrdu} />
              </select>
              {accounts.length === 0 && (
                <p style={{ color: "#d97706", fontSize: 12, margin: "6px 0 0" }}>
                  {isUrdu ? "پہلے بینک اور والٹ میں کیش / بینک بنائیں" : "Add a cash or bank in Banks and Wallet first"}
                </p>
              )}
            </div>
            <FInput label={L.note} value={form.note} onChange={(v) => setForm((p) => ({ ...p, note: v }))} placeholder="..." />
            <SaveBtn onClick={save} loading={saving} label={saving ? "..." : L.save} />
          </div>
        </Modal>
      )}

      {showTypes && (
        <Modal title={L.types} onClose={() => setShowTypes(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={newType} onChange={(e) => setNewType(e.target.value)} placeholder={L.typeName} style={inpS} onKeyDown={(e) => { if (e.key === "Enter") addType(newType); }} />
              <button type="button" onClick={() => addType(newType)} style={{ padding: "10px 14px", borderRadius: 10, border: "none", cursor: "pointer", background: "#0f766e", color: "#fff", fontWeight: 800, whiteSpace: "nowrap" }}>{L.addType}</button>
            </div>
            {types.map((t) => {
              const rec = recordOf(t);
              return (
                <div key={t} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${th.border}`, gap: 8 }}>
                  <span style={{ fontWeight: 700, color: th.text }}>{t}</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button type="button" onClick={() => editType(rec || t)} style={{ border: "none", background: "transparent", color: "#d97706", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>{isUrdu ? "ترمیم" : "Edit"}</button>
                    <button type="button" onClick={() => delType(rec || t)} style={{ border: "none", background: "transparent", color: "#f87171", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>{isUrdu ? "حذف" : "Delete"}</button>
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
