import { useMemo, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { printThermalOrA4, downloadInvoicePdf, todayStr, formatWeightKgG } from "../utils/helpers";
import { productDisplayName } from "../utils/constants";
import { slipPage, slipLine, ThermalSlipHeader, ThermalSlipFooter, shopLabel, fmtPrintedOn } from "./ThermalSlipTheme";

const HIDE_KEY = "steelpos_demand_hide";
const NEED_KEY = "steelpos_demand_need";

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function unitOf(cat) {
  if (cat === "Chader") return "kg";
  if (cat === "Net") return "ft";
  return "pcs";
}

function stockText(cat, qty) {
  if (cat === "Chader") return formatWeightKgG(qty);
  const n = Math.round((Number(qty) || 0) * 1000) / 1000;
  return `${n} ${unitOf(cat)}`;
}

function needText(cat, raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  if (/[a-zA-Z\u0600-\u06FF]/.test(text)) return text;
  return `${text} ${unitOf(cat)}`;
}

export default function DemandList({ products = [] }) {
  const th = useTheme();
  const { lang } = useLang();
  const isUrdu = lang === "ur";
  const [below, setBelow] = useState("");
  const [search, setSearch] = useState("");
  const [hidden, setHidden] = useState(() => new Set(readJson(HIDE_KEY, [])));
  const [need, setNeed] = useState(() => readJson(NEED_KEY, {}));
  const [pdfBusy, setPdfBusy] = useState(false);

  const hide = (id) => {
    setHidden((prev) => {
      const next = new Set(prev);
      next.add(id);
      localStorage.setItem(HIDE_KEY, JSON.stringify([...next]));
      return next;
    });
  };
  const restore = () => {
    setHidden(new Set());
    localStorage.setItem(HIDE_KEY, "[]");
  };
  const setNeedQty = (id, value) => {
    setNeed((prev) => {
      const next = { ...prev, [id]: value };
      localStorage.setItem(NEED_KEY, JSON.stringify(next));
      return next;
    });
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const raw = below.trim();
    const cap = raw === "" ? null : Number(raw);
    const onlyZero = cap == null || !Number.isFinite(cap) || cap <= 0;
    return (products || [])
      .map((p) => ({
        id: String(p._id || p.id || ""),
        name: productDisplayName(p) || p.name || "—",
        category: p.category || "",
        stock: Number(p.stock) || 0,
        product: p,
      }))
      .filter((p) => p.id && !hidden.has(p.id))
      .filter((p) => (onlyZero ? p.stock <= 0 : p.stock < cap))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));
  }, [products, hidden, below, search]);
  const printRows = rows.filter((r) => String(need[r.id] || "").trim());

  const inputStyle = {
    padding: "8px 10px", borderRadius: 10, border: `1px solid ${th.border}`,
    background: th.input || th.bgCard, color: th.text, fontSize: 13, outline: "none",
  };

  return (
    <div>
      <p style={{ margin: "0 0 12px", color: th.textMuted, fontSize: 13, lineHeight: 1.45 }}>
        {isUrdu
          ? "چاہیے میں مقدار لکھیں۔ پرنٹ اور پی ڈی ایف میں صرف وہی آئٹمز آئیں گی جن کی مقدار لکھی ہو۔"
          : "Write the quantity you need. Print and PDF include only the items that have a quantity."}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isUrdu ? "نام" : "Name"}
          style={{ ...inputStyle, flex: "1 1 160px", minWidth: 140 }}
        />
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: th.textMuted, fontSize: 12, fontWeight: 700 }}>
          {isUrdu ? "اس سے کم اسٹاک" : "Stock below"}
          <input
            value={below}
            onChange={(e) => setBelow(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            style={{ ...inputStyle, width: 90 }}
          />
        </label>
        <button type="button" disabled={!printRows.length} onClick={() => printThermalOrA4("thermal")} style={printBtn("#0f766e", printRows.length)}>
          {isUrdu ? "تھرمل" : "Thermal"}
        </button>
        <button type="button" disabled={!printRows.length} onClick={() => printThermalOrA4("a4")} style={printBtn("#1d4ed8", printRows.length)}>
          A4
        </button>
        <button
          type="button"
          disabled={!printRows.length || pdfBusy}
          onClick={async () => {
            if (!printRows.length || pdfBusy) return;
            setPdfBusy(true);
            try { await downloadInvoicePdf(`demand-${todayStr()}`, "demand-pdf-sheet"); }
            finally { setPdfBusy(false); }
          }}
          style={printBtn("#5b21b6", printRows.length && !pdfBusy)}
        >
          {pdfBusy ? (isUrdu ? "پی ڈی ایف بن رہی ہے" : "Making PDF...") : "PDF"}
        </button>
        {hidden.size > 0 && (
          <button type="button" onClick={restore} style={{ ...printBtn(th.thHead || "#334155", 1), color: th.text }}>
            {isUrdu ? `ہٹے ہوئے واپس (${hidden.size})` : `Restore removed (${hidden.size})`}
          </button>
        )}
      </div>

      <div style={{ border: `1px solid ${th.border}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: th.thHead }}>
              {[isUrdu ? "نام" : "Name", isUrdu ? "اسٹاک" : "Stock", isUrdu ? "کتنی چاہیے" : "How many needed", ""].map((h) => (
                <th key={h || "x"} style={{ textAlign: "left", padding: "8px 10px", color: th.textMuted, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${th.border}` }}>
                <td style={{ padding: "8px 10px", fontWeight: 700, color: th.text }}>
                  {r.name}
                  <div style={{ fontWeight: 500, color: th.textMuted, fontSize: 11 }}>{r.category || "—"}</div>
                </td>
                <td style={{ padding: "8px 10px", color: r.stock <= 0 ? "#f87171" : "#d97706", fontWeight: 800, whiteSpace: "nowrap" }}>
                  {stockText(r.category, r.stock)}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <input
                    value={need[r.id] || ""}
                    onChange={(e) => setNeedQty(r.id, e.target.value)}
                    placeholder={isUrdu ? "مقدار" : "Qty"}
                    style={{ ...inputStyle, width: 110 }}
                  />
                </td>
                <td style={{ padding: "8px 10px", textAlign: "right" }}>
                  <button
                    type="button"
                    onClick={() => hide(r.id)}
                    style={{ padding: "6px 10px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(248,113,113,0.15)", color: "#f87171", fontWeight: 700, fontSize: 12 }}
                  >
                    {isUrdu ? "ہٹائیں" : "Remove"}
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={4} style={{ padding: 28, textAlign: "center", color: th.textMuted }}>
                  {isUrdu ? "اس فلٹر میں کوئی آئٹم نہیں" : "No items for this filter"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }} aria-hidden="true">
        <DemandPdfSheet rows={printRows} need={need} below={below} isUrdu={isUrdu} />
        <div id="thermal-invoice" style={slipPage}>
          <ThermalSlipHeader title={isUrdu ? "ڈیمانڈ" : "DEMAND"} isUrdu={isUrdu} />
          <div style={{ textAlign: "center", fontSize: "10px", marginTop: 6, fontWeight: 700 }}>
            {isUrdu ? "تاریخ" : "Date"}: {todayStr()} · {printRows.length}
          </div>
          <div style={slipLine} />
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={thS("left")}>{isUrdu ? "آئٹم" : "Item"}</th>
                <th style={thS("right")}>{isUrdu ? "چاہیے" : "Need"}</th>
              </tr>
            </thead>
            <tbody>
              {printRows.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...tdS("left"), fontWeight: 700 }}>
                    {r.name}
                    {r.category ? <div style={{ fontWeight: 400, fontSize: "9px" }}>{r.category}</div> : null}
                  </td>
                  <td style={{ ...tdS("right"), fontWeight: 800 }}>{needText(r.category, need[r.id])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ThermalSlipFooter isUrdu={isUrdu} role="admin" />
        </div>
      </div>
    </div>
  );
}

