import { useState, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { Table, Modal } from "./shared";
import { formatPKR, formatWeightKgG, loadShopProfile, printThermalOrA4, todayStr } from "../utils/helpers";
import { productDisplayName } from "../utils/constants";
import { pidOf } from "./StockReturns";

const HW_ITEM_CATS = ["Nuts", "Bolts", "Screws", "Washers", "Hinges", "Locks", "Tools", "Fittings", "Valves", "Other"];
const MAIN_CATS = ["Pipe", "Chader", "Net", "Hardware", "Custom"];
const HW_CATS_LS = "steelpos_hw_categories";

function loadHwCats() {
  try {
    const raw = localStorage.getItem(HW_CATS_LS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed.map(String);
    }
  } catch { /* ignore */ }
  return HW_ITEM_CATS;
}

const getUrduItemLabel = (cat) => {
  switch (cat) {
    case "Pipe": return "پائپ";
    case "Chader": return "چادر";
    case "Net": return "جال";
    case "Hardware": return "ہارڈ ویئر";
    case "Custom": return "آئٹم";
    default: return "آئٹم";
  }
};

export function inventoryStats(products = [], lotOpts) {
  const stockOf = (p) => Number(p.stock) || 0;
  const thresholdOf = (p) => {
    const n = Number(p.lowStockThreshold);
    return Number.isFinite(n) && n > 0 ? n : 10;
  };
  const inStock = products.filter((p) => stockOf(p) > 0);
  const demandZero = products.filter((p) => stockOf(p) <= 0);
  const demandLow = products.filter((p) => {
    const s = stockOf(p);
    return s > 0 && s <= thresholdOf(p);
  });
  const ctx = lotOpts ? (lotOpts.ctx || makeLotContext(lotOpts)) : null;
  const inventoryAmount = inStock.reduce((s, p) => {
    if (ctx) return s + (Number(lotsFromContext(p, ctx).costValue) || 0);
    const { cost } = costAndSale(p);
    return s + stockOf(p) * (Number(cost) || 0);
  }, 0);
  return { stockedCount: inStock.length, inventoryAmount, demandZero, demandLow, stockOf, thresholdOf };
}

function stockLabel(cat, qty) {
  return cat === "Pipe" ? `${Math.round(qty || 0)} pcs`
    : cat === "Chader" ? formatWeightKgG(qty || 0)
    : cat === "Net" ? `${Math.round(qty || 0)} ft²`
    : String(Math.round(qty || 0));
}

function costAndSale(product) {
  if (!product) return { cost: 0, sale: 0 };
  if (product.category === "Pipe") {
    return { cost: Number(product.price) || 0, sale: Number(product.purchasePrice) || 0 };
  }
  return {
    cost: Number(product.purchasePrice) || 0,
    sale: Number(product.price) || 0,
  };
}

function purchaseQty(p) {
  const q = Number(p.qty);
  if (q > 0) return q;
  return (p.rows || []).reduce((s, r) => s + (Number(r.qty) || Number(r.quantity) || Number(r.weight) || Number(r.feet) || 0), 0);
}

function purchaseUnitCost(p, product) {
  if (Number(p.rate) > 0) return Number(p.rate);
  if (Number(p.productPrice) > 0) return Number(p.productPrice);
  const row = (p.rows || [])[0] || {};
  const fromRow = Number(row.purchasePrice) || Number(row.purchasePricePerFeet) || 0;
  if (fromRow > 0) return fromRow;
  const qty = purchaseQty(p);
  if (qty > 0 && Number(p.total) > 0) return Number(p.total) / qty;
  return costAndSale(product).cost;
}

function stampOf(p) {
  return `${p.date || ""}|${p.createdAt || ""}`;
}

function invoiceKey(p) {
  const inv = String(p?.invoice || p?.invoiceNum || "").trim();
  return inv && inv !== "—" ? inv : "";
}

function purchasePayMap(purchases = []) {
  const map = {};
  (purchases || []).forEach((p) => {
    const key = invoiceKey(p) || String(p._id || p.id || "");
    if (!key) return;
    if (!map[key]) {
      map[key] = { total: 0, remaining: 0, paid: 0, method: "", settlement: "" };
    }
    map[key].total += Number(p.total) || Number(p.grandTotal) || 0;
    if (p.remainingAmount != null && p.remainingAmount !== "") {
      map[key].remaining = Math.max(map[key].remaining, Number(p.remainingAmount) || 0);
    }
    if (p.paidAmount != null && p.paidAmount !== "") {
      map[key].paid = Math.max(map[key].paid, Number(p.paidAmount) || 0);
    }
    if (p.paymentMethod) map[key].method = p.paymentMethod;
    if (p.settlement) map[key].settlement = p.settlement;
  });
  return map;
}

function cashCreditShares(info) {
  if (!info) return { cash: 1, credit: 0 };
  const remaining = Number(info.remaining) || 0;
  let total = Number(info.total) || 0;
  const paid = Number(info.paid) || 0;
  if (total <= 0 && paid + remaining > 0) total = paid + remaining;
  const method = String(info.method || "").toLowerCase();
  const settlement = String(info.settlement || "").toLowerCase();
  const isCredit = settlement === "credit" || method === "credit" || remaining > 0.5;
  if (!isCredit) return { cash: 1, credit: 0 };
  if (total > 0 && remaining > 0.5) {
    const credit = Math.min(1, Math.max(0, remaining / total));
    return { cash: 1 - credit, credit };
  }
  return { cash: 0, credit: 1 };
}

function qtyFromMaps(byId, byName, product) {
  const id = pidOf(product?._id || product?.id);
  const name = String(product?.name || "").trim().toLowerCase();
  if (id && byId[id]) return byId[id];
  if (name && byName[name]) return byName[name];
  return 0;
}

function addQtyMaps(returns, byId, byName) {
  (returns || []).forEach((r) => {
    (r.items || []).forEach((it) => {
      const q = Number(it.qty) || 0;
      if (q <= 0) return;
      const id = pidOf(it.product || it.productId);
      const name = String(it.productName || it.name || "").trim().toLowerCase();
      if (id) byId[id] = (byId[id] || 0) + q;
      if (name) byName[name] = (byName[name] || 0) + q;
    });
  });
}

function saleSoldLines(sale, nameToId) {
  const lines = [];
  const seen = new Set();
  const resolveId = (raw, name) => {
    const id = pidOf(raw);
    if (id) return id;
    const n = String(name || "").toLowerCase().trim();
    return n ? (nameToId.get(n) || "") : "";
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
    lines.push({
      productId: String(id),
      productName: extra.productName || "",
      qty: q,
    });
  };
  if (Array.isArray(sale.saleItems)) {
    sale.saleItems.forEach((si) => push(si.productId || si.product, si.qty, { productName: si.productName }));
  }
  if (Array.isArray(sale.items)) {
    sale.items.forEach((it) => push(it.productId || it.product, qtyFromItem(it), { productName: it.productName }));
  }
  if (!lines.length && sale.product) {
    push(sale.product, sale.qty, { productName: sale.productName || "" });
  }
  return lines;
}

export function makeLotContext({ purchases = [], sales = [], purchaseReturns = [], saleReturns = [], products = [] } = {}) {
  const nameToId = new Map();
  const idToName = new Map();
  (products || []).forEach((p) => {
    const id = pidOf(p?._id || p?.id);
    const name = String(p?.name || "").trim().toLowerCase();
    if (id && name) nameToId.set(name, id);
    if (id && name) idToName.set(id, name);
  });

  const purchById = {};
  const purchByName = {};
  const pushLot = (map, key, lot) => {
    if (!key) return;
    if (!map[key]) map[key] = [];
    map[key].push(lot);
  };
  (purchases || []).forEach((p) => {
    const makeLot = (qty, unitCost) => {
      const bought = Number(qty) || 0;
      if (bought <= 0) return null;
      return {
        date: p.date || "—",
        invoice: p.invoice || p.invoiceNum || "—",
        supplier: p.supplier || p.supplierName || "—",
        bought,
        remaining: bought,
        unitCost: Number(unitCost) || 0,
        createdAt: p.createdAt || "",
      };
    };
    const entries = Array.isArray(p.entries) ? p.entries : [];
    if (entries.length) {
      entries.forEach((e) => {
        const lot = makeLot(e.quantity || e.qty, e.productPrice || e.rate || e.purchasePrice);
        if (!lot) return;
        const id = pidOf(e.product || e.productId);
        const name = String(e.productName || e.name || "").trim().toLowerCase();
        pushLot(purchById, id, lot);
        pushLot(purchByName, name, lot);
      });
    } else {
      const lot = makeLot(purchaseQty(p), purchaseUnitCost(p, null));
      if (!lot) return;
      const id = pidOf(p.product || p.productId);
      const name = String(p.productName || p.name || "").trim().toLowerCase();
      pushLot(purchById, id, lot);
      pushLot(purchByName, name, lot);
    }
  });

  const soldById = {};
  const soldByName = {};
  (sales || []).forEach((s) => {
    saleSoldLines(s, nameToId).forEach((ln) => {
      const q = Number(ln.qty) || 0;
      if (q <= 0) return;
      const id = String(ln.productId || "");
      const name = String(ln.productName || "").trim().toLowerCase() || (id && idToName.get(id)) || "";
      if (id) soldById[id] = (soldById[id] || 0) + q;
      if (name) soldByName[name] = (soldByName[name] || 0) + q;
    });
  });

  const saleRetById = {};
  const saleRetByName = {};
  const purchRetById = {};
  const purchRetByName = {};
  addQtyMaps(saleReturns, saleRetById, saleRetByName);
  addQtyMaps(purchaseReturns, purchRetById, purchRetByName);

  return {
    purchById,
    purchByName,
    soldById,
    soldByName,
    saleRetById,
    saleRetByName,
    purchRetById,
    purchRetByName,
  };
}

function lotsFromContext(product, ctx) {
  const fallback = costAndSale(product).cost;
  const stock = Number(product?.stock) || 0;
  const id = pidOf(product?._id || product?.id);
  const name = String(product?.name || "").trim().toLowerCase();
  const raw = (id && ctx.purchById[id]?.length) ? ctx.purchById[id] : (ctx.purchByName[name] || []);
  const lots = raw.map((l) => ({
    ...l,
    remaining: l.bought,
    unitCost: Number(l.unitCost) || fallback,
  }));

  lots.sort((a, b) => stampOf(a).localeCompare(stampOf(b)));

  const sold = qtyFromMaps(ctx.soldById, ctx.soldByName, product);
  const saleRet = qtyFromMaps(ctx.saleRetById, ctx.saleRetByName, product);
  const purchRet = qtyFromMaps(ctx.purchRetById, ctx.purchRetByName, product);
  let consume = Math.max(0, sold - saleRet) + purchRet;

  for (const lot of lots) {
    if (consume <= 0) break;
    const take = Math.min(lot.remaining, consume);
    lot.remaining -= take;
    consume -= take;
  }

  let held = lots.reduce((s, l) => s + l.remaining, 0);
  if (held > stock) {
    let extra = held - stock;
    for (const lot of lots) {
      if (extra <= 0) break;
      const take = Math.min(lot.remaining, extra);
      lot.remaining -= take;
      extra -= take;
    }
    held = stock;
  } else if (stock > held + 0.0001) {
    lots.push({
      date: "—",
      invoice: "—",
      supplier: "—",
      bought: stock - held,
      remaining: stock - held,
      unitCost: fallback,
      createdAt: "",
      opening: true,
    });
    held = stock;
  }

  const remaining = lots.filter((l) => l.remaining > 0.0001);
  const costValue = remaining.reduce((s, l) => s + l.remaining * l.unitCost, 0);
  const avgCost = held > 0 ? costValue / held : fallback;
  const sale = costAndSale(product).sale;
  const profitPc = sale - avgCost;
  const remainingNewest = remaining.slice().sort((a, b) => {
    const stampA = `${a.date || ""}|${a.createdAt || ""}`;
    const stampB = `${b.date || ""}|${b.createdAt || ""}`;
    return stampB.localeCompare(stampA);
  });
  return {
    remaining: remainingNewest,
    allLots: lots,
    stock: held,
    avgCost: Math.round((Number(avgCost) || 0) * 100) / 100,
    costValue,
    sale,
    profitPc,
    profitStock: profitPc * held,
    sold: Math.max(0, sold - saleRet),
    purchRet,
  };
}

export function stockLotsForProduct(product, opts = {}) {
  const ctx = opts.ctx || makeLotContext(opts);
  return lotsFromContext(product, ctx);
}

function InventoryPrintSheet({ rows, total, isUrdu, kind }) {
  const sp = loadShopProfile();
  const ownerLines = (sp.owners || []).filter((o) => o.name || o.nameUr);
  const shopName = isUrdu ? (sp.shopNameUr || sp.shopName) : sp.shopName;
  const address = isUrdu ? (sp.addressUr || sp.address) : sp.address;
  const page = {
    width: "65mm", margin: "0 auto",
    fontFamily: "Arial, sans-serif", fontSize: "13px",
    color: "#000", background: "#fff",
    padding: "8px 8px 12px", boxSizing: "border-box",
  };
  const center = { textAlign: "center" };
  const dash = { borderTop: "1px dashed #000", margin: "8px 0" };
  const tbl = { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" };
  const thS = (align) => ({
    padding: "5px 2px", fontWeight: 700, fontSize: "10px",
    textAlign: align || "center", borderBottom: "1px solid #000",
  });
  const tdS = (align) => ({
    padding: "4px 2px", fontSize: "10px",
    textAlign: align || "center", verticalAlign: "top",
    wordBreak: "break-word",
  });
  const reportTitle = kind === "demand"
    ? (isUrdu ? "ڈیمانڈ رپورٹ" : "DEMAND REPORT")
    : (isUrdu ? "اسٹاک لسٹ رپورٹ" : "STOCK LIST REPORT");

  return (
    <div id="thermal-invoice" style={page}>
      {sp.logoBase64 && (
        <div style={{ ...center, marginBottom: 6 }}>
          <img src={sp.logoBase64} alt="logo" style={{ maxWidth: 56, maxHeight: 40, objectFit: "contain" }} />
        </div>
      )}
      <div style={{ ...center, fontSize: "20px", fontWeight: 800, lineHeight: "24px" }}>{shopName || "STEELPOS"}</div>
      {address && <div style={{ ...center, fontSize: "10px", marginTop: 4 }}>{address}</div>}
      {ownerLines[0] && (
        <div style={{ ...center, fontSize: "10px", marginTop: 2 }}>
          {(isUrdu ? ownerLines[0].nameUr : ownerLines[0].name) || ownerLines[0].name}: {ownerLines[0].phone}
        </div>
      )}
      <div style={dash} />
      <div style={{ ...center, fontWeight: 800, fontSize: "14px", letterSpacing: "0.4px" }}>
        {reportTitle}
      </div>
      <div style={{ ...center, fontSize: "10px", marginTop: 4 }}>
        {isUrdu ? "تاریخ" : "Date"}: {todayStr()} · {rows.length} {isUrdu ? "آئٹمز" : "items"}
      </div>
      <div style={dash} />
      <table className="inv-items" style={tbl}>
        <thead>
          <tr>
            <th style={{ ...thS("center"), width: "10%" }}>{isUrdu ? "#" : "#"}</th>
            <th style={{ ...thS("left"), width: "42%" }}>{isUrdu ? "آئٹم" : "Item"}</th>
            <th style={{ ...thS("center"), width: "22%" }}>{isUrdu ? "اسٹاک" : "Stock"}</th>
            <th style={{ ...thS("right"), width: "26%" }}>{isUrdu ? "مالیت" : "Value"}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={tdS("center")}>{i + 1}</td>
              <td style={{ ...tdS("left"), fontWeight: 600 }}>
                {r.name}
                {r.category ? <div style={{ fontWeight: 400, fontSize: "9px" }}>{r.category}</div> : null}
              </td>
              <td style={tdS("center")}>{r.stock}</td>
              <td style={tdS("right")}>{formatPKR(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={dash} />
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: "14px" }}>
        <span>{isUrdu ? "کل مالیت" : "TOTAL VALUE"}</span>
        <span>{formatPKR(total)}</span>
      </div>
      <div style={dash} />
      <div style={{ ...center, fontWeight: 700, fontSize: "11px", marginTop: 4 }}>OKIIEE SOFTWARE COMPANY</div>
    </div>
  );
}

function MiniStat({ label, value, color, th }) {
  return (
    <div style={{ flex: 1, minWidth: 120, padding: "10px 12px", borderRadius: 12, border: `1px solid ${th.border}`, background: th.bgCard }}>
      <div style={{ color: th.textMuted, fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
      <div style={{ color: color || th.text, fontSize: 15, fontWeight: 800, whiteSpace: "nowrap" }}>{value}</div>
    </div>
  );
}

function StockDetailView({ product, lots, onClose, isUrdu, th, t }) {
  const name = productDisplayName(product) || product.name || "—";
  const profitColor = lots.profitPc >= 0 ? "#34d399" : "#f87171";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ color: th.text, fontWeight: 800, fontSize: 16 }}>{name}</div>
        <div style={{ color: th.textMuted, fontSize: 12, marginTop: 4 }}>
          {product.category || "—"}
          {product.barcode ? ` · ${product.barcode}` : ""}
          {" · "}{isUrdu ? "اسٹاک" : "Stock"} {stockLabel(product.category, lots.stock)}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <MiniStat th={th} label={isUrdu ? "اوسط لاگت / پیس" : "Avg cost / pc"} value={formatPKR(lots.avgCost)} />
        <MiniStat th={th} label={isUrdu ? "فروخت قیمت / پیس" : "Sale / pc"} value={formatPKR(lots.sale)} />
        <MiniStat th={th} label={isUrdu ? "منافع / پیس" : "Profit / pc"} value={formatPKR(lots.profitPc)} color={profitColor} />
        <MiniStat th={th} label={isUrdu ? "کل منافع (اسٹاک)" : "Profit on stock"} value={formatPKR(lots.profitStock)} color={profitColor} />
      </div>

      <p style={{ color: th.textMuted, fontSize: 12, margin: 0, lineHeight: 1.45 }}>
        {isUrdu
          ? "موجودہ اسٹاک کی اوسط خرید قیمت۔ فروخت اسی اوسط لاگت پر منافع کے ساتھ شمار ہوتی ہے۔"
          : "Available stock is valued at the average purchase price of remaining lots. Selling uses this average cost to calculate profit."}
      </p>

      <div>
        <div style={{ color: th.text, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
          {isUrdu ? "اسٹاک کن خریداریوں سے ہے" : "Stock on hand — purchased on"}
        </div>
        <Table
          compact
          cols={[
            t.date,
            t.invoiceNum,
            t.supplier,
            t.stock,
            isUrdu ? "فی پیس لاگت" : "Cost / pc",
            t.totalLabel,
          ]}
          rows={lots.remaining.map((l) => ({
            data: l,
            cells: [
              <span style={{ whiteSpace: "nowrap", fontSize: 12 }}>{l.opening ? (isUrdu ? "پرانا / اوپننگ" : "Opening") : l.date}</span>,
              <span style={{ fontFamily: "monospace", color: "#60a5fa", fontSize: 12, whiteSpace: "nowrap" }}>{l.invoice}</span>,
              <span style={{ whiteSpace: "nowrap" }}>{l.supplier}</span>,
              <span style={{ fontWeight: 700, color: "#34d399", whiteSpace: "nowrap" }}>{stockLabel(product.category, l.remaining)}</span>,
              <span style={{ whiteSpace: "nowrap", fontSize: 12 }}>{formatPKR(l.unitCost)}</span>,
              <span style={{ fontWeight: 700, whiteSpace: "nowrap", fontSize: 12 }}>{formatPKR(l.remaining * l.unitCost)}</span>,
            ],
          }))}
        />
        {!lots.remaining.length && (
          <p style={{ color: th.textMuted, fontSize: 13, margin: "8px 0 0" }}>{isUrdu ? "کوئی خریداری ریکارڈ نہیں" : "No purchase lots on record"}</p>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", padding: "10px 12px", borderRadius: 12, border: `1px solid ${th.border}`, background: th.bgCard }}>
        <span style={{ color: th.textMuted, fontSize: 13 }}>
          {isUrdu ? "فروخت شدہ" : "Sold"} {stockLabel(product.category, lots.sold)}
          {lots.purchRet > 0 ? ` · ${isUrdu ? "واپسی" : "Returned"} ${stockLabel(product.category, lots.purchRet)}` : ""}
        </span>
        <span style={{ color: th.text, fontWeight: 800, fontSize: 13, whiteSpace: "nowrap" }}>
          {isUrdu ? "اسٹاک مالیت" : "Stock value"} · {formatPKR(lots.costValue)}
        </span>
      </div>

      <button type="button" onClick={onClose} style={{ padding: "10px 14px", borderRadius: 10, border: `1px solid ${th.border}`, background: th.thHead, color: th.text, fontWeight: 700, cursor: "pointer" }}>
        {isUrdu ? "واپس" : "Back"}
      </button>
    </div>
  );
}

export default function InventoryStockTable({ products = [], purchases = [], sales = [], purchaseReturns = [], saleReturns = [], onReturn, kind = "inventory" }) {
  const th = useTheme();
  const { t, lang } = useLang();
  const isUrdu = lang === "ur";
  const isDemand = kind === "demand";
  const [invSearch, setInvSearch] = useState("");
  const [invCat, setInvCat] = useState("");
  const [detail, setDetail] = useState(null);

  const lotCtx = useMemo(
    () => makeLotContext({ purchases, sales, purchaseReturns, saleReturns, products }),
    [purchases, sales, purchaseReturns, saleReturns, products]
  );
  const lotsByKey = useMemo(() => {
    const m = new Map();
    (products || []).forEach((p) => {
      m.set(String(p._id || p.id || p.name || ""), lotsFromContext(p, lotCtx));
    });
    return m;
  }, [products, lotCtx]);
  const lotsOf = (p) => lotsByKey.get(String(p._id || p.id || p.name || "")) || lotsFromContext(p, lotCtx);
  const payMap = useMemo(() => purchasePayMap(purchases), [purchases]);

  const stockOf = (p) => Number(p.stock) || 0;
  const thresholdOf = (p) => {
    const n = Number(p.lowStockThreshold);
    return Number.isFinite(n) && n > 0 ? n : 10;
  };
  const qInv = invSearch.trim().toLowerCase();
  const matchesInvSearch = (p) => {
    if (!qInv) return true;
    return (p.name || "").toLowerCase().includes(qInv)
      || (p.barcode || "").toLowerCase().includes(qInv)
      || (p.category || "").toLowerCase().includes(qInv)
      || (p.brand || "").toLowerCase().includes(qInv)
      || (p.subType || "").toLowerCase().includes(qInv)
      || (p.lastInvoice || "").toLowerCase().includes(qInv)
      || String(billOf(p)?.invoice || billOf(p)?.invoiceNum || "").toLowerCase().includes(qInv)
      || (p.lastSupplier || "").toLowerCase().includes(qInv)
      || (Array.isArray(p.suppliers) ? p.suppliers.some((s) => (s?.name || "").toLowerCase().includes(qInv)) : false)
      || (p.hwCategory || "").toLowerCase().includes(qInv)
      || (p.subCategory || "").toLowerCase().includes(qInv);
  };
  const itemCatOf = (p) => String(p.subType || p.hwCategory || p.subCategory || "").trim();
  const matchesInvCat = (p) => {
    if (!invCat) return true;
    const want = invCat.toLowerCase();
    if (MAIN_CATS.some((c) => c.toLowerCase() === want)) {
      return String(p.category || "").toLowerCase() === want;
    }
    return itemCatOf(p).toLowerCase() === want;
  };
  const savedHwCats = loadHwCats();
  const extraHwCats = [];
  (products || []).forEach((p) => {
    const sub = itemCatOf(p);
    if (sub && !savedHwCats.some((c) => c.toLowerCase() === sub.toLowerCase()) && !MAIN_CATS.includes(sub)) {
      extraHwCats.push(sub);
    }
  });
  const hwCatOptions = [...savedHwCats, ...[...new Set(extraHwCats)].sort()];

  const latestPurchase = {};
  const latestByName = {};
  const takeLatest = (map, key, p, stamp) => {
    if (!key) return;
    const prev = map[key];
    const prevStamp = prev ? `${prev.date || ""}|${prev.createdAt || ""}` : "";
    if (!prev || stamp >= prevStamp) map[key] = p;
  };
  purchases.forEach((p) => {
    const raw = p.product;
    const id = raw && typeof raw === "object" ? (raw._id || raw.id) : raw;
    const stamp = `${p.date || ""}|${p.createdAt || ""}`;
    takeLatest(latestPurchase, id ? String(id) : "", p, stamp);
    takeLatest(latestByName, (p.productName || "").trim().toLowerCase(), p, stamp);
  });
  const billOf = (p) => latestPurchase[String(p._id)] || latestByName[(p.name || "").trim().toLowerCase()] || null;
  const dateStampOf = (p) => {
    const bill = billOf(p);
    const d = bill?.date || p.lastPurchaseDate || "";
    const c = bill?.createdAt || "";
    return d || c ? `${d}|${c}` : "";
  };
  const inventory = products
    .filter((p) => {
      const stock = stockOf(p);
      const inGroup = isDemand ? stock <= thresholdOf(p) : stock > 0;
      if (!inGroup || !matchesInvSearch(p) || !matchesInvCat(p)) return false;
      return true;
    })
    .sort((a, b) => {
      if (isDemand) return stockOf(a) - stockOf(b);
      const sa = dateStampOf(a);
      const sb = dateStampOf(b);
      if (!sa && !sb) return (a.name || "").localeCompare(b.name || "");
      if (!sa) return 1;
      if (!sb) return -1;
      return sb.localeCompare(sa);
    });

  const lowCount = inventory.filter((p) => { const s = stockOf(p); return s > 0 && s <= thresholdOf(p); }).length;
  const invoiceOf = (p, bill) => bill?.invoice || bill?.invoiceNum || p.lastInvoice || "—";
  const dateOf = (p, bill) => bill?.date || p.lastPurchaseDate || "—";
  const supplierOf = (p, bill) => {
    const mainSup = (Array.isArray(p.suppliers) ? (p.suppliers.find((s) => s?.isMain) || p.suppliers[0]) : null)?.name || "";
    return bill?.supplier || bill?.supplierName || p.lastSupplier || mainSup || "—";
  };
  const catBadge = (p) => {
    const cat = p.category || "";
    const sub = itemCatOf(p);
    const label = sub || (isUrdu ? (cat ? getUrduItemLabel(cat) : "—") : (cat || "—"));
    return (
      <span style={{
        fontSize: 12, padding: "3px 9px", borderRadius: 20, fontWeight: 600,
        background: cat === "Pipe" ? "rgba(41,128,185,0.15)" : cat === "Chader" ? "rgba(26,188,156,0.15)" : cat === "Net" ? "rgba(244,114,182,0.15)" : cat === "Hardware" ? "rgba(251,191,36,0.15)" : "rgba(167,139,250,0.15)",
        color: cat === "Pipe" ? "#60a5fa" : cat === "Chader" ? "#34d399" : cat === "Net" ? "#f472b6" : cat === "Hardware" ? "#fbbf24" : "#a78bfa",
      }}>
        {label}
      </span>
    );
  };

  const printRows = inventory.map((p) => {
    const stock = Number(p.stock) || 0;
    const lots = lotsOf(p);
    const zero = stock <= 0;
    const cat = itemCatOf(p) || (isUrdu ? (p.category ? getUrduItemLabel(p.category) : "") : (p.category || ""));
    const status = isDemand ? (zero ? (isUrdu ? "زیرو" : "Zero") : (isUrdu ? "کم" : "Low")) : "";
    return {
      name: productDisplayName(p) || p.name || "—",
      category: [cat, status].filter(Boolean).join(" · "),
      stock: stockLabel(p.category, stock),
      value: lots.costValue || stock * lots.avgCost,
    };
  });
  const printTotal = printRows.reduce((s, r) => s + r.value, 0);
  const paySplit = inventory.reduce((acc, p) => {
    lotsOf(p).remaining.forEach((l) => {
      const value = (Number(l.remaining) || 0) * (Number(l.unitCost) || 0);
      const shares = l.opening ? { cash: 1, credit: 0 } : cashCreditShares(payMap[invoiceKey(l)] || payMap[l.invoice]);
      acc.cash += value * shares.cash;
      acc.credit += value * shares.credit;
    });
    return acc;
  }, { cash: 0, credit: 0 });

  const printBtn = (bg) => ({
    padding: "8px 12px", borderRadius: 10, border: "none", background: bg,
    color: "#fff", fontWeight: 700, fontSize: 12, cursor: inventory.length ? "pointer" : "not-allowed",
    opacity: inventory.length ? 1 : 0.45, whiteSpace: "nowrap",
  });

  const moneyCols = [isUrdu ? "لاگت / پیس" : "Cost / pc", isUrdu ? "فروخت / پیس" : "Sale / pc", t.totalLabel];
  const cols = isDemand
    ? [t.invoiceNum, t.date, t.supplier, t.name, t.category, isUrdu ? "حالت" : "Status", t.stock, ...moneyCols]
    : [t.invoiceNum, t.date, t.supplier, t.name, t.category, t.stock, ...moneyCols];
  if (onReturn) cols.push(t.actions);

  const statusBadge = (zero) => (
    <span style={{
      fontSize: 11, padding: "3px 8px", borderRadius: 20, fontWeight: 700, whiteSpace: "nowrap",
      background: zero ? "rgba(248,113,113,0.15)" : "rgba(251,191,36,0.15)",
      color: zero ? "#f87171" : "#fbbf24",
    }}>
      {zero ? (isUrdu ? "زیرو" : "Zero") : (isUrdu ? "کم" : "Low")}
    </span>
  );

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <input
            value={invSearch}
            onChange={(e) => setInvSearch(e.target.value)}
            placeholder={isUrdu ? "نام / انوائس نمبر" : "Name / invoice number"}
            style={{ flex: "7 1 0", width: 0, minWidth: 0, padding: "7px 10px", borderRadius: 10, border: `1px solid ${th.border}`, background: th.input || th.bgCard, color: th.text, fontSize: 13, outline: "none" }}
          />
          <select
            value={invCat}
            onChange={(e) => setInvCat(e.target.value)}
            style={{ flex: "3 1 0", width: 0, minWidth: 0, padding: "7px 10px", borderRadius: 10, border: `1px solid ${th.border}`, background: th.input || th.bgCard, color: th.text, fontSize: 13, outline: "none" }}
          >
            <option value="">{isUrdu ? "تمام کیٹگری" : "All categories"}</option>
            <optgroup label={isUrdu ? "ہارڈ ویئر کیٹگری" : "Hardware category"}>
              {hwCatOptions.map((c) => (
                <option key={c} value={c} style={{ background: th.bgModal }}>{c}</option>
              ))}
            </optgroup>
            <optgroup label={isUrdu ? "قسم" : "Type"}>
              {MAIN_CATS.map((c) => (
                <option key={c} value={c} style={{ background: th.bgModal }}>{isUrdu ? getUrduItemLabel(c) : c}</option>
              ))}
            </optgroup>
          </select>
        </div>
        <button type="button" disabled={!inventory.length} onClick={() => printThermalOrA4("thermal")} style={printBtn("linear-gradient(135deg,#1abc9c,#2980b9)")}>
          🖨️ {isUrdu ? "تھرمل" : "Thermal"}
        </button>
        <button type="button" disabled={!inventory.length} onClick={() => printThermalOrA4("a4")} style={printBtn("linear-gradient(135deg,#3b82f6,#1d4ed8)")}>
          📄 {isUrdu ? "A4" : "A4"}
        </button>
        <button type="button" disabled={!inventory.length} onClick={() => printThermalOrA4("pdf", `${isDemand ? "demand" : "stock-list"}-${todayStr()}`)} style={printBtn("linear-gradient(135deg,#7c3aed,#5b21b6)")}>
          📑 PDF
        </button>
      </div>
      <p style={{ color: th.textMuted, fontSize: 12, margin: "-4px 0 10px" }}>
        {isUrdu ? "تفصیل کے لیے قطار پر کلک کریں" : "Click a row for purchase dates, average cost and profit"}
      </p>
      <div style={{ paddingBottom: inventory.length ? 8 : 0 }}>
      <Table
        compact
        onRowClick={(p) => setDetail(p)}
        cols={cols}
        rows={inventory.map((p) => {
          const stock = Number(p.stock) || 0;
          const lots = lotsOf(p);
          const bill = billOf(p);
          const name = productDisplayName(p) || p.name || "—";
          const title = p.barcode ? `${name} · ${p.barcode}` : name;
          const zero = stock <= 0;
          const low = stock > 0 && stock <= thresholdOf(p);
          const cells = [
            <span style={{ fontFamily: "monospace", color: "#60a5fa", fontSize: 12, whiteSpace: "nowrap" }}>{invoiceOf(p, bill)}</span>,
            <span style={{ whiteSpace: "nowrap", fontSize: 12 }}>{dateOf(p, bill)}</span>,
            <span style={{ whiteSpace: "nowrap" }}>{supplierOf(p, bill)}</span>,
            <div style={{ fontWeight: 700, color: th.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }} title={title}>{name}</div>,
            catBadge(p),
          ];
          if (isDemand) cells.push(statusBadge(zero));
          cells.push(
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 12, color: isDemand ? (zero ? "#f87171" : "#fbbf24") : (low ? "#d97706" : "#34d399"), whiteSpace: "nowrap" }}>
              {stockLabel(p.category, stock)}
              {!isDemand && low ? statusBadge(false) : null}
            </span>,
            <span style={{ whiteSpace: "nowrap", fontSize: 12 }}>{formatPKR(lots.avgCost)}</span>,
            <span style={{ whiteSpace: "nowrap", fontSize: 12 }}>{formatPKR(lots.sale)}</span>,
            <span style={{ fontWeight: 700, whiteSpace: "nowrap", fontSize: 12 }}>{formatPKR(lots.costValue)}</span>,
          );
          if (onReturn) {
            cells.push(
              <button
                onClick={(e) => { e.stopPropagation(); onReturn(p); }}
                style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(248,113,113,0.15)", color: "#f87171", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}
              >↩ {isUrdu ? "واپسی" : "Return"}</button>
            );
          }
          return { data: p, cells };
        })}
      />
      </div>
      {inventory.length > 0 && (
        <div style={{
          position: "sticky",
          bottom: 0,
          zIndex: 4,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          margin: "12px -20px -16px",
          padding: "12px 20px",
          borderTop: `1px solid ${th.border}`,
          background: th.bgModal,
          boxShadow: "0 -8px 20px rgba(15,23,42,0.08)",
        }}>
          <span style={{ color: th.textMuted, fontSize: 13, fontWeight: 600 }}>
            {inventory.length} {isUrdu ? "آئٹمز" : "items"}
            {isDemand ? "" : ` · ${lowCount} ${isUrdu ? "کم اسٹاک" : "low stock"}`}
          </span>
          {!isDemand && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, fontWeight: 800 }}>
              <span style={{ color: "#0f766e", whiteSpace: "nowrap" }}>
                {isUrdu ? "کیش" : "Cash"} · {formatPKR(paySplit.cash)}
              </span>
              <span style={{ color: th.textDim }}>·</span>
              <span style={{ color: "#b45309", whiteSpace: "nowrap" }}>
                {isUrdu ? "کریڈٹ" : "Credit"} · {formatPKR(paySplit.credit)}
              </span>
            </span>
          )}
          <span style={{ color: th.text, fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" }}>{isUrdu ? "کل مالیت" : "Total value"} · {formatPKR(printTotal)}</span>
        </div>
      )}
      {!inventory.length && (
        <p style={{ color: th.textMuted, fontSize: 13, margin: "8px 0 0" }}>
          {isDemand
            ? (isUrdu ? "زیرو اور کم اسٹاک آئٹمز یہاں آئیں گی" : "Zero and low-stock items will show here")
            : (isUrdu ? "اسٹاک والی آئٹمز یہاں آئیں گی" : "In-stock items will show here")}
        </p>
      )}
      <div style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }} aria-hidden="true">
        <InventoryPrintSheet rows={printRows} total={printTotal} isUrdu={isUrdu} kind={kind} />
      </div>
      {detail && (
        <Modal
          title={isUrdu ? "اسٹاک تفصیل" : "Stock detail"}
          onClose={() => setDetail(null)}
          xl
          layer={70}
        >
          <StockDetailView
            product={detail}
            lots={lotsOf(detail)}
            onClose={() => setDetail(null)}
            isUrdu={isUrdu}
            th={th}
            t={t}
          />
        </Modal>
      )}
    </div>
  );
}
