import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { Modal, FInput, SaveBtn, Table, Icon, ICONS, useTypeaheadNav, focusNextField } from "./shared";
import { formatPKR, todayStr, formatWeightKgG } from "../utils/helpers";
import { safeProductName } from "../utils/constants";
import { returnsForSale } from "../utils/returnsStore";
import { invoicePayInfo, liveBalance } from "../utils/tradeFinance";
import { useAccounts, accId, accLabel } from "./PaymentTerms";

export function pidOf(v) {
  if (!v) return "";
  if (typeof v === "object") return String(v._id || v.id || "");
  return String(v);
}

export function qtyUnit(cat, qty, isUrdu) {
  const n = Number(qty) || 0;
  if (cat === "Chader") return formatWeightKgG(n);
  if (cat === "Net") return `${n}${isUrdu ? " فٹ" : " ft"}`;
  return `${n}${isUrdu ? " عدد" : " pcs"}`;
}

export function saleProductLines(sale, products = []) {
  const lines = [];
  const seen = new Set();
  const resolveId = (raw, name) => {
    const id = pidOf(raw);
    if (id) return id;
    const n = String(name || "").toLowerCase().trim();
    if (!n) return "";
    const prod = products.find((p) => String(p.name || "").toLowerCase().trim() === n);
    return pidOf(prod?._id || prod?.id);
  };
  const qtyFromItem = (it) => {
    if (Number(it?.qty) > 0) return Number(it.qty);
    const row = it?.rows?.[0] || {};
    if (Number(row.qty) > 0) return Number(row.qty);
    if (Number(row.quantity) > 0) return Number(row.quantity);
    if (Number(row.weight) > 0) return Number(row.weight);
    if (Number(row.feet) > 0) return Number(row.feet);
    const m = String(row.desc || "").match(/^(\d+\.?\d*)/);
    return m ? parseFloat(m[1]) : 0;
  };
  const push = (productId, qty, extra = {}) => {
    const id = resolveId(productId, extra.productName);
    const q = Number(qty) || 0;
    if (!id || q <= 0 || seen.has(id)) return;
    seen.add(id);
    const prod = products.find((p) => pidOf(p._id) === String(id));
    const item = (sale.items || []).find((it) => pidOf(it.productId || it.product) === String(id))
      || (sale.items || []).find((it) => prod && it.productName === prod.name)
      || (sale.items || []).find((it) => extra.productName && it.productName === extra.productName);
    const row = (item?.rows && item.rows[0]) || {};
    const amount = Number(item?.subtotal) || (pidOf(sale.product) === String(id) ? Number(sale.total) || 0 : 0);
    const rate = Number(row.salePrice) || Number(item?.rate) || (q > 0 && amount ? amount / q : 0) || Number(prod?.price) || Number(sale.rate) || 0;
    lines.push({
      productId: String(id),
      productName: extra.productName || item?.productName || prod?.name || sale.productName || "Item",
      category: extra.category || item?.category || prod?.category || sale.category || "",
      qty: q,
      amount,
      rate,
    });
  };
  if (Array.isArray(sale.saleItems)) {
    sale.saleItems.forEach((si) => push(si.productId || si.product, si.qty, { productName: si.productName, category: si.category }));
  }
  if (Array.isArray(sale.items)) {
    sale.items.forEach((it) => push(it.productId || it.product, qtyFromItem(it), { productName: it.productName, category: it.category }));
  }
  if (!lines.length && sale.product) {
    push(sale.product, sale.qty, { productName: sale.productName || safeProductName(sale.product), category: sale.category });
  }
  return lines;
}

export function returnedQtyMap(returns, matchFn) {
  const map = {};
  (returns || []).forEach((r) => {
    (r.items || []).forEach((it) => {
      const key = matchFn(it, r);
      if (!key) return;
      map[key] = (map[key] || 0) + (Number(it.qty) || 0);
    });
  });
  return map;
}

function alreadyReturnedForSale(sale, returns) {
  const map = {};
  returnsForSale(sale, returns).forEach((r) => {
    (r.items || []).forEach((it) => {
      const q = Number(it.qty) || 0;
      if (q <= 0) return;
      const id = pidOf(it.product);
      const name = String(it.productName || "").toLowerCase().trim();
      if (id) map[id] = (map[id] || 0) + q;
      if (name) map[`n:${name}`] = (map[`n:${name}`] || 0) + q;
    });
  });
  return map;
}

function remainingSaleLines(sale, products, returns) {
  if (!sale) return [];
  const already = alreadyReturnedForSale(sale, returns);
  return saleProductLines(sale, products).map((ln) => {
    const ret = already[ln.productId] || already[`n:${String(ln.productName || "").toLowerCase().trim()}`] || 0;
    const remain = Math.max(0, (Number(ln.qty) || 0) - ret);
    return { ...ln, returned: ret, remain };
  }).filter((ln) => ln.remain > 0);
}