function DemandPdfSheet({ rows, need, below, isUrdu }) {
  const { shopName, address, contactLines, phoneBar, logo } = shopLabel(isUrdu);
  const phones = (contactLines && contactLines.length) ? contactLines : [{ name: "", phone: phoneBar }];
  const cap = below.trim();
  const filterLabel = cap && Number(cap) > 0
    ? (isUrdu ? `اسٹاک ${cap} سے کم` : `Stock below ${cap}`)
    : (isUrdu ? "صرف زیرو اسٹاک" : "Zero stock only");
  const head = (align, width) => ({
    textAlign: align, padding: "9px 8px", fontSize: 11, fontWeight: 800,
    letterSpacing: "0.04em", textTransform: "uppercase", color: "#fff",
    background: "#111827", width,
  });
  const cell = (align) => ({
    textAlign: align, padding: "8px 8px", fontSize: 13,
    borderBottom: "1px solid #e5e7eb", verticalAlign: "middle", color: "#111827",
  });
  const stat = (label, value) => (
    <div key={label} style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "7px 10px", background: "#f8fafc" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2, color: "#111827" }}>{value}</div>
    </div>
  );

  return (
    <div id="demand-pdf-sheet" style={{ width: 720, background: "#fff", color: "#111827", fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif", padding: "6px 4px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, borderBottom: "3px solid #111827", paddingBottom: 12 }}>
        {logo ? <img src={logo} alt="" style={{ width: 56, height: 56, objectFit: "contain" }} /> : null}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1 }}>{shopName}</div>
          {address ? <div style={{ fontSize: 12, color: "#374151", marginTop: 3 }}>{address}</div> : null}
          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>
            {phones.map((c, i) => (
              <span key={i}>{i ? "   ·   " : ""}{c.name ? `${c.name}: ` : ""}{c.phone}</span>
            ))}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "0.08em" }}>{isUrdu ? "ڈیمانڈ لسٹ" : "DEMAND LIST"}</div>
          <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>{fmtPrintedOn(isUrdu)}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        {stat(isUrdu ? "آئٹمز" : "Items", String(rows.length))}
        {stat(isUrdu ? "فلٹر" : "Filter", filterLabel)}
      </div>

      <table className="inv-items" style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={head("center", 40)}>#</th>
            <th style={head("left")}>{isUrdu ? "آئٹم" : "Item"}</th>
            <th style={head("left", 140)}>{isUrdu ? "قسم" : "Category"}</th>
            <th style={head("right", 140)}>{isUrdu ? "آرڈر مقدار" : "Order qty"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
              <tr key={r.id} style={{ background: i % 2 ? "#f3f4f6" : "#fff" }}>
                <td style={{ ...cell("center"), color: "#6b7280", fontWeight: 700 }}>{i + 1}</td>
                <td style={{ ...cell("left"), fontWeight: 800 }}>{r.name}</td>
                <td style={{ ...cell("left"), color: "#374151" }}>{r.category || "—"}</td>
                <td style={{ ...cell("right"), fontWeight: 800, fontSize: 14 }}>{needText(r.category, need[r.id])}</td>
              </tr>
            ))}
        </tbody>
      </table>

    </div>
  );
}

function printBtn(bg, count) {
  return {
    padding: "8px 12px", borderRadius: 10, border: "none",
    background: bg, color: "#fff", fontWeight: 700, fontSize: 12,
    cursor: count ? "pointer" : "not-allowed", opacity: count ? 1 : 0.45, whiteSpace: "nowrap",
  };
}
function thS(align) {
  return { padding: "5px 2px", fontWeight: 700, fontSize: "10px", textAlign: align, borderBottom: "1px solid #000", borderTop: "1px solid #000" };
}
function tdS(align) {
  return { padding: "4px 2px", fontSize: "10px", textAlign: align, verticalAlign: "top" };
}
