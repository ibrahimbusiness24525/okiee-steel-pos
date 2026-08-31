import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { Modal, FInput, SaveBtn, Table, Icon, ICONS } from "./shared";
import { formatPKR, todayStr, formatWeightKgG } from "../utils/helpers";
import { safeProductName } from "../utils/constants";
import { returnsForSale } from "../utils/returnsStore";

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
    fromStock: "انوینٹری سے", fromInvoice: "انوائس سے",
    pickProduct: "آئٹم منتخب کریں", inStock: "موجودہ اسٹاک",
    search: "نام، نمبر یا انوائس سے تلاش...",
    sold: "فروخت", bought: "خریدا", returned: "واپس", remain: "باقی",
    qty: "واپسی مقدار", note: "نوٹ", date: "تاریخ", save: "محفوظ کریں",
    needPick: "پہلے نام، نمبر یا انوائس منتخب کریں", needQty: "واپسی مقدار لکھیں",
    records: "واپسی کے ریکارڈ", none: "ابھی کوئی واپسی نہیں",
    del: "کیا یہ واپسی حذف کریں؟",
    addStock: "اسٹاک میں شامل ہوگا", removeStock: "اسٹاک سے نکلے گا اور سپلائر کو واپس",
    allReturned: "اس انوائس کی ساری مقدار واپس ہو چکی ہے",
    customer: "گاہک", supplier: "سپلائر", invoice: "انوائس",
    samePrice: "اصل قیمت", changePrice: "قیمت تبدیل", perPiece: "فی پیس",
  } : {
    saleReturn: "Sale Return", purchaseReturn: "Purchase Return",
    pickSale: "Select sale invoice", pickPurchase: "Select item",
    fromStock: "From inventory", fromInvoice: "From invoice",
    pickProduct: "Select item", inStock: "In stock",
    search: "Search by name, number or invoice...",
    sold: "Sold", bought: "Bought", returned: "Returned", remain: "Left",
    qty: "Return qty", note: "Note", date: "Date", save: "Save",
    needPick: "Select a name, number or invoice first", needQty: "Enter a return quantity",
    records: "Return records", none: "No returns yet",
    del: "Delete this return?",
    addStock: "Will add back to inventory", removeStock: "Will remove from inventory and return to supplier",
    allReturned: "All quantity on this invoice is already returned",
    customer: "Customer", supplier: "Supplier", invoice: "Invoice",
    samePrice: "Same price", changePrice: "Change price", perPiece: "Per piece",
  };
}

