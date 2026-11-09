import { useState, useMemo } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { Table, Modal } from "./shared";
import { formatPKR, formatWeightKgG, printThermalOrA4, todayStr } from "../utils/helpers";
import { api } from "../utils/api";
import { productDisplayName } from "../utils/constants";
import { pidOf } from "./StockReturns";
import {
  slipPage, slipLine, ThermalSlipHeader, ThermalSlipFooter,
} from "./ThermalSlipTheme";

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
  const thresholdOf = (p) => {
    const n = Number(p.lowStockThreshold);
    return Number.isFinite(n) && n > 0 ? n : 10;
  };
  const valued = !lotOpts && products.length > 0 && products.every((p) => p && p.costValue != null);
  if (valued) {
    const stockOf = (p) => Number(p.stock) || 0;
    const inStock = products.filter((p) => stockOf(p) > 0);
    const demandZero = products.filter((p) => stockOf(p) <= 0);
    const demandLow = products.filter((p) => {
      const s = stockOf(p);
      return s > 0 && s <= thresholdOf(p);
    });
    const inventoryAmount = inStock.reduce((s, p) => s + (Number(p.costValue) || 0), 0);
    return { stockedCount: inStock.length, inventoryAmount, demandZero, demandLow, stockOf, thresholdOf };
  }
  const ctx = lotOpts ? (lotOpts.ctx || makeLotContext(lotOpts)) : null;
  // Purchases can exist while product.stock is still 0 (missed stock link).
  // Count what the lots actually hold so those items stay on the stock list.
  const stockOf = (p) => {
    if (!ctx) return Number(p.stock) || 0;
    return Number(lotsFromContext(p, ctx).stock) || 0;
  };
  const inStock = products.filter((p) => stockOf(p) > 0);
  const demandZero = products.filter((p) => stockOf(p) <= 0);
  const demandLow = products.filter((p) => {
    const s = stockOf(p);
    return s > 0 && s <= thresholdOf(p);
  });
  const inventoryAmount = inStock.reduce((s, p) => {
    if (ctx) return s + (Number(lotsFromContext(p, ctx).costValue) || 0);
    const { cost } = costAndSale(p);
    return s + stockOf(p) * (Number(cost) || 0);
  }, 0);
  return { stockedCount: inStock.length, inventoryAmount, demandZero, demandLow, stockOf, thresholdOf };
}

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
  const q = Number(p?.qty);
  if (q > 0) return q;
  const fromRows = (p?.rows || []).reduce(
    (s, r) => s + (Number(r.qty) || Number(r.quantity) || Number(r.pieces) || Number(r.weight) || Number(r.feet) || 0),
    0
  );
  if (fromRows > 0) return fromRows;
  const rate = Number(p?.rate) || Number(p?.productPrice) || Number(p?.rows?.[0]?.purchasePrice) || 0;
  const total = Number(p?.total) || Number(p?.totalAmount) || 0;
  if (rate > 0 && total > 0) return Math.round((total / rate) * 1000) / 1000;
  return 0;
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
      map[key] = { total: 0, remaining: 0, paid: 0, method: "", settlement: "", remainList: [], paidList: [] };
    }
    map[key].total += Number(p.total) || Number(p.grandTotal) || 0;
    if (p.remainingAmount != null && p.remainingAmount !== "") {
      map[key].remainList.push(Number(p.remainingAmount) || 0);
    }
    if (p.paidAmount != null && p.paidAmount !== "") {
      map[key].paidList.push(Number(p.paidAmount) || 0);
    }
    if (p.paymentMethod) map[key].method = p.paymentMethod;
    if (p.settlement) map[key].settlement = p.settlement;
  });
  Object.values(map).forEach((info) => {
    const remainList = info.remainList || [];
    const paidList = info.paidList || [];
    const sameish = (list) => list.length > 1 && list.every((v) => Math.abs(v - list[0]) < 0.51);
    info.remaining = !remainList.length ? 0 : (sameish(remainList) ? remainList[0] : remainList.reduce((a, b) => a + b, 0));
    info.paid = !paidList.length ? 0 : (sameish(paidList) ? paidList[0] : paidList.reduce((a, b) => a + b, 0));
    if (info.remaining > info.total + 0.5) info.remaining = Math.max(...remainList);
    if (info.paid > info.total + 0.5) info.paid = Math.max(...paidList);
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

function normName(s) {
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Bill name "ANTOL TRIMMER" → product "ANTOL TRIMMER 600W" when that product is the only match. */
function aliasNamesFor(product, ctx) {
  const name = normName(product?.name);
  if (!name || !ctx) return [];
  const catalog = (ctx.products || []).map((p) => normName(p?.name)).filter(Boolean);
  const candidates = new Set();
  [ctx.purchByName, ctx.soldByName, ctx.saleRetByName, ctx.purchRetByName].forEach((m) => {
    Object.keys(m || {}).forEach((k) => candidates.add(normName(k)));
  });
  const keys = [];
  candidates.forEach((k) => {
    if (!k || k === name) return;
    const hits = catalog.filter((n) => n === k || n.includes(k) || k.includes(n));
    if (hits.length === 1 && hits[0] === name) keys.push(k);
  });
  return keys;
}

function qtyFromMaps(byId, byName, product, ctx) {
  const id = pidOf(product?._id || product?.id);
  const name = normName(product?.name);
  if (id && byId[id]) return byId[id];
  if (name && byName[name]) return byName[name];
  return aliasNamesFor(product, ctx).reduce((s, k) => s + (Number(byName[k]) || 0), 0);
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

export function saleSoldLines(sale, nameToId) {
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
  // Count each product once per bill. The shop stock list (the Netlify figure)
  // uses the first line only. Adding later lines of the same item on that bill
  // was dropping the stock value.
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
        const name = normName(e.productName || e.name || p.productName || "");
        pushLot(purchById, id, lot);
        pushLot(purchByName, name, lot);
      });
    } else {
      const lot = makeLot(purchaseQty(p), purchaseUnitCost(p, null));
      if (!lot) return;
      const id = pidOf(p.product || p.productId);
      const name = normName(p.productName || p.name || "");
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
    products: products || [],
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

function lotDedupeKey(l) {
  return [
    String(l.invoice || ""),
    String(l.date || ""),
    String(l.createdAt || ""),
    String(l.bought || 0),
    String(l.unitCost || 0),
    String(l.supplier || ""),
  ].join("|");
}

/** Merge id-keyed + name-keyed purchase lots so a PO is never dropped when
 *  productId is missing/wrong on one invoice but productName still matches. */
function rawLotsForProduct(product, ctx) {
  const id = pidOf(product?._id || product?.id);
  const name = normName(product?.name);
  const byId = (id && ctx.purchById[id]) ? ctx.purchById[id] : [];
  const exactName = (name && ctx.purchByName[name]) ? ctx.purchByName[name] : [];
  const nameKeys = exactName.length || byId.length ? [] : aliasNamesFor(product, ctx);
  const byName = exactName.length ? exactName : nameKeys.flatMap((k) => ctx.purchByName[k] || []);
  if (!byId.length) return byName.slice();
  if (!byName.length) return byId.slice();
  const seen = new Set();
  const merged = [];
  [...byId, ...byName].forEach((l) => {
    const key = lotDedupeKey(l);
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(l);
  });
  return merged;
}

function lotsFromContext(product, ctx) {
  const fallback = costAndSale(product).cost;
  const stock = Number(product?.stock) || 0;
  const raw = rawLotsForProduct(product, ctx);
  const lots = raw.map((l) => ({
    ...l,
    remaining: l.bought,
    unitCost: Number(l.unitCost) || fallback,
  }));

  lots.sort((a, b) => stampOf(a).localeCompare(stampOf(b)));

  const sold = qtyFromMaps(ctx.soldById, ctx.soldByName, product, ctx);
  const saleRet = qtyFromMaps(ctx.saleRetById, ctx.saleRetByName, product, ctx);
  const purchRet = qtyFromMaps(ctx.purchRetById, ctx.purchRetByName, product, ctx);
  let consume = Math.max(0, sold - saleRet) + purchRet;

  for (const lot of lots) {
    if (consume <= 0) break;
    const take = Math.min(lot.remaining, consume);
    lot.remaining -= take;
    consume -= take;
  }

  let held = lots.reduce((s, l) => s + l.remaining, 0);
  // Do NOT clamp purchase lots down to product.stock — that used to erase whole
  // invoices (e.g. PO-6799) from the stock detail when stock was temporarily low.
  // Trust FIFO from purchases/sales; reconcileProductStock keeps product.stock in sync.
  if (stock > held + 0.0001) {
    // Only invent an Opening lot when there is truly no purchase history.
    // If purchases exist but product.stock is higher, stock is wrong (old edit bug) —
    // do not create a fake Opening that doubles inventory value.
    if (!raw.length) {
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
    } else {
      held = lots.reduce((s, l) => s + l.remaining, 0);
    }
  } else {
    held = lots.reduce((s, l) => s + l.remaining, 0);
  }

  const remaining = lots.filter((l) => l.remaining > 0.0001);
  const costValue = remaining.reduce((s, l) => s + l.remaining * l.unitCost, 0);
  const fifoCost = remaining.length ? Number(remaining[0].unitCost) || fallback : fallback;
  // Display cost = latest purchase price (newest lot by stamp), while profit still uses FIFO.
  const latestLot = [...lots].sort((a, b) => stampOf(a).localeCompare(stampOf(b)));
  const newest = latestLot[latestLot.length - 1];
  const latestCost = newest ? Number(newest.unitCost) || fallback : fallback;
  const sale = costAndSale(product).sale;
  const profitPc = sale - fifoCost;
  const profitStock = remaining.reduce((s, l) => s + l.remaining * (sale - (Number(l.unitCost) || 0)), 0);
  const roundedLatest = Math.round((Number(latestCost) || 0) * 100) / 100;
  return {
    remaining,
    allLots: lots,
    stock: held,
    fifoCost: Math.round((Number(fifoCost) || 0) * 100) / 100,
    latestCost: roundedLatest,
    avgCost: roundedLatest,
    costValue,
    sale,
    profitPc,
    profitStock,
    sold: Math.max(0, sold - saleRet),
    purchRet,
  };
}

export function stockLotsForProduct(product, opts = {}) {
  const ctx = opts.ctx || makeLotContext(opts);
  return lotsFromContext(product, ctx);
}

/** FIFO cost of selling `qty` (oldest remaining purchase lots first). */
export function fifoCostForQty(product, qty, opts = {}, extraQty = 0) {
  const lots = stockLotsForProduct(product, opts);
  const need0 = Math.max(0, Number(qty) || 0);
  if (need0 <= 0) return 0;
  const layers = (lots.allLots || []).map((l) => ({
    remaining: Number(l.remaining) || 0,
    bought: Number(l.bought) || Number(l.remaining) || 0,
    unitCost: Number(l.unitCost) || 0,
  }));
  let extra = Math.max(0, Number(extraQty) || 0);
  for (const layer of layers) {
    if (extra <= 0) break;
    const room = Math.max(0, layer.bought - layer.remaining);
    const give = Math.min(room, extra);
    layer.remaining += give;
    extra -= give;
  }
  if (extra > 0) {
    if (layers[0]) layers[0].remaining += extra;
    else layers.push({ remaining: extra, unitCost: Number(lots.fifoCost) || 0 });
  }
  let need = need0;
  let cost = 0;
  for (const layer of layers) {
    if (need <= 0) break;
    const take = Math.min(layer.remaining, need);
    if (take <= 0) continue;
    cost += take * layer.unitCost;
    need -= take;
  }
  if (need > 0) {
    const fb = Number(lots.fifoCost) || Number(costAndSale(product).cost) || 0;
    cost += need * fb;
  }
  return Math.round(cost * 100) / 100;
}

function InventoryPrintSheet({ rows, total, isUrdu, kind }) {
  const tbl = { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" };
  const thS = (align) => ({
    padding: "5px 2px", fontWeight: 700, fontSize: "10px",
    textAlign: align || "center", borderBottom: "1px solid #000", borderTop: "1px solid #000",
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
    <div id="thermal-invoice" style={slipPage}>
      <ThermalSlipHeader title={reportTitle} isUrdu={isUrdu} />
      <div style={{ textAlign: "center", fontSize: "10px", marginTop: 6, fontWeight: 700 }}>
        {isUrdu ? "تاریخ" : "Date"}: {todayStr()} · {rows.length} {isUrdu ? "آئٹمز" : "items"}
      </div>
      <div style={slipLine} />
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
      <div style={slipLine} />
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 900, fontSize: "13px" }}>
        <span>{isUrdu ? "کل مالیت" : "TOTAL VALUE"}</span>
        <span>{formatPKR(total)}</span>
      </div>
      <ThermalSlipFooter isUrdu={isUrdu} role="admin" />
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
        <MiniStat th={th} label={isUrdu ? "تازہ لاگت / پیس" : "Latest cost / pc"} value={formatPKR(lots.latestCost)} />
        <MiniStat th={th} label={isUrdu ? "فروخت قیمت / پیس" : "Sale / pc"} value={formatPKR(lots.sale)} />
        <MiniStat th={th} label={isUrdu ? "منافع / پیس" : "Profit / pc"} value={formatPKR(lots.profitPc)} color={profitColor} />
        <MiniStat th={th} label={isUrdu ? "کل منافع (اسٹاک)" : "Profit on stock"} value={formatPKR(lots.profitStock)} color={profitColor} />
      </div>

      <p style={{ color: th.textMuted, fontSize: 12, margin: 0, lineHeight: 1.45 }}>
        {isUrdu
          ? "اسکرین پر تازہ ترین خرید قیمت دکھتی ہے۔ فروخت پر منافع پہلے والے اسٹاک (FIFO) کی لاگت سے بنتی ہے۔"
          : "Screen shows the latest purchase cost. Sale profit still uses the oldest remaining stock (FIFO)."}
      </p>

      <div>
        <div style={{ color: th.text, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
          {isUrdu ? "تمام خریداریاں (FIFO)" : "All purchases (FIFO)"}
        </div>
        <p style={{ color: th.textMuted, fontSize: 11, margin: "0 0 8px", lineHeight: 1.4 }}>
          {isUrdu
            ? "تازہ خریداری اوپر۔ فروخت پرانی سے پہلے ہوتی ہے۔ Remaining 0 = ختم۔"
            : "Latest purchase on top. Sales still consume oldest first. Remaining 0 = used."}
        </p>
        <div style={{
          maxHeight: 8 * 42 + 40,
          overflowY: "auto",
          border: `1px solid ${th.border}`,
          borderRadius: 12,
        }}>
          <Table
            compact
            cols={[
              t.date,
              t.invoiceNum,
              t.supplier,
              isUrdu ? "خریدا" : "Bought",
              isUrdu ? "باقی" : "Remaining",
              isUrdu ? "فی پیس لاگت" : "Cost / pc",
              t.totalLabel,
            ]}
            rows={[...(lots.allLots || lots.remaining)]
              .slice()
              .reverse()
              .map((l) => {
                const rem = Number(l.remaining) || 0;
                const gone = rem <= 0.0001;
                return {
                  data: l,
                  cells: [
                    <span style={{ whiteSpace: "nowrap", fontSize: 12 }}>{l.opening ? (isUrdu ? "پرانا / اوپننگ" : "Opening") : l.date}</span>,
                    <span style={{ fontFamily: "monospace", color: "#60a5fa", fontSize: 12, whiteSpace: "nowrap" }}>{l.invoice}</span>,
                    <span style={{ whiteSpace: "nowrap" }}>{l.supplier}</span>,
                    <span style={{ fontWeight: 700, color: th.textMuted, whiteSpace: "nowrap" }}>{stockLabel(product.category, l.bought)}</span>,
                    <span style={{ fontWeight: 700, color: gone ? "#f87171" : "#34d399", whiteSpace: "nowrap" }}>
                      {gone ? (isUrdu ? "0 (ختم)" : "0 (used)") : stockLabel(product.category, rem)}
                    </span>,
                    <span style={{ whiteSpace: "nowrap", fontSize: 12 }}>{formatPKR(l.unitCost)}</span>,
                    <span style={{ fontWeight: 700, whiteSpace: "nowrap", fontSize: 12 }}>{formatPKR(rem * l.unitCost)}</span>,
                  ],
                };
              })}
          />
        </div>
        {!(lots.allLots || lots.remaining).length && (
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

function billProductId(raw) {
  if (!raw) return "";
  if (typeof raw === "object") return String(raw._id || raw.id || "");
  return String(raw);
}

function newestBillFor(product, purchases) {
  const id = billProductId(product?._id || product?.id);
  const name = String(product?.name || "").trim().toLowerCase();
  const related = (purchases || []).filter((b) => {
    const bid = billProductId(b.product || b.productId);
    if (id && bid === id) return true;
    const entries = Array.isArray(b.entries) ? b.entries : [];
    if (entries.some((e) => id && billProductId(e.product || e.productId) === id)) return true;
    return name && String(b.productName || "").trim().toLowerCase() === name;
  });
  related.sort((a, b) => `${b.date || ""}|${b.createdAt || ""}`.localeCompare(`${a.date || ""}|${a.createdAt || ""}`));
  return related[0] || null;
}

function StockEditModal({ product, lots, purchases, onClose, onChanged, isUrdu, th }) {
  const [qty, setQty] = useState(String(Math.round((Number(lots.stock) || 0) * 1000) / 1000));
  const [cost, setCost] = useState(String(Number(lots.latestCost) || 0));
  const [sale, setSale] = useState(String(Number(lots.sale) || 0));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const name = productDisplayName(product) || product.name || "—";

  const inputStyle = {
    width: "100%", padding: "10px 12px", borderRadius: 10, border: `1px solid ${th.border}`,
    background: th.input || th.bgCard, color: th.text, fontSize: 14, outline: "none",
  };

  const save = async () => {
    const nextQty = Number(qty);
    const nextCost = Number(cost);
    const nextSale = Number(sale);
    if (!Number.isFinite(nextQty) || nextQty < 0) {
      setErr(isUrdu ? "اسٹاک صفر یا اس سے زیادہ ہونا چاہیے" : "Stock must be zero or more");
      return;
    }
    if (!Number.isFinite(nextCost) || nextCost < 0 || !Number.isFinite(nextSale) || nextSale < 0) {
      setErr(isUrdu ? "قیمت صفر یا اس سے زیادہ ہونی چاہیے" : "Price must be zero or more");
      return;
    }
    const fromQty = Number(lots.stock) || 0;
    const diff = Math.round((nextQty - fromQty) * 1000) / 1000;
    const costChanged = Math.abs(nextCost - (Number(lots.latestCost) || 0)) > 0.009;
    const saleChanged = Math.abs(nextSale - (Number(lots.sale) || 0)) > 0.009;
    setSaving(true);
    setErr("");
    try {
      const id = product._id || product.id;
      const applyPrices = async () => {
        const fields = product.category === "Pipe"
          ? { price: nextCost, purchasePrice: nextSale }
          : { purchasePrice: nextCost, price: nextSale };
        const res = await api.updateProduct(id, fields);
        if (!res?.success) throw new Error(res?.message || "Price was not saved");
      };
      if (diff > 0.0001) {
        const total = Math.round(nextCost * diff * 100) / 100;
        const pur = await api.addPurchase({
          supplier: "Stock edit",
          date: todayStr(),
          product: id,
          productName: product.name,
          category: product.category || "",
          qty: diff,
          rate: nextCost,
          total,
          productPrice: nextCost,
          rows: [{ qty: diff, purchasePrice: nextCost, salePrice: nextSale, unit: product.unit || "piece" }],
          unit: product.unit || "piece",
          paymentMethod: "cash",
          settlement: "full",
          paidAmount: total,
          remainingAmount: 0,
          notes: "Stock edit",
        });
        if (!pur?.success) throw new Error(pur?.message || "Stock was not updated");
      } else if (diff < -0.0001) {
        const need = Math.abs(diff);
        let db = product.dbStock != null ? Number(product.dbStock) : fromQty;
        if (!Number.isFinite(db)) db = fromQty;
        if (db + 0.0001 < need) {
          const bump = await api.adjustStock(id, "add", Math.round((need - db) * 1000) / 1000);
          if (!bump?.success) throw new Error(bump?.message || "Stock was not updated");
        }
        const ret = await api.addPurchaseReturn({
          date: todayStr(),
          supplier: "Stock edit",
          notes: "Stock edit",
          items: [{ productId: id, qty: need, rate: nextCost }],
        });
        if (!ret?.success) throw new Error(ret?.message || "Stock was not updated");
        try { await api.reconcileStock([id]); } catch { /* return already reduced stock */ }
      }
      if ((costChanged || saleChanged) && diff <= 0.0001) {
        const bill = newestBillFor(product, purchases);
        if (bill) {
          const billId = bill._id || bill.id;
          const entries = Array.isArray(bill.entries) ? bill.entries : [];
          if (entries.length) {
            const nextEntries = entries.map((e) => {
              const eid = billProductId(e.product || e.productId);
              if (String(id) && eid !== String(id)) return e;
              return { ...e, productPrice: nextCost, rate: nextCost, purchasePrice: nextCost, salePrice: nextSale };
            });
            const upd = await api.updatePurchase(billId, { entries: nextEntries });
            if (!upd?.success) throw new Error(upd?.message || "Price was not saved");
          } else {
            const q = Number(bill.qty) || Number(bill.rows?.[0]?.qty) || 0;
            const rows = (bill.rows && bill.rows.length)
              ? bill.rows.map((r, i) => (i === 0 ? { ...r, purchasePrice: nextCost, salePrice: nextSale, qty: Number(r.qty) || q } : r))
              : [{ qty: q, purchasePrice: nextCost, salePrice: nextSale, unit: product.unit || "piece" }];
            const upd = await api.updatePurchase(billId, {
              rate: nextCost,
              productPrice: nextCost,
              total: Math.round(nextCost * q * 100) / 100,
              rows,
              qty: q,
            });
            if (!upd?.success) throw new Error(upd?.message || "Price was not saved");
          }
        }
      }
      await applyPrices();
      if (onChanged) await onChanged();
      onClose();
    } catch (e) {
      setErr(e?.message || (isUrdu ? "محفوظ نہیں ہوا" : "Could not save"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={isUrdu ? "اسٹاک ایڈٹ" : "Edit stock"} onClose={onClose} layer={300}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontWeight: 800, color: th.text, fontSize: 16 }}>{name}</div>
        <div style={{ color: th.textMuted, fontSize: 12 }}>
          {isUrdu ? "اب" : "Now"} {stockLabel(product.category, lots.stock)}
          {" · "}{isUrdu ? "لاگت" : "Cost"} {formatPKR(lots.latestCost)}
          {" · "}{isUrdu ? "فروخت" : "Sale"} {formatPKR(lots.sale)}
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, color: th.textMuted, fontSize: 12, fontWeight: 700 }}>
          {isUrdu ? "اسٹاک (کم یا زیادہ)" : "Stock (less or more)"}
          <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" style={inputStyle} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, color: th.textMuted, fontSize: 12, fontWeight: 700 }}>
          {isUrdu ? "لاگت / پیس" : "Cost / pc"}
          <input value={cost} onChange={(e) => setCost(e.target.value)} inputMode="decimal" style={inputStyle} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, color: th.textMuted, fontSize: 12, fontWeight: 700 }}>
          {isUrdu ? "فروخت / پیس" : "Sale / pc"}
          <input value={sale} onChange={(e) => setSale(e.target.value)} inputMode="decimal" style={inputStyle} />
        </label>
        {err ? <div style={{ color: "#f87171", fontSize: 13, fontWeight: 700 }}>{err}</div> : null}
        <button
          type="button"
          data-save="1"
          disabled={saving}
          onClick={save}
          style={{ padding: "11px 14px", borderRadius: 10, border: "none", cursor: saving ? "wait" : "pointer", background: "linear-gradient(135deg,#1abc9c,#2980b9)", color: "#fff", fontWeight: 800, fontSize: 14 }}
        >
          {saving ? (isUrdu ? "محفوظ ہو رہا ہے" : "Saving...") : (isUrdu ? "محفوظ کریں" : "Save")}
        </button>
      </div>
    </Modal>
  );
}

export default function InventoryStockTable({ products = [], purchases = [], sales = [], purchaseReturns = [], saleReturns = [], onReturn, onChanged, kind = "inventory" }) {
  const th = useTheme();
  const { t, lang } = useLang();
  const isUrdu = lang === "ur";
  const isDemand = kind === "demand";
  const [invSearch, setInvSearch] = useState("");
  const [invCat, setInvCat] = useState("");
  const [asOf, setAsOf] = useState("");
  const [detail, setDetail] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const today = todayStr();
  const yesterday = shiftIso(today, -1);

  const lotsByKey = useMemo(() => {
    const m = new Map();
    const list = products || [];
    const cached = list.length > 0 && list.every((p) => p && p._lots);
    const lotCtx = cached ? null : makeLotContext({ purchases, sales, purchaseReturns, saleReturns, products: list });
    list.forEach((p) => {
      m.set(String(p._id || p.id || p.name || ""), p._lots || lotsFromContext(p, lotCtx));
    });
    return m;
  }, [products, purchases, sales, purchaseReturns, saleReturns]);
  const lotsOf = (p) => lotsByKey.get(String(p._id || p.id || p.name || "")) || {
    stock: Number(p.stock) || 0,
    latestCost: Number(p.latestCost) || 0,
    fifoCost: Number(p.fifoCost) || 0,
    sale: Number(p.lotSale) || Number(p.price) || 0,
    costValue: Number(p.costValue) || 0,
    remaining: [],
    allLots: [],
    sold: 0,
    purchRet: 0,
  };
  const compare = useMemo(() => {
    if (!asOf || isDemand) return null;
    const nameToId = new Map();
    (products || []).forEach((p) => {
      const id = pidOf(p?._id || p?.id);
      const name = String(p?.name || "").trim().toLowerCase();
      if (id && name) nameToId.set(name, id);
    });
    const pastDay = asOf < todayStr();
    const before = (rec) => {
      const d = recordDay(rec);
      if (!d) return true;
      return pastDay ? d <= asOf : d < asOf;
    };
    const since = (rec) => {
      const d = recordDay(rec);
      if (!d) return false;
      return pastDay ? d > asOf : d >= asOf;
    };
    const ctx = makeLotContext({
      purchases: (purchases || []).filter(before),
      sales: (sales || []).filter(before),
      purchaseReturns: (purchaseReturns || []).filter(before),
      saleReturns: (saleReturns || []).filter(before),
      products,
    });
    const was = new Map();
    (products || []).forEach((p) => {
      const lots = lotsFromContext(p, ctx);
      was.set(String(p._id || p.id || ""), {
        stock: Number(lots.stock) || 0,
        value: Number(lots.costValue) || 0,
      });
    });
    const sold = {};
    (sales || []).forEach((s) => {
      if (!since(s)) return;
      saleSoldLines(s, nameToId).forEach((ln) => {
        sold[ln.productId] = (sold[ln.productId] || 0) + ln.qty;
      });
    });
    return { was, sold };
  }, [asOf, isDemand, products, purchases, sales, purchaseReturns, saleReturns]);
  const wasRow = (p) => (compare ? compare.was.get(String(p._id || p.id || "")) : null);
  const wasOf = (p) => Number(wasRow(p)?.stock) || 0;
  const wasValueOf = (p) => Number(wasRow(p)?.value) || 0;
  const soldSinceOf = (p) => (compare ? (compare.sold[String(p._id || p.id || "")] || 0) : 0);
  const payMap = useMemo(() => purchasePayMap(purchases), [purchases]);

  const stockOf = (p) => Number(lotsOf(p).stock) || 0;
  const thresholdOf = (p) => {
    const n = Number(p.lowStockThreshold);
    return Number.isFinite(n) && n > 0 ? n : 10;
  };
  const qInv = invSearch.trim().toLowerCase();
  const matchesInvSearch = (p) => {
    if (!qInv) return true;
    const lotInvoices = (lotsOf(p).allLots || []).some((l) =>
      String(l.invoice || "").toLowerCase().includes(qInv)
      || String(l.supplier || "").toLowerCase().includes(qInv)
    );
    return (p.name || "").toLowerCase().includes(qInv)
      || (p.barcode || "").toLowerCase().includes(qInv)
      || (p.category || "").toLowerCase().includes(qInv)
      || (p.brand || "").toLowerCase().includes(qInv)
      || (p.subType || "").toLowerCase().includes(qInv)
      || (p.lastInvoice || "").toLowerCase().includes(qInv)
      || String(billOf(p)?.invoice || billOf(p)?.invoiceNum || "").toLowerCase().includes(qInv)
      || lotInvoices
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
      const moved = wasOf(p) > 0.0001 || stock > 0.0001 || soldSinceOf(p) > 0.0001;
      const inGroup = compare ? moved : (isDemand ? stock <= thresholdOf(p) : stock > 0);
      if (!inGroup || !matchesInvSearch(p) || !matchesInvCat(p)) return false;
      return true;
    })
    .sort((a, b) => {
      if (compare) {
        const drop = (wasOf(b) - stockOf(b)) - (wasOf(a) - stockOf(a));
        if (Math.abs(drop) > 0.0001) return drop;
      }
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
    const lots = lotsOf(p);
    const stock = Number(lots.stock) || 0;
    const zero = stock <= 0;
    const cat = itemCatOf(p) || (isUrdu ? (p.category ? getUrduItemLabel(p.category) : "") : (p.category || ""));
    const status = isDemand ? (zero ? (isUrdu ? "زیرو" : "Zero") : (isUrdu ? "کم" : "Low")) : "";
    const was = wasOf(p);
    const soldQty = soldSinceOf(p);
    const down = was - stock;
    const stockText = compare
      ? `${isUrdu ? "اس دن" : "That day"} ${stockLabel(p.category, was)} · ${isUrdu ? "آج" : "Today"} ${stockLabel(p.category, stock)} · ${isUrdu ? "فروخت" : "Sold"} ${stockLabel(p.category, soldQty)} · ${down >= -0.0001 ? (isUrdu ? "کمی" : "Down") : (isUrdu ? "اضافہ" : "Up")} ${stockLabel(p.category, Math.abs(down))}`
      : stockLabel(p.category, stock);
    return {
      name: productDisplayName(p) || p.name || "—",
      category: [cat, status].filter(Boolean).join(" · "),
      stock: stockText,
      value: compare ? wasValueOf(p) : (lots.costValue || stock * lots.fifoCost),
    };
  });
  const printTotal = printRows.reduce((s, r) => s + r.value, 0);
  const todayValueTotal = compare ? inventory.reduce((s, p) => s + (Number(lotsOf(p).costValue) || 0), 0) : printTotal;
  const wasValueTotal = compare ? printTotal : todayValueTotal;
  const valueDown = wasValueTotal - todayValueTotal;
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

  const moneyCols = [isUrdu ? "لاگت / پیس" : "Cost / pc", isUrdu ? "فروخت / پیس" : "Sale / pc", compare ? (isUrdu ? "اس دن مالیت" : "That day value") : t.totalLabel];
  const cols = compare
    ? [t.name, t.category, isUrdu ? "اس دن" : "That day", isUrdu ? "آج" : "Today", isUrdu ? "فروخت" : "Sold", isUrdu ? "کمی" : "Down", ...moneyCols]
    : isDemand
    ? [t.invoiceNum, t.date, t.supplier, t.name, t.category, isUrdu ? "حالت" : "Status", t.stock, ...moneyCols]
    : [t.invoiceNum, t.date, t.supplier, t.name, t.category, t.stock, ...moneyCols];
  if (onReturn) cols.push(isUrdu ? "واپسی" : "Return");
  if (!isDemand && onChanged) cols.push(isUrdu ? "ایڈٹ" : "Edit");

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
        <div style={{ flex: "1 1 240px", minWidth: 0, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            value={invSearch}
            onChange={(e) => setInvSearch(e.target.value)}
            placeholder={isUrdu ? "نام / انوائس نمبر" : "Name / invoice number"}
            style={{ flex: "1 1 180px", minWidth: 140, padding: "7px 10px", borderRadius: 10, border: `1px solid ${th.border}`, background: th.input || th.bgCard, color: th.text, fontSize: 13, outline: "none" }}
          />
          {!isDemand && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              {[
                { id: today, label: isUrdu ? "آج" : "Today" },
                { id: yesterday, label: isUrdu ? "کل" : "Yesterday" },
              ].map((b) => (
                <button
                  key={b.label}
                  type="button"
                  onClick={() => setAsOf((v) => (v === b.id ? "" : b.id))}
                  style={{
                    padding: "7px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                    fontWeight: 700, fontSize: 12,
                    background: asOf === b.id ? "linear-gradient(135deg,#1abc9c,#2980b9)" : (th.thHead || th.bgCard),
                    color: asOf === b.id ? "#fff" : th.textMuted,
                  }}
                >{b.label}</button>
              ))}
              <input
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                title={isUrdu ? "اس تاریخ سے موازنہ" : "Compare from this date"}
                style={{ padding: "6px 8px", borderRadius: 10, border: `1px solid ${asOf && asOf !== today && asOf !== yesterday ? "#1abc9c" : th.border}`, background: th.input || th.bgCard, color: th.text, fontSize: 13, outline: "none" }}
              />
            </div>
          )}
          <select
            value={invCat}
            onChange={(e) => setInvCat(e.target.value)}
            style={{ flex: "0 1 180px", minWidth: 140, padding: "7px 10px", borderRadius: 10, border: `1px solid ${th.border}`, background: th.input || th.bgCard, color: th.text, fontSize: 13, outline: "none" }}
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
        {compare
          ? (asOf >= today
            ? (isUrdu
              ? "اس دن = آج صبح کا اسٹاک۔ فروخت = آج کی سیل۔ کمی = آج صبح سے اب تک جتنی اسٹاک کم ہوئی"
              : "That day = stock this morning. Sold = sold today. Down = how much stock is lower now.")
            : (isUrdu
              ? `اس دن = ${asOf} کے آخر کا اسٹاک۔ فروخت = اس کے بعد کی سیل۔ کمی = اس دن سے آج تک جتنی اسٹاک کم ہوئی`
              : `That day = stock at the end of ${asOf}. Sold = sold after that day. Down = that day minus today.`))
          : (isUrdu ? "تفصیل کے لیے قطار پر کلک کریں" : "Click a row for purchase lots (first in, first out) and profit")}
      </p>
      <div style={{ paddingBottom: inventory.length ? 8 : 0 }}>
      <Table
        compact
        onRowClick={(p) => setDetail(p)}
        cols={cols}
        rows={inventory.map((p) => {
          const lots = lotsOf(p);
          const stock = Number(lots.stock) || Number(p.stock) || 0;
          const bill = billOf(p);
          const name = productDisplayName(p) || p.name || "—";
          const title = p.barcode ? `${name} · ${p.barcode}` : name;
          const zero = stock <= 0;
          const low = stock > 0 && stock <= thresholdOf(p);
          const was = wasOf(p);
          const soldQty = soldSinceOf(p);
          const down = was - stock;
          const cells = compare ? [
            <div style={{ fontWeight: 700, color: th.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }} title={title}>{name}</div>,
            catBadge(p),
            <span style={{ fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>{stockLabel(p.category, was)}</span>,
            <span style={{ fontWeight: 700, fontSize: 12, color: "#34d399", whiteSpace: "nowrap" }}>{stockLabel(p.category, stock)}</span>,
            <span style={{ fontWeight: 700, fontSize: 12, color: "#60a5fa", whiteSpace: "nowrap" }}>{stockLabel(p.category, soldQty)}</span>,
            <span style={{ fontWeight: 800, fontSize: 12, whiteSpace: "nowrap", color: down > 0.0001 ? "#f87171" : down < -0.0001 ? "#34d399" : th.textMuted }}>
              {Math.abs(down) < 0.0001 ? "—" : `${down > 0 ? (isUrdu ? "کمی " : "Down ") : (isUrdu ? "اضافہ " : "Up ")}${stockLabel(p.category, Math.abs(down))}`}
            </span>,
          ] : [
            <span style={{ fontFamily: "monospace", color: "#60a5fa", fontSize: 12, whiteSpace: "nowrap" }}>{invoiceOf(p, bill)}</span>,
            <span style={{ whiteSpace: "nowrap", fontSize: 12 }}>{dateOf(p, bill)}</span>,
            <span style={{ whiteSpace: "nowrap" }}>{supplierOf(p, bill)}</span>,
            <div style={{ fontWeight: 700, color: th.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }} title={title}>{name}</div>,
            catBadge(p),
          ];
          if (!compare && isDemand) cells.push(statusBadge(zero));
          if (!compare) {
            cells.push(
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 12, color: isDemand ? (zero ? "#f87171" : "#fbbf24") : (low ? "#d97706" : "#34d399"), whiteSpace: "nowrap" }}>
                {stockLabel(p.category, stock)}
                {!isDemand && low ? statusBadge(false) : null}
              </span>
            );
          }
          cells.push(
            <span style={{ whiteSpace: "nowrap", fontSize: 12 }}>{formatPKR(lots.latestCost)}</span>,
            <span style={{ whiteSpace: "nowrap", fontSize: 12 }}>{formatPKR(lots.sale)}</span>,
            <span style={{ fontWeight: 700, whiteSpace: "nowrap", fontSize: 12 }}>{formatPKR(compare ? wasValueOf(p) : lots.costValue)}</span>,
          );
          if (onReturn) {
            cells.push(
              <button
                onClick={(e) => { e.stopPropagation(); onReturn(p); }}
                style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(248,113,113,0.15)", color: "#f87171", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}
              >↩ {isUrdu ? "واپسی" : "Return"}</button>
            );
          }
          if (!isDemand && onChanged) {
            cells.push(
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setEditRow(p); }}
                style={{ padding: "5px 10px", borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(59,130,246,0.15)", color: "#60a5fa", fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}
              >✎ {isUrdu ? "ایڈٹ" : "Edit"}</button>
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
          {!isDemand && !compare && (
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
          {compare ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontSize: 13, fontWeight: 800 }}>
              <span style={{ color: th.text, whiteSpace: "nowrap" }}>
                {isUrdu ? "اس دن" : "That day"} · {formatPKR(wasValueTotal)}
              </span>
              <span style={{ color: th.textDim }}>·</span>
              <span style={{ color: "#0f766e", whiteSpace: "nowrap" }}>
                {isUrdu ? "آج" : "Today"} · {formatPKR(todayValueTotal)}
              </span>
              <span style={{ color: th.textDim }}>·</span>
              <span style={{ color: valueDown > 0.5 ? "#f87171" : valueDown < -0.5 ? "#34d399" : th.textMuted, whiteSpace: "nowrap" }}>
                {Math.abs(valueDown) < 0.5
                  ? (isUrdu ? "کمی" : "Down") + " · " + formatPKR(0)
                  : `${valueDown > 0 ? (isUrdu ? "کمی" : "Down") : (isUrdu ? "اضافہ" : "Up")} · ${formatPKR(Math.abs(valueDown))}`}
              </span>
            </span>
          ) : (
            <span style={{ color: th.text, fontSize: 14, fontWeight: 800, whiteSpace: "nowrap" }}>{isUrdu ? "کل مالیت" : "Total value"} · {formatPKR(printTotal)}</span>
          )}
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
      {editRow && (
        <StockEditModal
          product={editRow}
          lots={lotsOf(editRow)}
          purchases={purchases}
          isUrdu={isUrdu}
          th={th}
          onClose={() => setEditRow(null)}
          onChanged={onChanged}
        />
      )}
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
