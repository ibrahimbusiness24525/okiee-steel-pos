import { useState, useEffect } from "react";
import { useTheme } from "../context/ThemeContext";
import { api } from "../utils/api";
import { formatPKR } from "../utils/helpers";
import { liveBalance } from "../utils/tradeFinance";

export function accId(a) {
  return a?._id || a?.id || "";
}

export function accLabel(a) {
  if (!a) return "";
  const name = a.name || a.accountName || "";
  const bank = a.bankName || "";
  const type = a.type || a.accountType || "cash";
  if (type === "bank") return bank && bank !== name ? `${name} · ${bank}` : (name || bank || "Bank");
  if (type === "wallet") return bank ? `${name || bank}` : (name || "Wallet");
  return name || "Cash";
}

export function derivePayment(total, form, accounts) {
  const t = Number(total) || 0;
  const settlement = form?.settlement || "full";
  const acc = (accounts || []).find((a) => accId(a) === (form?.accountId || ""));
  const type = acc?.type || acc?.accountType || "cash";
  let paid = 0;
  let remaining = 0;
  if (settlement === "credit") {
    paid = 0;
    remaining = t;
  } else if (settlement === "partial") {
    paid = Number(form?.paidAmount) || 0;
    remaining = Math.max(0, t - paid);
  } else {
    paid = t;
    remaining = 0;
  }

  let paymentMethod = "cash";
  if (settlement === "credit") paymentMethod = "credit";
  else if (type === "bank") paymentMethod = "bank";
  else if (type === "wallet") paymentMethod = "wallet";

  const bankName = acc ? (acc.bankName || acc.name || acc.accountName || "") : "";
  const accountName = acc ? accLabel(acc) : "";
  const paidError = settlement === "partial" && paid > t;

  return {
    settlement,
    isPartial: settlement === "partial" || settlement === "credit",
    paidAmount: paid,
    remainingAmount: remaining,
    accountId: form?.accountId || "",
    accountName,
    paymentMethod,
    bankName,
    paidError,
  };
}

export function isPayValid(total, form, accounts) {
  const t = Number(total) || 0;
  if (t <= 0) return true;
  const d = derivePayment(t, form, accounts);
  if (d.settlement === "credit") return true;
  if (d.paidError) return false;
  if (d.settlement === "partial") {
    if (d.paidAmount <= 0 || d.paidAmount >= t) return false;
  }
  if ((accounts || []).length > 0 && !d.accountId) return false;
  return true;
}

export function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    api.getAccounts()
      .then((r) => { if (r?.success) setAccounts(r.accounts || []); })
      .catch(() => {});
  }, []);
  return accounts;
}

