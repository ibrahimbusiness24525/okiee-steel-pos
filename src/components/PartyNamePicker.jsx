import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { Icon, ICONS, useTypeaheadNav } from "./shared";
import { ledgerApi, signedOpeningBalance } from "../utils/ledgerStore";
import { ensureParty } from "../utils/tradeFinance";

function uniqNames(lists) {
  const map = new Map();
  lists.flat().forEach((n) => {
    const t = String(n || "").trim();
    if (!t || t === "—" || t === "-") return;
    const key = t.toLowerCase();
    if (!map.has(key)) map.set(key, t);
  });
  return [...map.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

export default function PartyNamePicker({
  type = "customer",
  value = "",
  onChange,
  extraNames = [],
  isUrdu,
  placeholder,
  inputStyle,
}) {
  const th = useTheme();
  const [saved, setSaved] = useState([]);
  const [adding, setAdding] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newOpening, setNewOpening] = useState("");
  const [newOpeningKind, setNewOpeningKind] = useState(type === "supplier" ? "dena" : "lana");
  const [createErr, setCreateErr] = useState("");

  useEffect(() => {
    let live = true;
    ledgerApi.list(type).then((r) => {
      if (!live) return;
      setSaved((r.parties || []).map((p) => p.name).filter(Boolean));
    }).catch(() => {});
    return () => { live = false; };
  }, [type]);

  const names = useMemo(() => uniqNames([saved, extraNames]), [saved, extraNames]);
  const q = (value || "").trim();
  const qLow = q.toLowerCase();
  const matches = qLow ? names.filter((n) => n.toLowerCase().includes(qLow)) : names;
  const exact = names.some((n) => n.toLowerCase() === qLow);
  const items = useMemo(() => {
    const list = matches.map((name) => ({ kind: "pick", name }));
    if (q && !exact) list.push({ kind: "add", name: q });
    return list;
  }, [matches, q, exact]);

  const roleTitle = type === "supplier"
    ? (isUrdu ? "سپلائر" : "Supplier")
    : (isUrdu ? "گاہک" : "Customer");
  const role = roleTitle.toLowerCase();

  const finishCreate = (name) => {
    onChange(name);
    setSaved((prev) => uniqNames([prev, [name]]));
    setShowCreate(false);
    setOpen(false);
    setNewName("");
    setNewPhone("");
    setNewOpening("");
    setNewOpeningKind(type === "supplier" ? "dena" : "lana");
    setCreateErr("");
  };

  const pick = async (item) => {
    if (!item) return;
    if (item.kind === "add") {
      setAdding(true);
      try {
        await ensureParty(type, item.name);
        setSaved((prev) => uniqNames([prev, [item.name]]));
      } catch { /* name still usable on the form */ }
      setAdding(false);
    }
    onChange(item.name);
    setOpen(false);
  };

  const openCreate = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setOpen(false);
    setCreateErr("");
    setNewName(q);
    setNewPhone("");
    setNewOpening("");
    setNewOpeningKind(type === "supplier" ? "dena" : "lana");
    setShowCreate(true);
  };

  const saveCreate = async () => {
    const name = (newName || "").trim();
    if (!name) {
      setCreateErr(isUrdu ? "نام ضروری ہے" : "Name is required");
      return;
    }
    const exists = names.find((n) => n.toLowerCase() === name.toLowerCase());
    if (exists) {
      finishCreate(exists);
      return;
    }
    setAdding(true);
    setCreateErr("");
    try {
      const r = await ledgerApi.add({
        type,
        name,
        phone: (newPhone || "").trim() || "-",
        openingBalance: signedOpeningBalance(type, newOpening, newOpeningKind),
      });
      if (r?.success === false) {
        setCreateErr(r.message || (isUrdu ? "شامل نہیں ہو سکا" : "Could not add"));
        setAdding(false);
        return;
      }
      finishCreate(name);
    } catch (err) {
      setCreateErr(err.message || (isUrdu ? "شامل نہیں ہو سکا" : "Could not add"));
    }
    setAdding(false);
  };

  const { open, setOpen, hi, setHi, onKeyDown: navKeys, listRef } = useTypeaheadNav(items, pick);

  const ph = placeholder || (type === "supplier"
    ? (isUrdu ? "سپلائر منتخب کریں..." : "Select supplier...")
    : (isUrdu ? "گاہک منتخب کریں..." : "Select customer..."));

  const inpS = inputStyle || {
    background: th.input, border: `1px solid ${th.inputBorder}`, color: th.text,
    borderRadius: 10, padding: "9px 12px", fontSize: 14, outline: "none",
    width: "100%", boxSizing: "border-box",
  };
  const smallInp = { ...inpS, padding: "8px 10px" };

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
          <input
            type="text"
            value={value}
            data-suggest-open={open ? "1" : "0"}
            onChange={(e) => { onChange(e.target.value); setShowCreate(false); setOpen(true); setHi(0); }}
            onFocus={() => { if (!showCreate) { setOpen(true); setHi(0); } }}
            onKeyDown={navKeys}
            placeholder={ph}
            style={inpS}
            autoComplete="off"
          />
          {open && !showCreate && (
            <>
              <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 998 }} onMouseDown={() => setOpen(false)} />
              <div
                ref={listRef}
                style={{
                  position: "absolute", top: "100%", left: 0, right: 0, zIndex: 999,
                  background: th.bgModal || th.bgCard, border: `1px solid ${th.border}`,
                  borderRadius: 10, maxHeight: 220, overflowY: "auto",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.18)", marginTop: 4,
                }}
              >
                <div
                  onMouseDown={(e) => { e.preventDefault(); openCreate(e); }}
                  style={{
                    padding: "9px 13px", cursor: "pointer",
                    borderBottom: `1px solid ${th.border}`,
                    display: "flex", alignItems: "center", gap: 8,
                    fontSize: 13, fontWeight: 800, color: "#1abc9c",
                    background: "rgba(26,188,156,0.08)",
                  }}
                >
                  <span style={{
                    width: 22, height: 22, borderRadius: 7, flexShrink: 0,
                    background: "linear-gradient(135deg,#1abc9c,#2980b9)",
                    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Icon path={ICONS.plus} size={12} />
                  </span>
                  {isUrdu ? `نیا ${roleTitle} بنائیں` : `Create new ${roleTitle.toLowerCase()}`}
                </div>
                {items.length === 0 && (
                  <div style={{ padding: "12px", textAlign: "center", color: th.textDim, fontSize: 13 }}>
                    {isUrdu ? "ابھی کوئی نام نہیں — + دبائیں" : "No names yet — tap + to create"}
                  </div>
                )}
                {items.map((item, i) => (
                  <div
                    key={`${item.kind}-${item.name}`}
                    data-nav-i={i}
                    onMouseDown={(e) => { e.preventDefault(); pick(item); }}
                    onMouseEnter={() => setHi(i)}
                    style={{
                      padding: "9px 13px", cursor: adding ? "wait" : "pointer",
                      borderBottom: `1px solid ${th.border}`,
                      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                      fontSize: 14, color: item.kind === "add" ? "#1abc9c" : th.text,
                      background: i === hi ? "rgba(26,188,156,0.16)" : "transparent",
                      fontWeight: item.kind === "add" ? 700 : 600,
                    }}
                  >
                    {item.kind === "add" ? (
                      <>
                        <span>+ {isUrdu ? `نیا ${role} شامل کریں` : `Add`}: “{item.name}”</span>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 20, background: "rgba(26,188,156,0.18)", color: "#1abc9c", fontWeight: 700, flexShrink: 0 }}>
                          {adding ? "..." : (isUrdu ? "شامل" : "Add")}
                        </span>
                      </>
                    ) : (
                      <span>{item.name}</span>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          title={isUrdu ? `نیا ${roleTitle} بنائیں` : `Create ${roleTitle.toLowerCase()}`}
          onClick={openCreate}
          style={{
            width: 42, minWidth: 42, borderRadius: 10, border: "none", cursor: "pointer",
            background: showCreate ? "linear-gradient(135deg,#0e9f85,#1f6fa3)" : "linear-gradient(135deg,#1abc9c,#2980b9)",
            color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Icon path={ICONS.plus} size={18} />
        </button>
      </div>

      {showCreate && (
        <div style={{
          marginTop: 8, padding: 12, borderRadius: 12,
          border: "1px solid rgba(26,188,156,0.35)",
          background: "rgba(26,188,156,0.06)",
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "#1abc9c", fontWeight: 800, fontSize: 13 }}>
              + {isUrdu ? `نیا ${roleTitle}` : `New ${roleTitle}`}
            </span>
            <button
              type="button"
              onClick={() => { setShowCreate(false); setCreateErr(""); }}
              style={{ background: "none", border: "none", color: th.textMuted, cursor: "pointer", fontWeight: 700, fontSize: 14 }}
            >✕</button>
          </div>
          <div>
            <label style={{ color: th.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
              {isUrdu ? "نام" : "Name"} <span style={{ color: "#f87171" }}>*</span>
            </label>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={type === "supplier" ? (isUrdu ? "مثلاً احمد سٹیل" : "e.g. Ahmed Steel") : (isUrdu ? "مثلاً ملک ٹریڈرز" : "e.g. Malik Traders")}
              style={smallInp}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveCreate(); } }}
            />
          </div>
          <div>
            <label style={{ color: th.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
              {isUrdu ? "نمبر" : "Phone"}
            </label>
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="03xx-xxxxxxx"
              style={smallInp}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveCreate(); } }}
            />
          </div>
          <div>
            <label style={{ color: th.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
              {isUrdu ? "اوپننگ بیلنس" : "Opening balance"}
            </label>
            <input
              value={newOpening}
              onChange={(e) => setNewOpening(e.target.value.replace(/[^0-9.]/g, ""))}
              placeholder="0"
              inputMode="decimal"
              style={smallInp}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveCreate(); } }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {[
                { id: "lana", label: isUrdu ? "میں نے لینا ہے" : "Maine lana hain", color: "#16a34a" },
                { id: "dena", label: isUrdu ? "میں نے دینا ہے" : "Maine dena hain", color: "#dc2626" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setNewOpeningKind(opt.id)}
                  style={{
                    flex: 1, padding: "9px 8px", borderRadius: 10, cursor: "pointer", fontWeight: 800, fontSize: 12,
                    border: newOpeningKind === opt.id ? "none" : `1px solid ${th.border}`,
                    background: newOpeningKind === opt.id ? opt.color : th.bgCard,
                    color: newOpeningKind === opt.id ? "#fff" : th.textMuted,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {createErr && <div style={{ color: "#f87171", fontSize: 12, fontWeight: 600 }}>{createErr}</div>}
          <button
            type="button"
            onClick={saveCreate}
            disabled={adding || !(newName || "").trim()}
            style={{
              padding: "9px 12px", borderRadius: 10, border: "none",
              cursor: adding || !(newName || "").trim() ? "not-allowed" : "pointer",
              background: adding || !(newName || "").trim() ? "rgba(26,188,156,0.35)" : "linear-gradient(135deg,#1abc9c,#2980b9)",
              color: "#fff", fontWeight: 800, fontSize: 13,
            }}
          >
            {adding ? "..." : (isUrdu ? "محفوظ کریں اور منتخب کریں" : "Save & select")}
          </button>
        </div>
      )}
    </div>
  );
}
