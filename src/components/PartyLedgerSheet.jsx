import { loadShopProfile, parseYmd, sortLedgerEntries, todayStr } from "../utils/helpers";
import { openingKindOf } from "../utils/ledgerStore";

function money(n) {
  return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function dmy(ymd) {
  const s = parseYmd(ymd) || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || "—";
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
}

function accNo(id) {
  const raw = String(id || "").replace(/[^a-zA-Z0-9]/g, "");
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 6) return digits.slice(-7);
  return (raw.slice(-7) || "000000").toUpperCase();
}

function entrySides(partyType, e) {
  const amt = Math.round((Number(e.amount) || 0) * 100) / 100;
  const kind = e.kind;
  if (partyType === "customer") {
    if (kind === "take" || kind === "cash_in") return { debit: 0, credit: amt };
    return { debit: amt, credit: 0 };
  }
  if (kind === "give" || kind === "cash_out") return { debit: amt, credit: 0 };
  return { debit: 0, credit: amt };
}

function sourceOf(e, partyType, isUrdu) {
  const inv = String(e.invoice || "").trim();
  if (inv) return partyType === "customer" ? `AR Inv - ${inv}` : `AP Inv - ${inv}`;
  if (e.kind === "take") return isUrdu ? "میں نے لیے" : "Maine Liye";
  if (e.kind === "give") return isUrdu ? "میں نے دیے" : "Maine Diye";
  if (e.kind === "credit") return partyType === "customer" ? (isUrdu ? "فروخت" : "Sale") : (isUrdu ? "خریداری" : "Purchase");
  return e.kind || "—";
}

function descOf(e, partyType, isUrdu) {
  if (e.note) return e.note;
  if (e.accountName) return e.accountName;
  if (e.kind === "credit") return partyType === "customer" ? (isUrdu ? "فروخت" : "Sale") : (isUrdu ? "خریداری" : "Purchase");
  if (e.kind === "take") return isUrdu ? "میں نے لیے" : "Maine Liye";
  if (e.kind === "give") return isUrdu ? "میں نے دیے" : "Maine Diye";
  return "—";
}

export function buildPartyLedger({ party, entries = [], from = "", to = "", isUrdu }) {
  const type = party?.type === "supplier" ? "supplier" : "customer";
  const opening = Math.round((Number(party?.openingBalance ?? party?.opening) || 0) * 100) / 100;
  const chrono = sortLedgerEntries(entries).slice().reverse().filter((e) => {
    const d = parseYmd(e.date) || parseYmd(e.createdAt);
    if (from && d && d < from) return false;
    if (to && d && d > to) return false;
    return true;
  });

  let running = 0;
  const rows = [];
  const absOpen = Math.abs(opening);
  if (absOpen > 0.0001) {
    const kind = openingKindOf(type, opening);
    let debit = 0;
    let credit = 0;
    if (type === "customer") {
      if (opening > 0) debit = absOpen;
      else credit = absOpen;
    } else if (opening > 0) credit = absOpen;
    else debit = absOpen;
    if (type === "customer") running += debit - credit;
    else running += credit - debit;
    rows.push({
      date: parseYmd(party?.createdAt) || parseYmd(party?.date) || todayStr(),
      source: isUrdu ? "اوپننگ بیلنس" : "Opening Balance",
      description: kind === "lana"
        ? (isUrdu ? "میں نے لینا ہے" : "Maine lana hain")
        : (isUrdu ? "میں نے دینا ہے" : "Maine dena hain"),
      debit,
      credit,
      balance: running,
    });
  }
  chrono.forEach((e) => {
    const { debit, credit } = entrySides(type, e);
    if (type === "customer") running += debit - credit;
    else running += credit - debit;
    rows.push({
      date: parseYmd(e.date) || parseYmd(e.createdAt) || e.date || "—",
      source: sourceOf(e, type, isUrdu),
      description: descOf(e, type, isUrdu),
      debit,
      credit,
      balance: running,
    });
  });

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const dates = chrono.map((e) => parseYmd(e.date) || parseYmd(e.createdAt)).filter(Boolean);
  return {
    opening,
    rows,
    totalDebit,
    totalCredit,
    closing: running,
    from: from || dates[0] || todayStr(),
    to: to || dates[dates.length - 1] || todayStr(),
    accNo: accNo(party?._id),
  };
}