function L(isUrdu) {
  return isUrdu ? {
    saleReturn: "فروخت واپسی", purchaseReturn: "خریداری واپسی",
    pickSale: "انوائس منتخب کریں", pickPurchase: "آئٹم منتخب کریں",
    fromStock: "اسٹاک لسٹ سے", fromInvoice: "انوائس سے",
    pickProduct: "آئٹم منتخب کریں", inStock: "موجودہ اسٹاک",
    search: "انوائس، سپلائر یا نام سے تلاش...",
    searchPh: "انوائس نمبر / سپلائر / نام",
    searchSale: "انوائس، گاہک یا نام سے تلاش...",
    searchSalePh: "انوائس نمبر / گاہک / نام",
    products: "آئٹم",
    view: "دیکھیں",
    stock: "اسٹاک",
    invoiceAmt: "رقم",
    sold: "فروخت", bought: "خریدا", returned: "واپس", remain: "باقی",
    qty: "واپسی مقدار", note: "نوٹ", date: "تاریخ", save: "محفوظ کریں",
    needPick: "پہلے نام، نمبر یا انوائس منتخب کریں", needQty: "واپسی مقدار لکھیں",
    records: "واپسی کے ریکارڈ", none: "ابھی کوئی واپسی نہیں",
    del: "کیا یہ واپسی حذف کریں؟",
    addStock: "اسٹاک میں شامل ہوگا", removeStock: "اسٹاک سے نکلے گا اور سپلائر کو واپس",
    allReturned: "اس انوائس کی ساری مقدار واپس ہو چکی ہے",
    customer: "گاہک", supplier: "سپلائر", invoice: "انوائس",
    samePrice: "اصل قیمت", changePrice: "قیمت تبدیل", perPiece: "فی پیس",
    credit: "ادھار", paid: "ادا شدہ", partial: "جزوی", due: "باقی",
    addAnother: "اور انوائس شامل کریں",
    added: "شامل شدہ", removeInv: "ہٹائیں",
    reversePayable: "سپلائر پے ایبل سے یہ رقم واپس کریں",
    reverseReceivable: "گاہک ریسیویبل سے یہ رقم واپس کریں",
    reverseHintPay: "واپسی کی رقم اس سپلائر کے قابل ادا سے کم ہو گی",
    reverseHintRec: "واپسی کی رقم اس گاہک کے قابل وصول سے کم ہو گی",
    refundFrom: "رقم کس بینک / والٹ سے واپس؟",
    receiveInto: "رقم کس بینک / والٹ میں آئے گی؟",
    refundHint: "ادا شدہ انوائس کی واپسی اسی بینک / والٹ سے نکلے گی",
    receiveHint: "ادا شدہ انوائس کی واپسی اسی بینک / والٹ میں آئے گی",
    pickAccount: "-- بینک / والٹ منتخب کریں --",
    needAccount: "رقم واپس کرنے کے لیے بینک / والٹ منتخب کریں",
    cashGrp: "نقد", bankGrp: "بینک", walletGrp: "والٹ",
  } : {
    saleReturn: "Sale Return", purchaseReturn: "Purchase Return",
    pickSale: "Select sale invoice", pickPurchase: "Select item",
    fromStock: "From stock list", fromInvoice: "From invoice",
    pickProduct: "Select item", inStock: "In stock",
    search: "Search by invoice, supplier or name...",
    searchPh: "Invoice number / supplier / name",
    searchSale: "Search by invoice, customer or name...",
    searchSalePh: "Invoice number / customer / name",
    products: "Items",
    view: "View",
    stock: "Stock",
    invoiceAmt: "Amount",
    sold: "Sold", bought: "Bought", returned: "Returned", remain: "Left",
    qty: "Return qty", note: "Note", date: "Date", save: "Save",
    needPick: "Select a name, number or invoice first", needQty: "Enter a return quantity",
    records: "Return records", none: "No returns yet",
    del: "Delete this return?",
    addStock: "Will add back to stock list", removeStock: "Will remove from stock list and return to supplier",
    allReturned: "All quantity on this invoice is already returned",
    customer: "Customer", supplier: "Supplier", invoice: "Invoice",
    samePrice: "Same price", changePrice: "Change price", perPiece: "Per piece",
    credit: "Credit", paid: "Paid", partial: "Partial", due: "Due",
    addAnother: "Add another invoice",
    added: "Added", removeInv: "Remove",
    reversePayable: "Reverse this amount from supplier payable",
    reverseReceivable: "Reverse this amount from customer receivable",
    reverseHintPay: "The return amount will be deducted from this supplier's payable",
    reverseHintRec: "The return amount will be deducted from this customer's receivable",
    refundFrom: "Refund from bank / wallet",
    receiveInto: "Receive into bank / wallet",
    refundHint: "Paid invoice refund will leave this bank / wallet",
    receiveHint: "Paid invoice refund will come into this bank / wallet",
    pickAccount: "-- Select bank or wallet --",
    needAccount: "Select the bank or wallet the money is coming from / going into",
    cashGrp: "Cash", bankGrp: "Bank", walletGrp: "Wallet",
  };
}

function priceUnit(cat, isUrdu) {
  if (cat === "Chader") return isUrdu ? "/کلو" : "/kg";
  if (cat === "Net") return isUrdu ? "/فٹ" : "/ft";
  return isUrdu ? "/عدد" : "/pc";
}

function stockOf(products, id, name) {
  const pid = String(id || "");
  const n = String(name || "").toLowerCase().trim();
  const prod = (products || []).find((p) => String(p._id || p.id) === pid)
    || (n && (products || []).find((p) => String(p.name || "").toLowerCase().trim() === n));
  return {
    stock: Number(prod?.stock) || 0,
    category: prod?.category || "",
  };
}

function remainingGroupSaleLines(group, products, returns) {
  const byId = {};
  (group?.rows || []).forEach((s) => {
    remainingSaleLines(s, products, returns).forEach((ln) => {
      const k = ln.productId;
      if (!byId[k]) byId[k] = { ...ln };
      else {
        byId[k] = {
          ...byId[k],
          qty: byId[k].qty + ln.qty,
          returned: byId[k].returned + ln.returned,
          remain: byId[k].remain + ln.remain,
        };
      }
    });
  });
  return Object.values(byId);
}

function qKey(groupKey, id) {
  return `${groupKey}::${id}`;
}

function purchaseLinesForGroup(group, already) {
  return (group?.rows || []).map((p) => {
    const ret = already[String(p._id)] || 0;
    const bought = Number(p.qty) || 0;
    return {
      purchaseId: String(p._id),
      productName: p.productName || safeProductName(p.product),
      category: p.category || "",
      qty: bought,
      returned: ret,
      remain: Math.max(0, bought - ret),
      rate: Number(p.rate) || (bought > 0 ? (Number(p.total) || 0) / bought : 0) || Number(p.productPrice) || 0,
    };
  });
}

function CreditBadge({ info, T }) {
  if (!info) return null;
  if (!info.isCredit) {
    return (
      <span style={{
        display: "inline-block", fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 20,
        background: "rgba(52,211,153,0.16)", color: "#34d399", whiteSpace: "nowrap",
      }}>{T.paid}</span>
    );
  }
  const label = info.settlement === "partial" ? T.partial : T.credit;
  return (
    <span style={{
      display: "inline-block", fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 20,
      background: "rgba(248,113,113,0.16)", color: "#f87171", whiteSpace: "nowrap",
    }}>
      {label}{info.remaining > 0 ? ` · ${T.due} ${formatPKR(info.remaining)}` : ""}
    </span>
  );
}

function InvoiceSuggestRow({ invoice, amount, partyKind, party, date, th, pay, T }) {
  const money = th.dark ? "#fbbf24" : "#b45309";
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <span style={{ fontFamily: "ui-monospace,monospace", fontWeight: 800, fontSize: 14, color: money }}>{invoice}</span>
        <span style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.1, whiteSpace: "nowrap", color: money }}>{formatPKR(amount)}</span>
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: th.textMuted, fontWeight: 600 }}>
        {partyKind}: {party || "—"}{date ? ` · ${date}` : ""}
      </div>
      <div style={{ marginTop: 5 }}><CreditBadge info={pay} T={T} /></div>
    </>
  );
}