export default function PaymentTerms({
  total,
  form,
  setForm,
  accounts = [],
  isUrdu,
  partyKind = "customer",
}) {
  const th = useTheme();
  const t = Number(total) || 0;
  const settlement = form?.settlement || "full";
  const derived = derivePayment(t, form, accounts);
  const needsAccount = settlement !== "credit";
  const dueLabel = partyKind === "supplier"
    ? (isUrdu ? "قابل ادائیگی (Payable)" : "Payable to supplier")
    : (isUrdu ? "قابل وصول (Receivable)" : "Receivable from customer");

  const inpS = {
    background: th.input, border: `1px solid ${th.inputBorder}`, color: th.text,
    borderRadius: 10, padding: "9px 12px", fontSize: 14, outline: "none",
    width: "100%", boxSizing: "border-box",
  };

  const cash = accounts.filter((a) => (a.type || a.accountType) === "cash");
  const banks = accounts.filter((a) => (a.type || a.accountType) === "bank");
  const wallets = accounts.filter((a) => (a.type || a.accountType) === "wallet");

  const modes = [
    { key: "full", label: isUrdu ? "مکمل ادائیگی" : "Full payment", hint: isUrdu ? "ساری رقم ابھی" : "Pay the full amount now", color: "#34d399" },
    { key: "credit", label: isUrdu ? "مکمل ادھار" : "Full credit", hint: isUrdu ? "سب بعد میں" : "Nothing now — all on ledger", color: "#f87171" },
    { key: "partial", label: isUrdu ? "جزوی" : "Partial", hint: isUrdu ? "کچھ اب، باقی ادھار" : "Pay some now, rest on ledger", color: "#fbbf24" },
  ];

  const pick = (key) => setForm((p) => ({
    ...p,
    settlement: key,
    paidAmount: key === "partial" ? p.paidAmount : "",
    accountId: key === "credit" ? "" : p.accountId,
  }));

  const quick = [
    { label: isUrdu ? "آدھا" : "Half", value: Math.floor(t / 2) },
    { label: isUrdu ? "چوتھائی" : "1/4", value: Math.floor(t / 4) },
    { label: "500", value: 500 },
    { label: "1000", value: 1000 },
    { label: "2000", value: 2000 },
    { label: "5000", value: 5000 },
  ].filter((b) => b.value > 0 && b.value < t);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label style={{ color: th.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {isUrdu ? "ادائیگی *" : "Settlement *"}
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        {modes.map((m) => {
          const on = settlement === m.key;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => pick(m.key)}
              style={{
                padding: "10px 8px", borderRadius: 12, cursor: "pointer",
                border: `2px solid ${on ? m.color : th.border}`,
                background: on ? `${m.color}1a` : "transparent",
                color: on ? m.color : th.textMuted, fontWeight: 700, fontSize: 12, textAlign: "center",
              }}
            >
              <div>{m.label}</div>
              <div style={{ fontSize: 10, fontWeight: 500, marginTop: 3, opacity: 0.85 }}>{m.hint}</div>
            </button>
          );
        })}
      </div>

      {needsAccount && (
        <div>
          <label style={{ color: th.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5, display: "block" }}>
            {isUrdu ? "رقم کس بینک / والٹ میں؟ *" : "Money in / out of which bank or wallet? *"}
          </label>
          {accounts.length === 0 ? (
            <div style={{ padding: "10px 12px", borderRadius: 10, border: `1px dashed ${th.border}`, color: th.textMuted, fontSize: 12 }}>
              {isUrdu
                ? "پہلے بینک اور والٹ میں کیش یا بینک بنائیں۔ ابھی بغیر پوسٹ کیے محفوظ ہو سکتا ہے۔"
                : "Add a cash, bank or wallet under Banks and Wallet. You can still save now; money will not post until one exists."}
            </div>
          ) : (
            <select
              value={form?.accountId || ""}
              onChange={(e) => setForm((p) => ({ ...p, accountId: e.target.value }))}
              style={{ ...inpS, borderRadius: 12, padding: "11px 14px" }}
            >
              <option value="">{isUrdu ? "-- بینک / والٹ منتخب کریں --" : "-- Select bank or wallet --"}</option>
              {cash.length > 0 && (
                <optgroup label={isUrdu ? "نقد" : "Cash"}>
                  {cash.map((a) => (
                    <option key={accId(a)} value={accId(a)} style={{ background: th.bgModal }}>
                      {accLabel(a)} · {formatPKR(liveBalance(a))}
                    </option>
                  ))}
                </optgroup>
              )}
              {banks.length > 0 && (
                <optgroup label={isUrdu ? "بینک" : "Bank"}>
                  {banks.map((a) => (
                    <option key={accId(a)} value={accId(a)} style={{ background: th.bgModal }}>
                      {accLabel(a)} · {formatPKR(liveBalance(a))}
                    </option>
                  ))}
                </optgroup>
              )}
              {wallets.length > 0 && (
                <optgroup label={isUrdu ? "والٹ" : "Wallet"}>
                  {wallets.map((a) => (
                    <option key={accId(a)} value={accId(a)} style={{ background: th.bgModal }}>
                      {accLabel(a)} · {formatPKR(liveBalance(a))}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          )}
        </div>
      )}

      {settlement === "credit" && t > 0 && (
        <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.06)", color: "#f87171", fontSize: 13, fontWeight: 600 }}>
          {formatPKR(t)} {isUrdu ? "لیجر پر جائے گا —" : "will go to ledger as"} {dueLabel}
        </div>
      )}

      {settlement === "partial" && t > 0 && (
        <div style={{ borderRadius: 12, border: "1px solid rgba(251,191,36,0.4)", background: "rgba(251,191,36,0.05)", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", borderRadius: 8, background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.2)" }}>
            <span style={{ color: th.textMuted, fontSize: 13 }}>{isUrdu ? "کل:" : "Total:"}</span>
            <span style={{ color: "#34d399", fontWeight: 900, fontSize: 16 }}>{formatPKR(t)}</span>
          </div>
          {quick.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {quick.map((btn) => (
                <button
                  key={btn.label}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, paidAmount: String(btn.value) }))}
                  style={{
                    padding: "5px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600,
                    border: "1px solid rgba(251,191,36,0.3)",
                    background: Number(form?.paidAmount) === btn.value ? "rgba(251,191,36,0.25)" : "rgba(251,191,36,0.08)",
                    color: "#fbbf24",
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
          )}
          <div>
            <label style={{ color: "#fbbf24", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4, display: "block", fontWeight: 700 }}>
              {isUrdu ? "ابھی ادا (Rs) *" : "Amount paid now (Rs) *"}
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={form?.paidAmount || ""}
              onChange={(e) => setForm((p) => ({ ...p, paidAmount: e.target.value }))}
              placeholder={isUrdu ? "مثلاً 1500" : "e.g. 1500"}
              style={{ ...inpS, border: derived.paidError ? "2px solid #f87171" : "2px solid rgba(251,191,36,0.5)", fontSize: 16, fontWeight: 700 }}
            />
            {derived.paidError && (
              <div style={{ color: "#f87171", fontSize: 11, marginTop: 4 }}>
                {isUrdu ? "ادا کردہ رقم کل سے زیادہ نہیں ہو سکتی" : "Paid amount cannot exceed total"}
              </div>
            )}
          </div>
          {derived.paidAmount > 0 && !derived.paidError && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderRadius: 10, overflow: "hidden", border: `1px solid ${derived.remainingAmount > 0 ? "rgba(248,113,113,0.3)" : "rgba(52,211,153,0.3)"}` }}>
              <div style={{ padding: "10px 14px" }}>
                <div style={{ color: th.textMuted, fontSize: 11, marginBottom: 3 }}>{isUrdu ? "ادا کردہ" : "Paid now"}</div>
                <div style={{ color: "#34d399", fontWeight: 900, fontSize: 17 }}>{formatPKR(derived.paidAmount)}</div>
              </div>
              <div style={{ padding: "10px 14px" }}>
                <div style={{ color: th.textMuted, fontSize: 11, marginBottom: 3 }}>{dueLabel}</div>
                <div style={{ color: derived.remainingAmount > 0 ? "#f87171" : "#34d399", fontWeight: 900, fontSize: 17 }}>
                  {formatPKR(derived.remainingAmount)}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