export default function PartyLedgerSheet({ party, entries = [], from = "", to = "", isUrdu, compact }) {
  const shop = loadShopProfile();
  const data = buildPartyLedger({ party, entries, from, to, isUrdu });
  const phones = (shop.owners || []).map((o) => o.phone).filter(Boolean).join(" / ");
  const asOn = dmy(todayStr());
  const fs = compact ? 11 : 13;
  const nameFs = compact ? 16 : 22;
  const th = { textAlign: "left", fontWeight: 800, fontSize: compact ? 10 : 12, borderBottom: "1px solid #000", borderTop: "1px solid #000", padding: compact ? "3px 2px" : "5px 6px" };
  const td = { fontSize: compact ? 10 : 12, padding: compact ? "3px 2px" : "5px 6px", borderBottom: "1px solid #333", verticalAlign: "top" };
  const num = { ...td, textAlign: "right", whiteSpace: "nowrap" };

  return (
    <div
      id="thermal-invoice"
      style={{
        width: compact ? "3in" : "190mm",
        maxWidth: compact ? "3in" : "190mm",
        color: "#000",
        background: "#fff",
        fontFamily: "Arial, Helvetica, sans-serif",
        padding: compact ? 4 : 8,
        boxSizing: "border-box",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontWeight: 800, fontSize: nameFs, letterSpacing: 0.3 }}>{shop.shopName || "STEELPOS"}</div>
        {shop.address ? <div style={{ fontSize: fs, marginTop: 2 }}>Address: {shop.address}</div> : null}
        {phones ? <div style={{ fontSize: fs }}>Ph: {phones}</div> : null}
      </div>
      <div style={{ borderTop: "1px solid #000", margin: compact ? "6px 0 4px" : "10px 0 8px" }} />
      <div style={{ fontWeight: 800, fontSize: fs }}>
        {isUrdu ? "کھاتہ بتاریخ" : "Account Ledger as on"} : {asOn}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6, fontSize: fs }}>
        <div>
          <div>Acc No: {data.accNo}</div>
          <div style={{ fontWeight: 800 }}>{isUrdu ? "نام" : "Name"}: {(party?.name || "").toUpperCase()}</div>
          {party?.phone ? <div>{isUrdu ? "نمبر" : "Ph"}: {party.phone}</div> : null}
          {party?.address ? <div>{isUrdu ? "پتہ" : "Address"}: {party.address}</div> : null}
        </div>
        <div style={{ textAlign: "right" }}>
          <div>From: {data.from}</div>
          <div>To: {data.to}</div>
        </div>
      </div>
      <div style={{ textAlign: "right", fontWeight: 800, fontSize: fs, margin: "8px 0 4px" }}>
        Opening Balance : {money(data.opening)}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={th}>#</th>
            <th style={th}>{isUrdu ? "تاریخ" : "Date"}</th>
            <th style={th}>{isUrdu ? "حوالہ" : "Source"}</th>
            <th style={th}>{isUrdu ? "تفصیل" : "Description"}</th>
            <th style={{ ...th, textAlign: "right" }}>{isUrdu ? "میں نے دیے" : "Maine Diye"}</th>
            <th style={{ ...th, textAlign: "right" }}>{isUrdu ? "میں نے لیے" : "Maine Liye"}</th>
            <th style={{ ...th, textAlign: "right" }}>{isUrdu ? "بیلنس" : "Balance"}</th>
          </tr>
        </thead>
        <tbody>
          {rowsOrEmpty(data, isUrdu).map((r, i) => (
            <tr key={i}>
              <td style={td}>{i + 1}</td>
              <td style={{ ...td, whiteSpace: "nowrap" }}>{r.date}</td>
              <td style={td}>{r.source}</td>
              <td style={td}>{r.description}</td>
              <td style={num}>{money(r.debit)}</td>
              <td style={num}>{money(r.credit)}</td>
              <td style={num}>{money(r.balance)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={{ ...td, borderBottom: "2px solid #000", fontWeight: 800 }} colSpan={4}>{isUrdu ? "کل" : "Total:"}</td>
            <td style={{ ...num, borderBottom: "2px solid #000", fontWeight: 800 }}>{money(data.totalDebit)}</td>
            <td style={{ ...num, borderBottom: "2px solid #000", fontWeight: 800 }}>{money(data.totalCredit)}</td>
            <td style={{ ...num, borderBottom: "2px solid #000", fontWeight: 800 }}>{money(data.closing)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function rowsOrEmpty(data, isUrdu) {
  if (data.rows.length) return data.rows;
  return [{
    date: "—",
    source: "—",
    description: isUrdu ? "اس مدت میں اندراج نہیں" : "No entries in this period",
    debit: 0,
    credit: 0,
    balance: data.opening,
  }];
}