function LedgerAdjustBox({ kind, party, amount, remaining, enabled, onToggle, T, th }) {
  const ret = Math.round((Number(amount) || 0) * 100) / 100;
  const rem = Math.round((Number(remaining) || 0) * 100) / 100;
  const cut = rem > 0.5 ? Math.min(ret, rem) : ret;
  if (cut <= 0) return null;
  const isSale = kind === "sale";
  return (
    <label style={{
      display: "flex", gap: 12, alignItems: "flex-start",
      padding: "12px 14px", borderRadius: 12, cursor: "pointer",
      border: `1.5px solid ${enabled ? "rgba(26,188,156,0.5)" : th.border}`,
      background: enabled ? "rgba(26,188,156,0.1)" : th.bgCard,
    }}>
      <input
        type="checkbox"
        checked={!!enabled}
        onChange={(e) => onToggle(e.target.checked)}
        style={{ marginTop: 3, width: 16, height: 16, accentColor: "#1abc9c", flexShrink: 0 }}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ color: th.text, fontWeight: 800, fontSize: 13 }}>
          {isSale ? T.reverseReceivable : T.reversePayable}
          {party ? ` · ${party}` : ""}
        </div>
        <div style={{ color: enabled ? (th.dark ? "#2dd4bf" : "#0f766e") : th.textMuted, fontWeight: 900, fontSize: 16, marginTop: 4 }}>
          {formatPKR(cut)}
        </div>
        <div style={{ color: th.textDim, fontSize: 12, marginTop: 4, fontWeight: 600 }}>
          {isSale ? T.reverseHintRec : T.reverseHintPay}
        </div>
      </div>
    </label>
  );
}

function lineReturnTotal(lines, groupKey, qtys, hidden, priceMode, customRate, idField) {
  return (lines || []).reduce((s, ln) => {
    const id = ln[idField];
    const k = qKey(groupKey, id);
    if (hidden[k]) return s;
    const change = priceMode[k] === "change";
    const rate = change ? Number(customRate[k]) : Number(ln.rate) || 0;
    const qty = Number(qtys[k]) || 0;
    return s + qty * rate;
  }, 0);
}

function cashRefundAmount(returnTotal, remaining, reverseLedger) {
  const ret = Math.round((Number(returnTotal) || 0) * 100) / 100;
  const rem = Math.round((Number(remaining) || 0) * 100) / 100;
  if (!reverseLedger) return ret;
  if (rem > 0.5) return Math.max(0, Math.round((ret - Math.min(ret, rem)) * 100) / 100);
  return 0;
}