function priceUnit(cat, isUrdu) {
  if (cat === "Chader") return isUrdu ? "/کلو" : "/kg";
  if (cat === "Net") return isUrdu ? "/فٹ" : "/ft";
  return isUrdu ? "/عدد" : "/pc";
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
  const [search, setSearch] = useState("");
  const [saleId, setSaleId] = useState("");
  const [open, setOpen] = useState(false);
  const [qtys, setQtys] = useState({});
  const [hidden, setHidden] = useState({});
  const [priceMode, setPriceMode] = useState({});
  const [customRate, setCustomRate] = useState({});
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const hits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...sales].filter((s) => {
      if (!q) return true;
      const names = [
        s.invoice, s.invoiceNum, s.customer, s.productName, s.date,
        ...(s.items || []).map((it) => it.productName),
      ];
      return names.some((v) => String(v || "").toLowerCase().includes(q));
    }).slice(0, 100).map((s) => ({
      value: String(s._id),
      label: `${s.invoice || s.invoiceNum || "—"} · ${s.customer || "—"} · ${s.date || ""}`,
    }));
  }, [sales, search]);

  const sale = sales.find((s) => String(s._id) === saleId);
  const lines = remainingSaleLines(sale, products, returns);

  const onPick = (hit) => {
    setSaleId(hit.value);
    setSearch(hit.label);
    setOpen(false);
    setHidden({});
    setPriceMode({});
    setCustomRate({});
    const s = sales.find((x) => String(x._id) === hit.value);
    const lns = remainingSaleLines(s, products, returns);
    const next = {};
    lns.forEach((ln) => { next[ln.productId] = String(ln.remain); });
    setQtys(next);
  };

  const onSearchChange = (v) => {
    setSearch(v);
    setOpen(true);
    if (saleId) {
      setSaleId("");
      setQtys({});
      setHidden({});
      setPriceMode({});
      setCustomRate({});
    }
  };

  const save = async () => {
    if (!sale) { alert(T.needPick); return; }
    const items = lines
      .filter((ln) => !hidden[ln.productId])
      .map((ln) => {
        const change = priceMode[ln.productId] === "change";
        const rate = change ? Number(customRate[ln.productId]) : Number(ln.rate) || 0;
        const qty = Math.min(Number(qtys[ln.productId]) || 0, ln.remain);
        return { productId: ln.productId, productName: ln.productName, qty, rate };
      })
      .filter((it) => it.qty > 0);
    if (!items.length) { alert(sale && !lines.length ? T.allReturned : T.needQty); return; }
    setSaving(true);
    const res = await onSave({ saleId: sale._id, date, notes: note, items });
    setSaving(false);
    if (res?.success) onClose();
    else alert(res?.message || "Error");
  };

  const inp = { background: th.input, border: `1px solid ${th.inputBorder}`, color: th.text, borderRadius: 10, padding: "8px 10px", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" };

  return (
    <Modal title={T.saleReturn} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, color: "#34d399", fontSize: 12, fontWeight: 700 }}>{T.addStock}</p>
        <div ref={boxRef} style={{ position: "relative" }}>
          <label style={{ color: th.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block", fontWeight: 600 }}>
            {T.search} <span style={{ color: "#f87171" }}>*</span>
          </label>
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={isUrdu ? "نام / نمبر / انوائس" : "Name / number / invoice"}
            style={inp}
            autoComplete="off"
          />
          {open && (
            <div style={{
              position: "absolute", left: 0, right: 0, top: "100%", zIndex: 40, marginTop: 4,
              maxHeight: 240, overflowY: "auto", borderRadius: 12,
              border: `1px solid ${th.border}`, background: th.bgModal, boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
            }}>
              {hits.length === 0 && (
                <div style={{ padding: "10px 12px", color: th.textMuted, fontSize: 13 }}>{isUrdu ? "کوئی نتیجہ نہیں" : "No matches"}</div>
              )}
              {hits.map((h) => (
                <button
                  key={h.value}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick(h)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "10px 12px",
                    border: "none", cursor: "pointer", background: saleId === h.value ? "rgba(26,188,156,0.12)" : "transparent",
                    color: th.text, fontSize: 13, fontWeight: saleId === h.value ? 700 : 500,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(26,188,156,0.16)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = saleId === h.value ? "rgba(26,188,156,0.12)" : "transparent"; }}
                >
                  {h.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {sale && lines.length === 0 && (
          <p style={{ margin: 0, color: "#f87171", fontWeight: 700, fontSize: 13 }}>{T.allReturned}</p>
        )}
        {sale && lines.filter((ln) => !hidden[ln.productId]).map((ln) => (
          <ReturnItemCard
            key={ln.productId}
            name={ln.productName}
            meta={`${T.sold} ${qtyUnit(ln.category, ln.qty, isUrdu)} · ${T.returned} ${qtyUnit(ln.category, ln.returned, isUrdu)} · ${T.remain} ${qtyUnit(ln.category, ln.remain, isUrdu)}`}
            qtyValue={qtys[ln.productId] ?? ""}
            onQty={(v) => {
              const n = Number(v);
              const capped = Number.isFinite(n) && n > ln.remain ? String(ln.remain) : v;
              setQtys((p) => ({ ...p, [ln.productId]: capped }));
            }}
            remain={ln.remain}
            disabled={ln.remain <= 0}
            soldRate={ln.rate}
            priceMode={priceMode[ln.productId] || "same"}
            onPriceMode={(m) => setPriceMode((p) => ({ ...p, [ln.productId]: m }))}
            customRate={customRate[ln.productId] ?? ""}
            onCustomRate={(v) => setCustomRate((p) => ({ ...p, [ln.productId]: v }))}
            onRemove={() => setHidden((p) => ({ ...p, [ln.productId]: true }))}
            inp={inp}
            T={T}
            isUrdu={isUrdu}
            th={th}
            category={ln.category}
          />
        ))}
        <FInput label={T.date} type="date" value={date} onChange={setDate} />
        <FInput label={T.note} value={note} onChange={setNote} placeholder="..." />
        <SaveBtn onClick={save} loading={saving} label={saving ? "..." : T.save} />
      </div>
    </Modal>
  );
}

export function PurchaseReturnModal({ purchases, products = [], returns, onClose, onSave, seedProductId = "" }) {
  const th = useTheme();
  const { lang } = useLang();
  const isUrdu = lang === "ur";
  const T = L(isUrdu);
  const seedName = (products || []).find((p) => String(p._id) === String(seedProductId))?.name || "";
  const [search, setSearch] = useState(seedName);
  const [picked, setPicked] = useState(seedProductId ? `p:${seedProductId}` : "");
  const [open, setOpen] = useState(false);
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
  const [saving, setSaving] = useState(false);
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
    purchases.forEach((p) => {
      const key = `${p.invoice || p.invoiceNum || "—"}||${p.supplier || ""}||${p.date || ""}`;
      if (!map[key]) map[key] = { key, invoice: p.invoice || p.invoiceNum || "—", supplier: p.supplier || "", date: p.date || "", rows: [] };
      map[key].rows.push(p);
    });
    return Object.values(map);
  }, [purchases]);

  const matchesQ = (q, ...vals) => {
    if (!q) return true;
    return vals.some((v) => String(v || "").toLowerCase().includes(q));
  };

  const hits = useMemo(() => {
    const q = search.trim().toLowerCase();
    const productHits = (products || [])
      .filter((p) => (Number(p.stock) || 0) > 0)
      .filter((p) => matchesQ(q, p.name, p.barcode, p.category, p.brand, p.lastInvoice, p.lastSupplier,
        ...(Array.isArray(p.suppliers) ? p.suppliers.map((s) => s?.name) : [])))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map((p) => ({
        value: `p:${p._id}`,
        label: `${p.name} · ${p.barcode || p.lastInvoice || p.category || ""} · ${qtyUnit(p.category, p.stock, isUrdu)}`,
      }));
    const invoiceHits = groups
      .filter((g) => matchesQ(q, g.invoice, g.supplier, g.date, ...(g.rows || []).map((r) => r.productName)))
      .map((g) => ({
        value: `i:${g.key}`,
        label: `${g.invoice} · ${g.supplier || "—"} · ${g.date}`,
      }));
    return [...productHits, ...invoiceHits].slice(0, 100);
  }, [products, groups, search, isUrdu]);

  const kind = picked.startsWith("i:") ? "invoice" : picked.startsWith("p:") ? "stock" : "";
  const productId = kind === "stock" ? picked.slice(2) : "";
  const invoiceKey = kind === "invoice" ? picked.slice(2) : "";

  const group = groups.find((g) => g.key === invoiceKey);
  const already = returnedQtyMap(returns, (it) => pidOf(it.purchase));
  const lines = (group?.rows || []).map((p) => {
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

  const selectedProd = products.find((p) => String(p._id) === productId);
  const stockLeft = Number(selectedProd?.stock) || 0;
  const mainSup = (() => {
    const list = Array.isArray(selectedProd?.suppliers) ? selectedProd.suppliers : [];
    const main = list.find((s) => s && s.isMain) || list[0];
    return main?.name || selectedProd?.lastSupplier || "";
  })();

  const onPick = (hit) => {
    setPicked(hit.value);
    setSearch(hit.label);
    setOpen(false);
    setQtys({});
    setStockQty("");
    setHidden({});
    setPriceMode({});
    setCustomRate({});
    setStockHidden(false);
    setStockPriceMode("same");
    setStockCustomRate("");
  };

  const onSearchChange = (v) => {
    setSearch(v);
    setOpen(true);
    if (picked) {
      setPicked("");
      setQtys({});
      setStockQty("");
      setHidden({});
      setStockHidden(false);
    }
  };

  const save = async () => {
    if (kind === "stock") {
      if (!productId || stockHidden) { alert(T.needPick); return; }
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
    if (!group) { alert(T.needPick); return; }
    const items = lines
      .filter((ln) => !hidden[ln.purchaseId])
      .map((ln) => {
        const change = priceMode[ln.purchaseId] === "change";
        const rate = change ? Number(customRate[ln.purchaseId]) : Number(ln.rate) || 0;
        return { purchaseId: ln.purchaseId, qty: Number(qtys[ln.purchaseId]) || 0, rate };
      })
      .filter((it) => it.qty > 0);
    if (!items.length) { alert(T.needQty); return; }
    setSaving(true);
    const res = await onSave({ date, notes: note, items });
    setSaving(false);
    if (res?.success) onClose();
    else alert(res?.message || "Error");
  };

  const inp = { background: th.input, border: `1px solid ${th.inputBorder}`, color: th.text, borderRadius: 10, padding: "8px 10px", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box" };

  return (
    <Modal title={T.purchaseReturn} onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ margin: 0, color: "#f87171", fontSize: 12, fontWeight: 700 }}>{T.removeStock}</p>
        <div ref={boxRef} style={{ position: "relative" }}>
          <label style={{ color: th.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6, display: "block", fontWeight: 600 }}>
            {T.search} <span style={{ color: "#f87171" }}>*</span>
          </label>
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder={isUrdu ? "نام / نمبر / انوائس" : "Name / number / invoice"}
            style={inp}
            autoComplete="off"
          />
          {open && (
            <div style={{
              position: "absolute", left: 0, right: 0, top: "100%", zIndex: 40, marginTop: 4,
              maxHeight: 240, overflowY: "auto", borderRadius: 12,
              border: `1px solid ${th.border}`, background: th.bgModal, boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
            }}>
              {hits.length === 0 && (
                <div style={{ padding: "10px 12px", color: th.textMuted, fontSize: 13 }}>{isUrdu ? "کوئی نتیجہ نہیں" : "No matches"}</div>
              )}
              {hits.map((h) => (
                <button
                  key={h.value}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onPick(h)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", padding: "10px 12px",
                    border: "none", cursor: "pointer", background: picked === h.value ? "rgba(26,188,156,0.12)" : "transparent",
                    color: th.text, fontSize: 13, fontWeight: picked === h.value ? 700 : 500,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(26,188,156,0.16)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = picked === h.value ? "rgba(26,188,156,0.12)" : "transparent"; }}
                >
                  {h.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {kind === "stock" && selectedProd && !stockHidden && (
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

        {kind === "invoice" && group && lines.filter((ln) => !hidden[ln.purchaseId]).map((ln) => (
          <ReturnItemCard
            key={ln.purchaseId}
            name={ln.productName}
            meta={`${T.bought} ${qtyUnit(ln.category, ln.qty, isUrdu)} · ${T.returned} ${qtyUnit(ln.category, ln.returned, isUrdu)} · ${T.remain} ${qtyUnit(ln.category, ln.remain, isUrdu)}`}
            qtyValue={qtys[ln.purchaseId] ?? ""}
            onQty={(v) => setQtys((p) => ({ ...p, [ln.purchaseId]: v }))}
            remain={ln.remain}
            disabled={ln.remain <= 0}
            soldRate={ln.rate}
            priceMode={priceMode[ln.purchaseId] || "same"}
            onPriceMode={(m) => setPriceMode((p) => ({ ...p, [ln.purchaseId]: m }))}
            customRate={customRate[ln.purchaseId] ?? ""}
            onCustomRate={(v) => setCustomRate((p) => ({ ...p, [ln.purchaseId]: v }))}
            onRemove={() => setHidden((p) => ({ ...p, [ln.purchaseId]: true }))}
            inp={inp}
            T={T}
            isUrdu={isUrdu}
            th={th}
            category={ln.category}
          />
        ))}

        <FInput label={T.date} type="date" value={date} onChange={setDate} />
        <FInput label={T.note} value={note} onChange={setNote} placeholder="..." />
        <SaveBtn onClick={save} loading={saving} label={saving ? "..." : T.save} />
      </div>
    </Modal>
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
