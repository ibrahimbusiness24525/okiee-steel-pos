import { useEffect, useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { Table, useTypeaheadNav, useResponsive } from "../components/shared";
import { formatPKR, todayStr, formatDateTime } from "../utils/helpers";
import { api } from "../utils/api";
import { productDisplayName } from "../utils/constants";
import { pidOf } from "../components/StockReturns";
import { saleSoldLines } from "../components/InventoryStockTable";

function recordDay(rec) {
  const d = String(rec?.date || "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const iso = String(rec?.createdAt || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : "";
}

function shiftIso(iso, days) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

function stockText(cat, qty) {
  const raw = Number(qty) || 0;
  if (cat === "Chader") {
    const n = Math.round(raw * 1000) / 1000;
    return `${n} kg`;
  }
  if (cat === "Net") {
    const n = Math.round(raw * 100) / 100;
    return `${n} ft`;
  }
  const pcs = Math.round(raw);
  if (cat === "Pipe" || cat === "Hardware" || cat === "Custom") return `${pcs} pcs`;
  return String(pcs);
}

function purchaseQtyFor(bill, id, name) {
  const entries = Array.isArray(bill.entries) ? bill.entries : [];
  if (entries.length) {
    return entries.reduce((sum, e) => {
      const eid = pidOf(e.product || e.productId);
      const en = String(e.productName || e.name || "").trim().toLowerCase();
      if ((id && eid === id) || (name && en === name)) return sum + (Number(e.quantity) || Number(e.qty) || 0);
      return sum;
    }, 0);
  }
  const bid = pidOf(bill.product || bill.productId);
  const bn = String(bill.productName || bill.name || "").trim().toLowerCase();
  if (!((id && bid === id) || (name && bn === name))) return 0;
  const q = Number(bill.qty);
  if (q > 0) return q;
  const fromRows = (bill.rows || []).reduce((s, r) => s + (Number(r.qty) || Number(r.quantity) || Number(r.weight) || Number(r.feet) || 0), 0);
  return fromRows > 0 ? fromRows : 0;
}

function purchaseRate(bill) {
  if (Number(bill.rate) > 0) return Number(bill.rate);
  if (Number(bill.productPrice) > 0) return Number(bill.productPrice);
  const row = (bill.rows || [])[0] || {};
  return Number(row.purchasePrice) || 0;
}

export default function ProductHistoryPage({ products = [], purchases = [], sales = [], saleReturns = [] }) {
  const th = useTheme();
  const { lang } = useLang();
  const { isMobile } = useResponsive();
  const isUrdu = lang === "ur";
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [events, setEvents] = useState([]);
  const today = todayStr();
  const yesterday = shiftIso(today, -1);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const picked = (products || []).find((p) => String(p._id || p.id || "") === selected);
    const pickedLabel = picked ? (productDisplayName(picked) || picked.name || "") : "";
    const searching = q && q.toLowerCase() !== String(pickedLabel).toLowerCase();
    return (products || [])
      .map((p) => ({
        id: String(p._id || p.id || ""),
        label: productDisplayName(p) || p.name || "—",
        product: p,
      }))
      .filter((o) => o.id && (!searching || o.label.toLowerCase().includes(q) || String(o.product.category || "").toLowerCase().includes(q)))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [products, query, selected]);

  const pickProduct = (o) => {
    if (!o) return;
    setSelected(o.id);
    setQuery(o.label);
    setOpen(false);
  };
  const { open, setOpen, hi, setHi, onKeyDown: navKeys, listRef } = useTypeaheadNav(options, pickProduct);

  const product = (products || []).find((p) => String(p._id || p.id || "") === selected) || null;

  useEffect(() => {
    if (!selected) { setEvents([]); return; }
    let live = true;
    api.getActivity({ productId: selected, limit: 800 }).then((r) => {
      if (live) setEvents(r?.activities || []);
    }).catch(() => { if (live) setEvents([]); });
    return () => { live = false; };
  }, [selected]);

  const report = useMemo(() => {
    if (!product) return null;
    const id = String(product._id || product.id || "");
    const name = String(product.name || "").trim().toLowerCase();
    const nameToId = new Map();
    (products || []).forEach((p) => {
      const pid = String(p._id || p.id || "");
      const n = String(p.name || "").trim().toLowerCase();
      if (pid && n) nameToId.set(n, pid);
    });
    const bought = [];
    (purchases || []).forEach((b) => {
      if (b.stockEdit || String(b.notes || "").toLowerCase().includes("stock edit")) return;
      const qty = purchaseQtyFor(b, id, name);
      if (qty <= 0) return;
      bought.push({
        date: recordDay(b) || "—",
        invoice: b.invoice || b.invoiceNum || "—",
        party: b.supplier || b.supplierName || "—",
        qty,
        rate: purchaseRate(b),
        stamp: `${b.date || ""}|${b.createdAt || ""}`,
      });
    });
    bought.sort((a, b) => b.stamp.localeCompare(a.stamp));
    const sold = [];
    (sales || []).forEach((s) => {
      saleSoldLines(s, nameToId).forEach((ln) => {
        if (String(ln.productId) !== id) return;
        sold.push({
          date: recordDay(s) || "—",
          invoice: s.invoice || s.invoiceNum || "—",
          party: s.customer || s.customerName || "—",
          qty: Number(ln.qty) || 0,
          stamp: `${s.date || ""}|${s.createdAt || ""}`,
        });
      });
    });
    sold.sort((a, b) => b.stamp.localeCompare(a.stamp));
    const soldOn = (day) => sold.filter((r) => r.date === day).reduce((s, r) => s + r.qty, 0);
    let returned = 0;
    (saleReturns || []).forEach((r) => {
      (r.items || []).forEach((it) => {
        const iid = pidOf(it.product || it.productId);
        const iname = String(it.productName || it.name || "").trim().toLowerCase();
        if ((id && iid === id) || (name && iname === name)) returned += Number(it.qty) || 0;
      });
    });
    return {
      now: Number(product.stock) || 0,
      today: soldOn(today),
      yesterday: soldOn(yesterday),
      boughtQty: bought.reduce((s, r) => s + r.qty, 0),
      soldQty: Math.max(0, sold.reduce((s, r) => s + r.qty, 0) - returned),
      bought,
      sold,
    };
  }, [product, products, purchases, sales, saleReturns, today, yesterday]);

  const menuBg = th.dark ? "#1a1f2e" : "#ffffff";
  const inputStyle = {
    width: "100%", padding: "11px 12px", paddingInlineEnd: 40, borderRadius: 12, border: `1px solid ${th.inputBorder || th.border}`,
    background: th.dark ? "#161b22" : (th.input || th.bgCard), color: th.text, fontSize: 14, outline: "none",
    boxSizing: "border-box", colorScheme: th.dark ? "dark" : "light",
  };
  const card = {
    flex: "1 1 140px", padding: "12px 14px", borderRadius: 12, border: `1px solid ${th.border}`, background: th.bgCard,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: isMobile ? "stretch" : "center", gap: 14, flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <div style={{ flex: "0 1 auto", minWidth: isMobile ? "100%" : 180 }}>
          <h2 style={{ margin: 0, color: th.text, fontSize: 18 }}>{isUrdu ? "پروڈکٹ ہسٹری" : "Product History"}</h2>
          <p style={{ margin: "4px 0 0", color: th.textMuted, fontSize: 13 }}>
            {isUrdu ? "تلاش کرکے پروڈکٹ چنیں" : "Search and pick a product"}
          </p>
        </div>
        <div style={{ flex: 1, minWidth: isMobile ? "100%" : 260, position: "relative" }}>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setHi(0);
              if (selected) setSelected("");
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={navKeys}
            placeholder={isUrdu ? "تلاش / پروڈکٹ چنیں" : "Search / select a product"}
            style={inputStyle}
            autoComplete="off"
          />
          <span
            onMouseDown={(e) => { e.preventDefault(); setOpen((v) => !v); }}
            style={{ position: "absolute", insetInlineEnd: 12, top: "50%", transform: "translateY(-50%)", color: th.textMuted, cursor: "pointer", fontSize: 12, userSelect: "none" }}
          >{open ? "▴" : "▾"}</span>
          {open && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onMouseDown={(e) => { e.preventDefault(); setOpen(false); }} />
              <div
                ref={listRef}
                style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
                  background: menuBg, color: th.text, border: `1px solid ${th.border}`,
                  borderRadius: 12, maxHeight: 280, overflowY: "auto",
                  boxShadow: th.dark ? "0 12px 32px rgba(0,0,0,0.55)" : "0 8px 24px rgba(15,23,42,0.14)",
                }}
              >
                {options.length === 0
                  ? <div style={{ padding: 14, textAlign: "center", color: th.textDim, fontSize: 13 }}>{isUrdu ? "کوئی پروڈکٹ نہیں ملا" : "No products found"}</div>
                  : options.map((o, i) => (
                    <div
                      key={o.id}
                      data-nav-i={i}
                      onMouseDown={(e) => { e.preventDefault(); pickProduct(o); }}
                      onMouseEnter={() => setHi(i)}
                      style={{
                        padding: "10px 14px", cursor: "pointer",
                        borderBottom: `1px solid ${th.border}`,
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
                        background: i === hi || o.id === selected ? "rgba(26,188,156,0.16)" : "transparent",
                        color: th.text, fontSize: 14,
                      }}
                    >
                      <span style={{ fontWeight: o.id === selected ? 700 : 500 }}>{o.label}</span>
                      {o.product.category && (
                        <span style={{ fontSize: 11, color: th.textMuted, flexShrink: 0 }}>{o.product.category}</span>
                      )}
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      </div>

      {product && report && (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              [isUrdu ? "اب باقی" : "Left now", stockText(product.category, report.now), "#d97706"],
              [isUrdu ? "آج فروخت" : "Sold today", stockText(product.category, report.today), "#059669"],
              [isUrdu ? "کل فروخت" : "Sold yesterday", stockText(product.category, report.yesterday), "#2563eb"],
              [isUrdu ? "کل خریدا" : "Total purchased", stockText(product.category, report.boughtQty), th.text],
              [isUrdu ? "کل فروخت" : "Total sold", stockText(product.category, report.soldQty), th.text],
            ].map(([label, value, color]) => (
              <div key={label} style={card}>
                <div style={{ color: th.textMuted, fontSize: 11, fontWeight: 700 }}>{label}</div>
                <div style={{ color, fontWeight: 800, fontSize: 16, marginTop: 4 }}>{value}</div>
              </div>
            ))}
          </div>

          <div>
            <h3 style={{ margin: "4px 0 8px", color: th.text, fontSize: 15 }}>{isUrdu ? "خریداری" : "Purchases"} · {report.bought.length}</h3>
            <Table
              compact
              cols={[isUrdu ? "تاریخ" : "Date", isUrdu ? "انوائس" : "Invoice", isUrdu ? "سپلائر" : "Supplier", isUrdu ? "مقدار" : "Qty", isUrdu ? "ریٹ" : "Rate"]}
              rows={report.bought.map((r) => ({
                data: r,
                cells: [
                  <span style={{ whiteSpace: "nowrap" }}>{r.date}</span>,
                  <span style={{ fontFamily: "monospace", color: "#b45309" }}>{r.invoice}</span>,
                  r.party,
                  <span style={{ fontWeight: 700 }}>{stockText(product.category, r.qty)}</span>,
                  formatPKR(r.rate),
                ],
              }))}
            />
          </div>
          <div>
            <h3 style={{ margin: "4px 0 8px", color: th.text, fontSize: 15 }}>{isUrdu ? "سب کچھ جو ہوا" : "What happened"} · {events.length}</h3>
            <Table
              compact
              cols={[isUrdu ? "وقت" : "When", isUrdu ? "کیا ہوا" : "Action", isUrdu ? "انوائس" : "Invoice", isUrdu ? "مقدار" : "Qty"]}
              rows={[...events].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).map((a) => ({
                data: a,
                cells: [
                  <span style={{ whiteSpace: "nowrap", fontSize: 12 }}>{formatDateTime(a.date, a.createdAt)}</span>,
                  <span>{a.summary || a.type}{a.party ? ` · ${a.party}` : ""}</span>,
                  <span style={{ fontFamily: "monospace", fontSize: 12 }}>{a.invoice || "—"}</span>,
                  a.fromQty != null && a.toQty != null
                    ? `${stockText(product.category, a.fromQty).replace(/ pcs$| kg$| ft$/, "")} → ${stockText(product.category, a.toQty)}`
                    : (a.qty ? stockText(product.category, a.qty) : "—"),
                ],
              }))}
            />
          </div>
          <div>
            <h3 style={{ margin: "4px 0 8px", color: th.text, fontSize: 15 }}>{isUrdu ? "فروخت" : "Sales"} · {report.sold.length}</h3>
            <Table
              compact
              cols={[isUrdu ? "تاریخ" : "Date", isUrdu ? "انوائس" : "Invoice", isUrdu ? "گاہک" : "Customer", isUrdu ? "مقدار" : "Qty"]}
              rows={report.sold.map((r) => ({
                data: r,
                cells: [
                  <span style={{ whiteSpace: "nowrap" }}>{r.date}</span>,
                  <span style={{ fontFamily: "monospace", color: "#059669" }}>{r.invoice}</span>,
                  r.party,
                  <span style={{ fontWeight: 700 }}>{stockText(product.category, r.qty)}</span>,
                ],
              }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