function RefundAccountField({ kind, value, onChange, accounts, required, T, th }) {
  const cash = (accounts || []).filter((a) => (a.type || a.accountType) === "cash");
  const banks = (accounts || []).filter((a) => (a.type || a.accountType) === "bank");
  const wallets = (accounts || []).filter((a) => (a.type || a.accountType) === "wallet");
  const grouped = new Set([...cash, ...banks, ...wallets].map((a) => accId(a)));
  const other = (accounts || []).filter((a) => accId(a) && !grouped.has(accId(a)));
  const inpS = {
    background: th.input, border: `1px solid ${th.inputBorder}`, color: th.text,
    borderRadius: 12, padding: "11px 14px", fontSize: 14, outline: "none",
    width: "100%", boxSizing: "border-box", fontFamily: "'Segoe UI',sans-serif",
  };
  return (
    <div>
      <label style={{ color: th.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block", fontWeight: 600 }}>
        {kind === "sale" ? T.refundFrom : T.receiveInto}
        {required && <span style={{ color: "#f87171", marginLeft: 3 }}>*</span>}
      </label>
      {(accounts || []).length === 0 ? (
        <div style={{ padding: "10px 12px", borderRadius: 10, border: `1px dashed ${th.border}`, color: th.textMuted, fontSize: 12 }}>
          {T.needAccount}
        </div>
      ) : (
        <select
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          style={inpS}
        >
          <option value="">{T.pickAccount}</option>
          {cash.length > 0 && (
            <optgroup label={T.cashGrp}>
              {cash.map((a) => (
                <option key={accId(a)} value={accId(a)} style={{ background: th.bgModal }}>
                  {accLabel(a)} · {formatPKR(liveBalance(a))}
                </option>
              ))}
            </optgroup>
          )}
          {banks.length > 0 && (
            <optgroup label={T.bankGrp}>
              {banks.map((a) => (
                <option key={accId(a)} value={accId(a)} style={{ background: th.bgModal }}>
                  {accLabel(a)} · {formatPKR(liveBalance(a))}
                </option>
              ))}
            </optgroup>
          )}
          {wallets.length > 0 && (
            <optgroup label={T.walletGrp}>
              {wallets.map((a) => (
                <option key={accId(a)} value={accId(a)} style={{ background: th.bgModal }}>
                  {accLabel(a)} · {formatPKR(liveBalance(a))}
                </option>
              ))}
            </optgroup>
          )}
          {other.length > 0 && other.map((a) => (
            <option key={accId(a)} value={accId(a)} style={{ background: th.bgModal }}>
              {accLabel(a)} · {formatPKR(liveBalance(a))}
            </option>
          ))}
        </select>
      )}
      {required && (
        <p style={{ color: th.textDim, fontSize: 11, margin: "4px 0 0" }}>
          {kind === "sale" ? T.refundHint : T.receiveHint}
        </p>
      )}
    </div>
  );
}

function SelectedInvoiceBar({ group, partyKind, party, T, th, pay }) {
  const money = th.dark ? "#fbbf24" : "#b45309";
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 12, border: `1px solid ${th.border}`,
      background: th.bgCard, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start",
    }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ color: th.textMuted, fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>{partyKind}</div>
        <div style={{ color: th.text, fontWeight: 800, fontSize: 15, marginTop: 2 }}>{party || "—"}</div>
        <div style={{ marginTop: 6 }}><CreditBadge info={pay} T={T} /></div>
      </div>
      <div>
        <div style={{ color: th.textMuted, fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>{T.invoice}</div>
        <div style={{ fontFamily: "ui-monospace,monospace", fontWeight: 800, fontSize: 14, marginTop: 2, color: money }}>{group.invoice}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ color: th.textMuted, fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>{T.invoiceAmt}</div>
        <div style={{ fontWeight: 900, fontSize: 15, marginTop: 2, color: money }}>{formatPKR(group.amount)}</div>
      </div>
    </div>
  );
}

function InvoiceItemsPopup({ hit, partyKind, onClose, T, th, isUrdu }) {
  const money = th.dark ? "#fbbf24" : "#b45309";
  const items = hit?.items || [];
  return (
    <Modal title={`${hit?.invoice || ""} · ${T.products}`} onClose={onClose} layer={70}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ color: th.textMuted, fontSize: 13, fontWeight: 600, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span>
            {partyKind}: {hit?.party || hit?.customer || hit?.supplier || "—"}
            {hit?.date ? ` · ${hit.date}` : ""}
          </span>
          <CreditBadge info={hit?.pay} T={T} />
        </div>
        {items.length === 0 && (
          <div style={{ padding: 16, textAlign: "center", color: th.textDim, fontSize: 13 }}>{T.none}</div>
        )}
        {items.map((it, i) => (
          <div key={i} style={{
            display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center",
            padding: "10px 12px", borderRadius: 12, border: `1px solid ${th.border}`, background: th.bgCard,
          }}>
            <div style={{ color: th.text, fontWeight: 800, fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
            <div style={{ display: "flex", gap: 14, alignItems: "baseline", flexShrink: 0 }}>
              <span style={{ fontWeight: 900, fontSize: 15, color: money }}>{formatPKR(it.amount)}</span>
              <span style={{ color: th.textMuted, fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
                {T.stock} {qtyUnit(it.category, it.stock, isUrdu)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function InvoiceHitRow({ hit, partyKind, active, i, onHover, onPick, onView, T, th, selected }) {
  return (
    <div
      data-nav-i={i}
      onMouseEnter={() => onHover(i)}
      style={{
        display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px",
        borderBottom: `1px solid ${th.border}`,
        background: active ? "rgba(26,188,156,0.16)" : "transparent",
      }}
    >
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onPick(hit)}
        style={{
          flex: 1, minWidth: 0, textAlign: "left", padding: "2px 4px",
          border: "none", cursor: "pointer", background: "transparent", color: th.text, fontSize: 13,
        }}
      >
        <InvoiceSuggestRow
          invoice={hit.invoice}
          amount={hit.amount}
          partyKind={partyKind}
          party={hit.customer || hit.supplier}
          date={hit.date}
          th={th}
          pay={hit.pay}
          T={T}
        />
        {selected && (
          <div style={{ marginTop: 4, fontSize: 11, fontWeight: 800, color: "#1abc9c" }}>{T.added}</div>
        )}
      </button>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { e.stopPropagation(); onView(hit); }}
        style={{
          flexShrink: 0, alignSelf: "flex-start", marginTop: 1, height: 32, padding: "0 14px",
          borderRadius: 8, cursor: "pointer", fontWeight: 800, fontSize: 12, letterSpacing: "0.02em",
          border: "none", background: "linear-gradient(135deg,#1abc9c,#2980b9)", color: "#fff",
          whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(26,188,156,0.28)",
        }}
      >
        {T.view}
      </button>
    </div>
  );
}

function ReturnItemCard({
  name, meta, qtyValue, onQty, remain, disabled, soldRate, priceMode, onPriceMode,
  customRate, onCustomRate, onRemove, inp, T, isUrdu, th, category,
}) {
  const unit = priceUnit(category, isUrdu);
  const same = priceMode !== "change";
  const rate = same ? Number(soldRate) || 0 : (customRate === "" ? "" : Number(customRate) || 0);
  const qty = Number(qtyValue) || 0;
  const lineTotal = qty * (Number(rate) || 0);
  const tab = (id, label) => (
    <button type="button" onClick={() => onPriceMode(id)} style={{
      flex: 1, padding: "7px 8px", borderRadius: 8, cursor: "pointer", fontWeight: 700, fontSize: 12,
      border: `1.5px solid ${priceMode === id ? "#1abc9c" : th.border}`,
      background: priceMode === id ? "rgba(26,188,156,0.14)" : "transparent",
      color: priceMode === id ? "#1abc9c" : th.textMuted,
    }}>{label}</button>
  );
  return (
    <div style={{ padding: 12, borderRadius: 12, border: `1px solid ${th.border}`, background: th.bgCard, position: "relative" }}>
      <button
        type="button"
        onClick={onRemove}
        title="Remove"
        style={{ position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(248,113,113,0.15)", color: "#f87171", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
      >
        <Icon path={ICONS.close} size={14} />
      </button>
      <div style={{ color: th.text, fontWeight: 800, fontSize: 14, paddingRight: 32 }}>{name}</div>
      <div style={{ color: th.textMuted, fontSize: 12, margin: "4px 0 8px" }}>{meta}</div>
      <div style={{ color: "#34d399", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
        {T.perPiece}: {formatPKR(Number(soldRate) || 0)}{unit}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {tab("same", T.samePrice)}
        {tab("change", T.changePrice)}
      </div>
      {!same && (
        <input
          type="number" min="0" step="any"
          value={customRate}
          onChange={(e) => onCustomRate(e.target.value)}
          placeholder={isUrdu ? "نئی قیمت" : "New price"}
          style={{ ...inp, marginBottom: 8 }}
        />
      )}
      <input
        type="number" min="0" max={remain} step="any"
        value={qtyValue}
        disabled={disabled}
        onChange={(e) => onQty(e.target.value)}
        placeholder={T.qty}
        style={inp}
      />
      {qty > 0 && (
        <div style={{ color: th.textMuted, fontSize: 12, marginTop: 6, fontWeight: 700 }}>
          {formatPKR(Number(rate) || 0)}{unit} × {qty} = {formatPKR(lineTotal)}
        </div>
      )}
    </div>
  );
}

export function SaleReturnModal({ sales, products, returns, onClose, onSave }) {
  const th = useTheme();
  const { lang } = useLang();
  const isUrdu = lang === "ur";
  const T = L(isUrdu);
  const accounts = useAccounts();
  const [search, setSearch] = useState("");
  const [pickedKeys, setPickedKeys] = useState([]);
  const [reverseByKey, setReverseByKey] = useState({});
  const [qtys, setQtys] = useState({});
  const [hidden, setHidden] = useState({});
  const [priceMode, setPriceMode] = useState({});
  const [customRate, setCustomRate] = useState({});
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayStr());
  const [refundAccountId, setRefundAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [viewHit, setViewHit] = useState(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const groups = useMemo(() => {
    const map = {};
    (sales || []).forEach((s) => {
      const invoice = s.invoice || s.invoiceNum || "—";
      const customer = s.customer || "";
      const key = `${invoice}||${customer}||${s.date || ""}`;
      if (!map[key]) map[key] = { key, invoice, customer, date: s.date || "", rows: [] };
      map[key].rows.push(s);
    });
    return Object.values(map).map((g) => {
      const seen = new Set();
      const items = [];
      g.rows.forEach((s) => {
        const lines = saleProductLines(s, products);
        const fallback = lines.length ? lines : [{
          productId: pidOf(s.product),
          productName: s.productName || safeProductName(s.product),
          amount: Number(s.total) || Number(s.grandTotal) || 0,
          category: s.category || "",
        }];
        fallback.forEach((ln) => {
          const key = String(ln.productId || ln.productName || "").toLowerCase();
          if (!key || seen.has(key)) return;
          seen.add(key);
          const info = stockOf(products, ln.productId, ln.productName);
          items.push({
            name: ln.productName || "Item",
            amount: Number(ln.amount) || (Number(ln.rate) || 0) * (Number(ln.qty) || 0) || 0,
            stock: info.stock,
            category: ln.category || info.category,
          });
        });
      });
      let amount = 0;
      if (g.rows.length === 1) {
        amount = Number(g.rows[0].grandTotal) || Number(g.rows[0].total) || 0;
      } else {
        const grands = g.rows.map((r) => Number(r.grandTotal) || 0);
        const allSame = grands.every((n) => n === grands[0]) && grands[0] > 0;
        amount = allSame
          ? grands[0]
          : g.rows.reduce((s, r) => s + (Number(r.total) || Number(r.grandTotal) || 0), 0);
      }
      return { ...g, amount, items, pay: invoicePayInfo(g.rows) };
    });
  }, [sales, products]);

  const hits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups
      .filter((g) => {
        if (!q) return true;
        return [g.invoice, g.customer, g.date, formatPKR(g.amount), ...(g.items || []).map((it) => it.name)]
          .some((v) => String(v || "").toLowerCase().includes(q));
      })
      .slice(0, 100)
      .map((g) => ({
        value: g.key,
        invoice: g.invoice,
        customer: g.customer || "—",
        amount: g.amount,
        date: g.date,
        items: g.items || [],
        pay: g.pay,
        label: `${g.invoice} · ${formatPKR(g.amount)} · ${g.customer || "—"}`,
      }));
  }, [groups, search]);

  const selectedGroups = pickedKeys.map((k) => groups.find((g) => g.key === k)).filter(Boolean);

  const dropInvoice = (key) => {
    setPickedKeys((p) => p.filter((k) => k !== key));
    setReverseByKey((p) => {
      const n = { ...p };
      delete n[key];
      return n;
    });
    const dropPref = `${key}::`;
    const strip = (obj) => {
      const n = { ...obj };
      Object.keys(n).forEach((k) => { if (k.startsWith(dropPref)) delete n[k]; });
      return n;
    };
    setQtys(strip);
    setHidden(strip);
    setPriceMode(strip);
    setCustomRate(strip);
  };

  const onPick = (hit) => {
    const g = groups.find((x) => x.key === hit.value);
    if (!g) return;
    setPickedKeys((prev) => prev.includes(hit.value) ? prev : [...prev, hit.value]);
    setReverseByKey((p) => (p[g.key] == null ? { ...p, [g.key]: !!g.pay?.isCredit } : p));
    setRefundAccountId((prev) => prev || g.pay?.accountId || "");
    setSearch("");
    setOpen(false);
    const next = {};
    remainingGroupSaleLines(g, products, returns).forEach((ln) => {
      next[qKey(g.key, ln.productId)] = String(ln.remain);
    });
    setQtys((p) => ({ ...p, ...next }));
  };
  const { open, setOpen, hi, setHi, onKeyDown: navKeys, listRef } = useTypeaheadNav(hits, (hit) => {
    onPick(hit);
    requestAnimationFrame(() => focusNextField(document.activeElement, document.querySelector("[data-modal-box]")));
  });

  const onSearchChange = (v) => {
    setSearch(v);
    setHi(0);
    setOpen(true);
  };

  const save = async () => {
    if (!selectedGroups.length) { alert(T.needPick); return; }
    const acc = (accounts || []).find((a) => accId(a) === refundAccountId);
    const accountName = acc ? accLabel(acc) : "";
    const payloads = [];
    let anyAllReturned = false;
    let cashNeeded = 0;
    for (const g of selectedGroups) {
      const sale = g.rows?.[0];
      if (!sale) continue;
      const lines = remainingGroupSaleLines(g, products, returns);
      if (!lines.length) anyAllReturned = true;
      const items = lines
        .filter((ln) => !hidden[qKey(g.key, ln.productId)])
        .map((ln) => {
          const k = qKey(g.key, ln.productId);
          const change = priceMode[k] === "change";
          const rate = change ? Number(customRate[k]) : Number(ln.rate) || 0;
          const qty = Math.min(Number(qtys[k]) || 0, ln.remain);
          return { productId: ln.productId, productName: ln.productName, qty, rate };
        })
        .filter((it) => it.qty > 0);
      if (items.length) {
        const ret = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
        cashNeeded += cashRefundAmount(ret, g.pay?.remaining || 0, !!reverseByKey[g.key]);
        payloads.push({
          saleId: sale._id, date, notes: note, items,
          reverseLedger: !!reverseByKey[g.key],
          accountId: refundAccountId,
          accountName,
        });
      }
    }
    if (!payloads.length) { alert(anyAllReturned ? T.allReturned : T.needQty); return; }
    if (cashNeeded > 0.5 && accounts.length > 0 && !refundAccountId) { alert(T.needAccount); return; }
    setSaving(true);
    for (const payload of payloads) {
      const res = await onSave(payload);
      if (!res?.success) {
        setSaving(false);
        alert(res?.message || "Error");
        return;
      }
    }
    setSaving(false);
    onClose();
  };

  const inp = { background: th.input, border: `1px solid ${th.inputBorder}`, color: th.text, borderRadius: 10, padding: "8px 10px", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" };

  const saleCashNeeded = selectedGroups.reduce((sum, g) => {
    const lines = remainingGroupSaleLines(g, products, returns);
    const ret = lineReturnTotal(lines, g.key, qtys, hidden, priceMode, customRate, "productId");
    return sum + cashRefundAmount(ret, g.pay?.remaining || 0, !!reverseByKey[g.key]);
  }, 0);

  return (
    <>
    <Modal title={T.saleReturn} onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, color: "#34d399", fontSize: 12, fontWeight: 700 }}>{T.addStock}</p>
        <div ref={boxRef} style={{ position: "relative" }}>
          <label style={{ color: th.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block", fontWeight: 600 }}>
            {selectedGroups.length ? T.addAnother : T.searchSale} <span style={{ color: "#f87171" }}>*</span>
          </label>
          <input
            value={search}
            data-suggest-open={open ? "1" : "0"}
            onChange={(e) => onSearchChange(e.target.value)}
            onClick={() => { setOpen(true); setHi(0); }}
            onKeyDown={navKeys}
            placeholder={T.searchSalePh}
            style={inp}
            autoComplete="off"
          />
          {open && (
            <div ref={listRef} style={{
              position: "absolute", left: 0, right: 0, top: "100%", zIndex: 40, marginTop: 4,
              maxHeight: 420, overflowY: "auto", borderRadius: 12,
              border: `1px solid ${th.border}`, background: th.bgModal, boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
            }}>
              {hits.length === 0 && (
                <div style={{ padding: "10px 12px", color: th.textMuted, fontSize: 13 }}>{isUrdu ? "کوئی نتیجہ نہیں" : "No matches"}</div>
              )}
              {hits.map((h, i) => (
                <InvoiceHitRow
                  key={h.value}
                  hit={h}
                  i={i}
                  partyKind={T.customer}
                  active={i === hi || pickedKeys.includes(h.value)}
                  selected={pickedKeys.includes(h.value)}
                  onHover={setHi}
                  onPick={onPick}
                  onView={setViewHit}
                  T={T}
                  th={th}
                />
              ))}
            </div>
          )}
        </div>
        {selectedGroups.map((g) => {
          const lines = remainingGroupSaleLines(g, products, returns);
          return (
            <div key={g.key} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SelectedInvoiceBar
                group={g}
                partyKind={T.customer}
                party={g.customer}
                T={T}
                th={th}
                pay={g.pay}
              />
              {lines.length === 0 && (
                <p style={{ margin: 0, color: "#f87171", fontWeight: 700, fontSize: 13 }}>{T.allReturned}</p>
              )}
              {lines.filter((ln) => !hidden[qKey(g.key, ln.productId)]).map((ln) => {
                const k = qKey(g.key, ln.productId);
                return (
                  <ReturnItemCard
                    key={k}
                    name={ln.productName}
                    meta={`${T.sold} ${qtyUnit(ln.category, ln.qty, isUrdu)} · ${T.returned} ${qtyUnit(ln.category, ln.returned, isUrdu)} · ${T.remain} ${qtyUnit(ln.category, ln.remain, isUrdu)}`}
                    qtyValue={qtys[k] ?? ""}
                    onQty={(v) => {
                      const n = Number(v);
                      const capped = Number.isFinite(n) && n > ln.remain ? String(ln.remain) : v;
                      setQtys((p) => ({ ...p, [k]: capped }));
                    }}
                    remain={ln.remain}
                    disabled={ln.remain <= 0}
                    soldRate={ln.rate}
                    priceMode={priceMode[k] || "same"}
                    onPriceMode={(m) => setPriceMode((p) => ({ ...p, [k]: m }))}
                    customRate={customRate[k] ?? ""}
                    onCustomRate={(v) => setCustomRate((p) => ({ ...p, [k]: v }))}
                    onRemove={() => setHidden((p) => ({ ...p, [k]: true }))}
                    inp={inp}
                    T={T}
                    isUrdu={isUrdu}
                    th={th}
                    category={ln.category}
                  />
                );
              })}
              <LedgerAdjustBox
                kind="sale"
                party={g.customer}
                amount={lineReturnTotal(lines, g.key, qtys, hidden, priceMode, customRate, "productId")}
                remaining={g.pay?.remaining || 0}
                enabled={!!reverseByKey[g.key]}
                onToggle={(v) => setReverseByKey((p) => ({ ...p, [g.key]: v }))}
                T={T}
                th={th}
              />
            </div>
          );
        })}
        <div style={{ display: "grid", gridTemplateColumns: selectedGroups.length ? "1fr 1fr" : "1fr", gap: 12 }}>
          <FInput label={T.date} type="date" value={date} onChange={setDate} />
          {selectedGroups.length > 0 && (
            <RefundAccountField
              kind="sale"
              value={refundAccountId}
              onChange={setRefundAccountId}
              accounts={accounts}
              required={saleCashNeeded > 0.5}
              T={T}
              th={th}
            />
          )}
        </div>
        <FInput label={T.note} value={note} onChange={setNote} placeholder="..." />
        <SaveBtn onClick={save} loading={saving} label={saving ? "..." : T.save} />
      </div>
    </Modal>
    {viewHit && (
      <InvoiceItemsPopup
        hit={viewHit}
        partyKind={T.customer}
        onClose={() => setViewHit(null)}
        T={T}
        th={th}
        isUrdu={isUrdu}
      />
    )}
    </>
  );
}

export function PurchaseReturnModal({ purchases, products = [], returns, onClose, onSave, seedProductId = "" }) {
  const th = useTheme();
  const { lang } = useLang();
  const isUrdu = lang === "ur";
  const T = L(isUrdu);
  const accounts = useAccounts();
  const seedName = (products || []).find((p) => String(p._id) === String(seedProductId))?.name || "";
  const [search, setSearch] = useState(seedName);
  const [invoiceKeys, setInvoiceKeys] = useState([]);
  const [reverseByKey, setReverseByKey] = useState({});
  const [stockId, setStockId] = useState(seedProductId || "");
  const [qtys, setQtys] = useState({});
  const [hidden, setHidden] = useState({});
  const [priceMode, setPriceMode] = useState({});
  const [customRate, setCustomRate] = useState({});
  const [stockQty, setStockQty] = useState("");
  const [stockHidden, setStockHidden] = useState(false);
  const [stockPriceMode, setStockPriceMode] = useState("same");
  const [stockCustomRate, setStockCustomRate] = useState("");
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayStr());
  const [refundAccountId, setRefundAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [viewHit, setViewHit] = useState(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const groups = useMemo(() => {
    const map = {};
    (purchases || []).forEach((p) => {
      const invoice = p.invoice || p.invoiceNum || "—";
      const supplier = p.supplier || p.supplierName || "";
      const key = `${invoice}||${supplier}||${p.date || ""}`;
      if (!map[key]) map[key] = { key, invoice, supplier, date: p.date || "", rows: [] };
      if (!map[key].supplier) map[key].supplier = supplier;
      map[key].rows.push(p);
    });
    return Object.values(map).map((g) => {
      const seen = new Set();
      const items = [];
      (g.rows || []).forEach((r) => {
        const name = r.productName || safeProductName(r.product) || "Item";
        const id = pidOf(r.product);
        const key = String(id || name).toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        const info = stockOf(products, id, name);
        items.push({
          name,
          amount: Number(r.total) || 0,
          stock: info.stock,
          category: r.category || info.category,
        });
      });
      return {
        ...g,
        amount: (g.rows || []).reduce((s, r) => s + (Number(r.total) || 0), 0),
        items,
        pay: invoicePayInfo(g.rows),
      };
    });
  }, [purchases, products]);

  const matchesQ = (q, ...vals) => {
    if (!q) return true;
    return vals.some((v) => String(v || "").toLowerCase().includes(q));
  };

  const hits = useMemo(() => {
    const q = search.trim().toLowerCase();
    const invoiceHits = groups
      .filter((g) => matchesQ(
        q,
        g.invoice,
        g.supplier,
        g.date,
        formatPKR(g.amount),
        ...(g.rows || []).map((r) => r.productName || safeProductName(r.product)),
      ))
      .map((g) => ({
        value: `i:${g.key}`,
        kind: "invoice",
        invoice: g.invoice,
        supplier: g.supplier || "—",
        amount: g.amount,
        date: g.date,
        items: g.items || [],
        pay: g.pay,
        label: `${g.invoice} · ${formatPKR(g.amount)} · ${g.supplier || "—"}`,
      }));
    const productHits = (products || [])
      .filter((p) => (Number(p.stock) || 0) > 0)
      .filter((p) => q && matchesQ(q, p.name, p.barcode, p.category, p.brand, p.lastInvoice, p.lastSupplier,
        ...(Array.isArray(p.suppliers) ? p.suppliers.map((s) => s?.name) : [])))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map((p) => ({
        value: `p:${p._id}`,
        kind: "stock",
        invoice: p.lastInvoice || "",
        supplier: p.lastSupplier || "",
        amount: 0,
        date: "",
        label: `${p.name} · ${p.barcode || p.lastInvoice || p.category || ""} · ${qtyUnit(p.category, p.stock, isUrdu)}`,
      }));
    if (!q) return invoiceHits.slice(0, 100);
    return [...invoiceHits, ...productHits].slice(0, 100);
  }, [products, groups, search, isUrdu]);

  const already = returnedQtyMap(returns, (it) => pidOf(it.purchase));
  const selectedGroups = invoiceKeys.map((k) => groups.find((g) => g.key === k)).filter(Boolean);
  const productId = stockId;
  const selectedProd = products.find((p) => String(p._id) === productId);
  const stockLeft = Number(selectedProd?.stock) || 0;
  const mainSup = (() => {
    const list = Array.isArray(selectedProd?.suppliers) ? selectedProd.suppliers : [];
    const main = list.find((s) => s && s.isMain) || list[0];
    return main?.name || selectedProd?.lastSupplier || "";
  })();

  const dropInvoice = (key) => {
    setInvoiceKeys((p) => p.filter((k) => k !== key));
    setReverseByKey((p) => {
      const n = { ...p };
      delete n[key];
      return n;
    });
    const dropPref = `${key}::`;
    const strip = (obj) => {
      const n = { ...obj };
      Object.keys(n).forEach((k) => { if (k.startsWith(dropPref)) delete n[k]; });
      return n;
    };
    setQtys(strip);
    setHidden(strip);
    setPriceMode(strip);
    setCustomRate(strip);
  };

  const onPick = (hit) => {
    setOpen(false);
    setSearch("");
    if (hit.kind === "stock") {
      setStockId(String(hit.value).replace(/^p:/, ""));
      setInvoiceKeys([]);
      setQtys({});
      setHidden({});
      setPriceMode({});
      setCustomRate({});
      setStockQty("");
      setStockHidden(false);
      setStockPriceMode("same");
      setStockCustomRate("");
      setSupplier(hit.supplier && hit.supplier !== "—" ? hit.supplier : "");
      setReverseByKey({});
      return;
    }
    const key = String(hit.value).startsWith("i:") ? hit.value.slice(2) : hit.value;
    const g = groups.find((x) => x.key === key);
    if (!g) return;
    setStockId("");
    setStockHidden(false);
    setInvoiceKeys((prev) => prev.includes(key) ? prev : [...prev, key]);
    setReverseByKey((p) => (p[key] == null ? { ...p, [key]: !!g.pay?.isCredit } : p));
    setRefundAccountId((prev) => prev || g.pay?.accountId || "");
    if (hit.supplier && hit.supplier !== "—") setSupplier(hit.supplier);
    const next = {};
    purchaseLinesForGroup(g, already).forEach((ln) => {
      next[qKey(key, ln.purchaseId)] = String(ln.remain);
    });
    setQtys((p) => ({ ...p, ...next }));
  };
  const { open, setOpen, hi, setHi, onKeyDown: navKeys, listRef } = useTypeaheadNav(hits, (hit) => {
    onPick(hit);
    requestAnimationFrame(() => focusNextField(document.activeElement, document.querySelector("[data-modal-box]")));
  });

  const onSearchChange = (v) => {
    setSearch(v);
    setHi(0);
    setOpen(true);
  };

  const save = async () => {
    if (productId && !stockHidden && !selectedGroups.length) {
      const qty = Number(stockQty) || 0;
      if (qty <= 0) { alert(T.needQty); return; }
      if (qty > stockLeft + 1e-9) { alert(`${T.inStock}: ${stockLeft}`); return; }
      const soldRate = Number(selectedProd?.purchasePrice) || Number(selectedProd?.price) || 0;
      const rate = stockPriceMode === "change" ? Number(stockCustomRate) : soldRate;
      setSaving(true);
      const res = await onSave({
        date, notes: note, supplier: supplier || mainSup,
        items: [{ productId, qty, rate }],
      });
      setSaving(false);
      if (res?.success) onClose();
      else alert(res?.message || "Error");
      return;
    }
    if (!selectedGroups.length) { alert(T.needPick); return; }
    const acc = (accounts || []).find((a) => accId(a) === refundAccountId);
    const accountName = acc ? accLabel(acc) : "";
    const payloads = [];
    let cashNeeded = 0;
    for (const g of selectedGroups) {
      const lines = purchaseLinesForGroup(g, already);
      const items = lines
        .filter((ln) => !hidden[qKey(g.key, ln.purchaseId)])
        .map((ln) => {
          const k = qKey(g.key, ln.purchaseId);
          const change = priceMode[k] === "change";
          const rate = change ? Number(customRate[k]) : Number(ln.rate) || 0;
          return { purchaseId: ln.purchaseId, qty: Number(qtys[k]) || 0, rate };
        })
        .filter((it) => it.qty > 0);
      if (items.length) {
        const ret = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.rate) || 0), 0);
        cashNeeded += cashRefundAmount(ret, g.pay?.remaining || 0, !!reverseByKey[g.key]);
        payloads.push({
          date, notes: note, items,
          reverseLedger: !!reverseByKey[g.key],
          accountId: refundAccountId,
          accountName,
        });
      }
    }
    if (!payloads.length) { alert(T.needQty); return; }
    if (cashNeeded > 0.5 && accounts.length > 0 && !refundAccountId) { alert(T.needAccount); return; }
    setSaving(true);
    for (const payload of payloads) {
      const res = await onSave(payload);
      if (!res?.success) {
        setSaving(false);
        alert(res?.message || "Error");
        return;
      }
    }
    setSaving(false);
    onClose();
  };

  const inp = { background: th.input, border: `1px solid ${th.inputBorder}`, color: th.text, borderRadius: 10, padding: "8px 10px", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" };

  const purchaseCashNeeded = selectedGroups.reduce((sum, g) => {
    const lines = purchaseLinesForGroup(g, already);
    const ret = lineReturnTotal(lines, g.key, qtys, hidden, priceMode, customRate, "purchaseId");
    return sum + cashRefundAmount(ret, g.pay?.remaining || 0, !!reverseByKey[g.key]);
  }, 0);

  return (
    <>
    <Modal title={T.purchaseReturn} onClose={onClose} wide>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, color: "#f87171", fontSize: 12, fontWeight: 700 }}>{T.removeStock}</p>
        <div ref={boxRef} style={{ position: "relative" }}>
          <label style={{ color: th.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block", fontWeight: 600 }}>
            {selectedGroups.length ? T.addAnother : T.search} <span style={{ color: "#f87171" }}>*</span>
          </label>
          <input
            value={search}
            data-suggest-open={open ? "1" : "0"}
            onChange={(e) => onSearchChange(e.target.value)}
            onClick={() => { setOpen(true); setHi(0); }}
            onKeyDown={navKeys}
            placeholder={T.searchPh}
            style={inp}
            autoComplete="off"
          />
          {open && (
            <div ref={listRef} style={{
              position: "absolute", left: 0, right: 0, top: "100%", zIndex: 40, marginTop: 4,
              maxHeight: 420, overflowY: "auto", borderRadius: 12,
              border: `1px solid ${th.border}`, background: th.bgModal, boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
            }}>
              {hits.length === 0 && (
                <div style={{ padding: "10px 12px", color: th.textMuted, fontSize: 13 }}>{isUrdu ? "کوئی نتیجہ نہیں" : "No matches"}</div>
              )}
              {hits.map((h, i) => (
                h.kind === "invoice" ? (
                  <InvoiceHitRow
                    key={h.value}
                    hit={h}
                    i={i}
                    partyKind={T.supplier}
                    active={i === hi || invoiceKeys.includes(h.value.slice(2))}
                    selected={invoiceKeys.includes(h.value.slice(2))}
                    onHover={setHi}
                    onPick={onPick}
                    onView={setViewHit}
                    T={T}
                    th={th}
                  />
                ) : (
                <button
                  key={h.value}
                  type="button"
                  data-nav-i={i}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick(h)}
                  onMouseEnter={() => setHi(i)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "10px 12px",
                    border: "none", cursor: "pointer",
                    background: i === hi || stockId === String(h.value).replace(/^p:/, "") ? "rgba(26,188,156,0.16)" : "transparent",
                    color: th.text, fontSize: 13,
                    fontWeight: stockId === String(h.value).replace(/^p:/, "") ? 700 : 500,
                    borderBottom: `1px solid ${th.border}`,
                  }}
                >
                  {h.label}
                </button>
                )
              ))}
            </div>
          )}
        </div>

        {selectedProd && !stockHidden && !selectedGroups.length && (
          <>
            <ReturnItemCard
              name={selectedProd.name}
              meta={`${T.inStock}: ${qtyUnit(selectedProd.category, stockLeft, isUrdu)}${mainSup ? ` · ${T.supplier}: ${mainSup}` : ""}${selectedProd.lastInvoice ? ` · ${T.invoice}: ${selectedProd.lastInvoice}` : ""}`}
              qtyValue={stockQty}
              onQty={setStockQty}
              remain={stockLeft}
              disabled={stockLeft <= 0}
              soldRate={Number(selectedProd.purchasePrice) || Number(selectedProd.price) || 0}
              priceMode={stockPriceMode}
              onPriceMode={setStockPriceMode}
              customRate={stockCustomRate}
              onCustomRate={setStockCustomRate}
              onRemove={() => setStockHidden(true)}
              inp={inp}
              T={T}
              isUrdu={isUrdu}
              th={th}
              category={selectedProd.category}
            />
            <FInput label={T.supplier} value={supplier} onChange={setSupplier} placeholder={mainSup || (isUrdu ? "سپلائر (اختیاری)" : "Supplier (optional)")} />
          </>
        )}

        {selectedGroups.map((g) => {
          const lines = purchaseLinesForGroup(g, already);
          return (
            <div key={g.key} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <SelectedInvoiceBar
                group={g}
                partyKind={T.supplier}
                party={g.supplier}
                T={T}
                th={th}
                pay={g.pay}
              />
              {lines.filter((ln) => !hidden[qKey(g.key, ln.purchaseId)]).map((ln) => {
                const k = qKey(g.key, ln.purchaseId);
                return (
                  <ReturnItemCard
                    key={k}
                    name={ln.productName}
                    meta={`${T.bought} ${qtyUnit(ln.category, ln.qty, isUrdu)} · ${T.returned} ${qtyUnit(ln.category, ln.returned, isUrdu)} · ${T.remain} ${qtyUnit(ln.category, ln.remain, isUrdu)}`}
                    qtyValue={qtys[k] ?? ""}
                    onQty={(v) => setQtys((p) => ({ ...p, [k]: v }))}
                    remain={ln.remain}
                    disabled={ln.remain <= 0}
                    soldRate={ln.rate}
                    priceMode={priceMode[k] || "same"}
                    onPriceMode={(m) => setPriceMode((p) => ({ ...p, [k]: m }))}
                    customRate={customRate[k] ?? ""}
                    onCustomRate={(v) => setCustomRate((p) => ({ ...p, [k]: v }))}
                    onRemove={() => setHidden((p) => ({ ...p, [k]: true }))}
                    inp={inp}
                    T={T}
                    isUrdu={isUrdu}
                    th={th}
                    category={ln.category}
                  />
                );
              })}
              <LedgerAdjustBox
                kind="purchase"
                party={g.supplier}
                amount={lineReturnTotal(lines, g.key, qtys, hidden, priceMode, customRate, "purchaseId")}
                remaining={g.pay?.remaining || 0}
                enabled={!!reverseByKey[g.key]}
                onToggle={(v) => setReverseByKey((p) => ({ ...p, [g.key]: v }))}
                T={T}
                th={th}
              />
            </div>
          );
        })}

        <div style={{ display: "grid", gridTemplateColumns: selectedGroups.length ? "1fr 1fr" : "1fr", gap: 12 }}>
          <FInput label={T.date} type="date" value={date} onChange={setDate} />
          {selectedGroups.length > 0 && (
            <RefundAccountField
              kind="purchase"
              value={refundAccountId}
              onChange={setRefundAccountId}
              accounts={accounts}
              required={purchaseCashNeeded > 0.5}
              T={T}
              th={th}
            />
          )}
        </div>
        <FInput label={T.note} value={note} onChange={setNote} placeholder="..." />
        <SaveBtn onClick={save} loading={saving} label={saving ? "..." : T.save} />
      </div>
    </Modal>
    {viewHit && (
      <InvoiceItemsPopup
        hit={viewHit}
        partyKind={T.supplier}
        onClose={() => setViewHit(null)}
        T={T}
        th={th}
        isUrdu={isUrdu}
      />
    )}
    </>
  );
}

export function ReturnsTable({ returns, kind, onDelete }) {
  const th = useTheme();
  const { t, lang } = useLang();
  const isUrdu = lang === "ur";
  const T = L(isUrdu);
  if (!returns?.length) {
    return <p style={{ color: th.textMuted, fontSize: 13, margin: "4px 0 0" }}>{T.none}</p>;
  }
  return (
    <Table
      cols={[T.invoice, t.date, kind === "sale" ? T.customer : T.supplier, t.products, t.quantity, t.totalLabel]}
      rows={returns.map((r) => {
        const names = (r.items || []).map((it) => it.productName).filter(Boolean).join(", ") || "—";
        const qty = (r.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0);
        const cat = r.items?.[0]?.category || "";
        return {
          data: r,
          cells: [
            <span style={{ fontFamily: "monospace", color: kind === "sale" ? "#34d399" : "#f87171", fontSize: 13 }}>{r.returnInvoice || r.invoice}</span>,
            r.date,
            kind === "sale" ? (r.customer || "—") : (r.supplier || "—"),
            <span style={{ display: "inline-block", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={names}>{names}</span>,
            qtyUnit(cat, qty, isUrdu),
            <span style={{ fontWeight: 700 }}>{formatPKR(r.total)}</span>,
          ],
        };
      })}
      onDelete={onDelete}
    />
  );
}
