import { useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { Table } from "../components/shared";
import { formatPKR, todayStr } from "../utils/helpers";
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
  const n = Math.round((Number(qty) || 0) * 1000) / 1000;
  if (cat === "Chader") return `${n} kg`;
  if (cat === "Net") return `${n} ft`;
  if (cat === "Pipe") return `${n} pcs`;
  return String(n);
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
  const isUrdu = lang === "ur";
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const today = todayStr();
  const yesterday = shiftIso(today, -1);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products || [])
      .map((p) => ({
        id: String(p._id || p.id || ""),
        label: productDisplayName(p) || p.name || "—",
        product: p,
      }))
      .filter((o) => o.id && (!q || o.label.toLowerCase().includes(q) || String(o.product.category || "").toLowerCase().includes(q)))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [products, query]);

  const product = (products || []).find((p) => String(p._id || p.id || "") === selected) || null;

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

  const inputStyle = {
    width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${th.border}`,
    background: th.input || th.bgCard, color: th.text, fontSize: 14, outline: "none",
  };
  const card = {
    flex: "1 1 140px", padding: "12px 14px", borderRadius: 12, border: `1px solid ${th.border}`, background: th.bgCard,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h2 style={{ margin: 0, color: th.text, fontSize: 18 }}>{isUrdu ? "پروڈکٹ ہسٹری" : "Product History"}</h2>
        <p style={{ margin: "4px 0 0", color: th.textMuted, fontSize: 13 }}>
          {isUrdu
            ? "پروڈکٹ چنیں۔ خرید، فروخت، آج، کل، اور اب کتنی باقی ہے سب یہاں ہے۔"
            : "Pick a product to see every purchase, every sale, today, yesterday, and what is left."}
        </p>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={isUrdu ? "نام سے تلاش" : "Search by name"}
        style={inputStyle}
      />
      <select value={selected} onChange={(e) => setSelected(e.target.value)} style={inputStyle}>
        <option value="">{isUrdu ? "پروڈکٹ چنیں" : "Select a product"}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}{o.product.category ? ` · ${o.product.category}` : ""}</option>
        ))}
      </select>

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
