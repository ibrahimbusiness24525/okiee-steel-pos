import { api } from "./api";
import { applyReturnFinance, invoicePayInfo } from "./tradeFinance";

const PR_KEY = "steelpos_purchase_returns_v1";
const SR_KEY = "steelpos_sale_returns_v1";

function pid(v) {
  if (!v) return "";
  if (typeof v === "object") return String(v._id || v.id || "");
  return String(v);
}

function isMissingRoute(r) {
  const m = String(r?.message || "").toLowerCase();
  const st = Number(r?._status || r?.status || 0);
  return st === 404 || m === "route not found" || m === "not found" || m.includes("cannot post") || m.includes("cannot get");
}

function read(key) {
  try {
    const d = JSON.parse(localStorage.getItem(key));
    if (Array.isArray(d)) return d;
  } catch { /* ignore */ }
  return [];
}

function write(key, rows) {
  localStorage.setItem(key, JSON.stringify(rows));
}

function nextInv(list, prefix) {
  return `${prefix}-${String(list.length + 1).padStart(4, "0")}`;
}

function itemsTotal(items) {
  return (items || []).reduce((s, it) => s + ((Number(it.qty) || 0) * (Number(it.rate) || 0)), 0);
}

function purchaseHead(purchases, payload) {
  const id = (payload.items || []).find((it) => it.purchaseId)?.purchaseId;
  if (!id) return null;
  const first = purchases.find((p) => String(p._id) === String(id));
  if (!first) return null;
  const invoice = first.invoice || first.invoiceNum || "";
  const supplier = first.supplier || first.supplierName || "";
  const date = first.date || "";
  const group = purchases.filter((p) =>
    String(p.invoice || p.invoiceNum || "") === String(invoice)
    && String(p.supplier || p.supplierName || "") === String(supplier)
    && String(p.date || "") === String(date)
  );
  return group[0] || first;
}

async function afterSaleReturnFinance(payload, sales) {
  const sale = sales.find((s) => String(s._id) === String(payload.saleId));
  if (!sale) return;
  const pay = invoicePayInfo(sale);
  const total = itemsTotal(payload.items);
  await applyReturnFinance({
    kind: "sale",
    partyName: sale.customer,
    invoice: sale.invoice || sale.invoiceNum || "",
    date: payload.date,
    returnTotal: total,
    remaining: pay.remaining,
    accountId: payload.accountId || pay.accountId,
    accountName: payload.accountName || "",
    isCredit: pay.isCredit,
    reverseLedger: payload.reverseLedger === true,
  });
}

async function afterPurchaseReturnFinance(payload, purchases) {
  const head = purchaseHead(purchases, payload);
  if (!head) return;
  const pay = invoicePayInfo(head);
  const total = itemsTotal(payload.items);
  await applyReturnFinance({
    kind: "purchase",
    partyName: payload.supplier || head.supplier || head.supplierName || "",
    invoice: head.invoice || head.invoiceNum || "",
    date: payload.date,
    returnTotal: total,
    remaining: pay.remaining,
    accountId: payload.accountId || pay.accountId,
    accountName: payload.accountName || "",
    isCredit: pay.isCredit,
    reverseLedger: payload.reverseLedger === true,
  });
}

export function returnsForSale(sale, returns) {
  if (!sale) return [];
  const sid = pid(sale._id || sale.id);
  const inv = String(sale.invoice || sale.invoiceNum || "").trim();
  return (returns || []).filter((r) => {
    const rid = pid(r.sale || r.saleId);
    if (sid && rid && rid === sid) return true;
    if (inv) {
      const rinv = String(r.invoice || r.invoiceNum || "").trim();
      if (rinv && rinv === inv) return true;
    }
    return false;
  });
}

export function saleReturnedAmount(sale, returns) {
  return returnsForSale(sale, returns).reduce((s, r) => s + (Number(r.total) || 0), 0);
}

export function netSaleAmount(sale, returns) {
  const gross = Number(sale?.grandTotal) || Number(sale?.total) || 0;
  return Math.max(0, +(gross - saleReturnedAmount(sale, returns)).toFixed(2));
}

export function returnsForPurchase(purchase, returns) {
  if (!purchase) return [];
  const pid0 = pid(purchase._id || purchase.id);
  const inv = String(purchase.invoice || purchase.invoiceNum || "").trim();
  return (returns || []).filter((r) => {
    const items = r.items || [];
    if (pid0 && items.some((it) => pid(it.purchase || it.purchaseId) === pid0)) return true;
    if (inv) {
      const rinv = String(r.invoice || r.invoiceNum || "").trim();
      if (rinv && rinv === inv) return true;
    }
    return false;
  });
}

export function purchaseReturnedAmount(purchase, returns) {
  const pid0 = pid(purchase?._id || purchase?.id);
  let sum = 0;
  returnsForPurchase(purchase, returns).forEach((r) => {
    const items = r.items || [];
    if (!items.length) {
      sum += Number(r.total) || 0;
      return;
    }
    items.forEach((it) => {
      const ip = pid(it.purchase || it.purchaseId);
      if (pid0 && ip && ip !== pid0) return;
      sum += Number(it.amount) || ((Number(it.qty) || 0) * (Number(it.rate) || 0));
    });
  });
  return Math.round(sum * 100) / 100;
}

export function netPurchaseAmount(purchase, returns) {
  const gross = Number(purchase?.total) || 0;
  const disc = Number(purchase?.discount) || 0;
  const netBill = Math.max(0, gross - disc);
  return Math.max(0, +(netBill - purchaseReturnedAmount(purchase, returns)).toFixed(2));
}

/** Invoice-level purchase net: remaining item gross − discount (once per bill, scaled after returns). */
export function purchaseInvoiceNet(items, returns) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return 0;
  const origGross = list.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const remainGross = list.reduce((s, p) => s + (Number(netPurchaseLine(p, returns).total) || 0), 0);
  const disc = Number(list[0]?.discount) || 0;
  const scale = origGross > 0.009 ? remainGross / origGross : 1;
  return Math.max(0, Math.round((remainGross - disc * scale) * 100) / 100);
}

export function saleInvoiceNet(saleOrItems, returns) {
  const list = Array.isArray(saleOrItems) ? saleOrItems : [saleOrItems];
  return list.reduce((s, sale) => s + netSaleAmount(sale, returns), 0);
}

export function purchasesNetTotal(list, returns) {
  const map = new Map();
  (list || []).forEach((p) => {
    const key = `${p.invoice || p.invoiceNum || p._id}|${p.date || ""}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  });
  return [...map.values()].reduce((s, items) => s + purchaseInvoiceNet(items, returns), 0);
}

/** Remaining purchase qty/amount after returns (for slips / list totals). */
export function netPurchaseLine(purchase, returns) {
  const qty = Number(purchase?.qty) || 0;
  const total = Number(purchase?.total) || 0;
  const leftover = [];
  returnsForPurchase(purchase, returns).forEach((r) => {
    (r.items || []).forEach((it) => {
      const ip = pid(it.purchase || it.purchaseId);
      const pid0 = pid(purchase?._id || purchase?.id);
      if (ip && pid0 && ip !== pid0) return;
      leftover.push({
        qty: Number(it.qty) || 0,
        amount: Number(it.amount) || ((Number(it.qty) || 0) * (Number(it.rate) || 0)),
      });
    });
  });
  let takeQty = 0;
  let takeAmt = 0;
  leftover.forEach((r) => {
    takeQty += r.qty;
    takeAmt += r.amount;
  });
  const remainQty = Math.max(0, qty - takeQty);
  const remainAmt = Math.max(0, +(total - takeAmt).toFixed(2));
  const keep = qty > 0.009 ? remainQty / qty : (total > 0.009 ? remainAmt / total : 1);
  const rows = (purchase?.rows || []).map((row) => {
    const next = { ...row };
    if (row.qty != null) next.qty = +(Number(row.qty || 0) * keep).toFixed(4);
    if (row.quantity != null) next.quantity = +(Number(row.quantity || 0) * keep).toFixed(4);
    if (row.weight != null) next.weight = +(Number(row.weight || 0) * keep).toFixed(4);
    if (row.feet != null) next.feet = +(Number(row.feet || 0) * keep).toFixed(4);
    if (row.amount != null) next.amount = +(Number(row.amount || 0) * keep).toFixed(2);
    if (row.desc != null && row.amount != null) {
      next.amount = +(Number(row.amount || 0) * keep).toFixed(2);
    }
    return next;
  });
  const disc = Number(purchase?.discount) || 0;
  const discKeep = total > 0.009 ? remainAmt / total : keep;
  return {
    ...purchase,
    qty: remainQty,
    total: remainAmt,
    rows,
    discount: Math.round(disc * discKeep * 100) / 100,
    returned: takeQty > 0.009 || takeAmt > 0.009,
    fullyReturned: remainAmt <= 0.009 && remainQty <= 0.009,
  };
}

/** Per-item remaining qty/amount after sale returns, for invoices and profit. */
export function netSaleItems(sale, returns) {
  const leftover = [];
  returnsForSale(sale, returns).forEach((r) => {
    (r.items || []).forEach((it) => {
      leftover.push({
        name: String(it.productName || it.name || "").trim().toLowerCase(),
        qty: Number(it.qty) || 0,
        amount: Number(it.amount) || Number(it.subtotal) || ((Number(it.qty) || 0) * (Number(it.rate) || 0)),
      });
    });
  });
  const take = (name, qty, amount) => {
    const key = String(name || "").trim().toLowerCase();
    let takeQty = 0;
    let takeAmt = 0;
    leftover.forEach((r) => {
      if (r.name !== key) return;
      const q = Math.min(qty - takeQty, r.qty);
      const a = Math.min(amount - takeAmt, r.amount);
      takeQty += q;
      takeAmt += a;
      r.qty -= q;
      r.amount -= a;
    });
    return { takeQty, takeAmt };
  };
  if (Array.isArray(sale?.items) && sale.items.length) {
    return sale.items.map((item) => {
      const sub = Number(item.subtotal) || (item.rows || []).reduce((a, r) => a + (Number(r.amount) || 0), 0) || 0;
      let qty = Number(item.qty) || 0;
      if (!qty && item.rows?.[0]?.desc) {
        const m = String(item.rows[0].desc).match(/^(\d+\.?\d*)/);
        if (m) qty = parseFloat(m[1]) || 0;
      }
      const { takeQty, takeAmt } = take(item.productName, qty, sub);
      const remainAmt = Math.max(0, +(sub - takeAmt).toFixed(2));
      const remainQty = Math.max(0, qty - takeQty);
      const keep = sub > 0 ? remainAmt / sub : (takeAmt > 0 ? 0 : 1);
      // COGS follows qty returned, not return amount alone (avoids 500→400 when qty still 5).
      const keepCost = qty > 0.009 ? remainQty / qty : keep;
      const rows = (item.rows || []).map((row) => ({
        ...row,
        amount: +(Number(row.amount || 0) * keep).toFixed(2),
      }));
      const baseCost = Number(item.costTotal) || 0;
      const unitCost = Number(item.costPrice) || 0;
      let costTotal = baseCost > 0
        ? +(baseCost * keepCost).toFixed(2)
        : (unitCost > 0 && remainQty > 0 ? +(unitCost * remainQty).toFixed(2) : 0);
      if (unitCost > 0 && remainQty > 0) {
        const byUnit = +(unitCost * remainQty).toFixed(2);
        if (byUnit > costTotal + 0.02) costTotal = byUnit;
      }
      return {
        ...item,
        rows,
        qty: remainQty,
        subtotal: remainAmt,
        costTotal,
        origSubtotal: sub,
        returnAmt: takeAmt,
        returned: takeAmt > 0.009 || takeQty > 0.009,
        fullyReturned: remainAmt <= 0.009,
      };
    });
  }
  const name = sale?.productName || (typeof sale?.product === "object" ? sale.product?.name : "") || "—";
  const sub = Number(sale?.total) || Number(sale?.grandTotal) || 0;
  const qty = Number(sale?.qty) || 0;
  const { takeQty, takeAmt } = take(name, qty, sub);
  const remainAmt = Math.max(0, +(sub - takeAmt).toFixed(2));
  const remainQty = Math.max(0, qty - takeQty);
  const keep = sub > 0 ? remainAmt / sub : 1;
  const keepCost = qty > 0.009 ? remainQty / qty : keep;
  const baseCost = Number(sale?.costTotal) || 0;
  const unitCost = Number(sale?.costPrice) || Number(sale?.costRate) || 0;
  let costTotal = baseCost > 0 ? +(baseCost * keepCost).toFixed(2) : 0;
  if (unitCost > 0 && remainQty > 0) {
    const byUnit = +(unitCost * remainQty).toFixed(2);
    if (byUnit > costTotal + 0.02) costTotal = byUnit;
  }
  return [{
    productName: name,
    category: sale?.category || "",
    qty: remainQty,
    subtotal: remainAmt,
    costTotal,
    origSubtotal: sub,
    returnAmt: takeAmt,
    returned: takeAmt > 0.009,
    fullyReturned: remainAmt <= 0.009,
    rows: [{ desc: `${Math.max(0, qty - takeQty)} × Rs${qty > 0 ? ((remainAmt / Math.max(qty, 1))).toFixed(0) : 0}`, amount: remainAmt }],
  }];
}

function isUnitEnumError(r) {
  const m = String(r?.message || "").toLowerCase();
  return m.includes("unit") && (m.includes("enum") || m.includes("not a valid"));
}

async function fixProductUnit(productId) {
  if (!productId) return;
  try {
    await api.updateProduct(productId, { unit: "piece" });
  } catch { /* ignore — retry stock/return anyway */ }
}

async function adjustStockSafe(productId, type, qty) {
  let r = await api.adjustStock(productId, type, qty);
  if (r?.success || !isUnitEnumError(r)) return r;
  await fixProductUnit(productId);
  return api.adjustStock(productId, type, qty);
}

function itemProductIds(payload, purchases = []) {
  const ids = [];
  for (const it of payload.items || []) {
    let id = pid(it.productId || it.product);
    if (!id && it.purchaseId) {
      const purchase = purchases.find((p) => String(p._id) === String(it.purchaseId));
      id = pid(purchase?.product);
    }
    if (id) ids.push(id);
  }
  return [...new Set(ids)];
}

export async function listPurchaseReturns() {
  try {
    const r = await api.getPurchaseReturns();
    if (r?.success) return { success: true, returns: r.returns || [] };
    if (!isMissingRoute(r) && r?.message) return { success: false, message: r.message, returns: read(PR_KEY) };
  } catch { /* use local */ }
  return { success: true, returns: read(PR_KEY) };
}

export async function savePurchaseReturn(payload, { products = [], purchases = [] } = {}) {
  try {
    let r = await api.addPurchaseReturn(payload);
    if (!r?.success && isUnitEnumError(r)) {
      for (const id of itemProductIds(payload, purchases)) await fixProductUnit(id);
      r = await api.addPurchaseReturn(payload);
    }
    if (r?.success) {
      try { await afterPurchaseReturnFinance(payload, purchases); } catch (e) { console.error(e); }
      return r;
    }
    if (!isMissingRoute(r)) return r || { success: false, message: "Error" };
  } catch { /* use local */ }

  const savedItems = [];
  const left = {};
  for (const it of payload.items || []) {
    const qty = Number(it.qty) || 0;
    if (qty <= 0) continue;
    let productId = pid(it.productId || it.product);
    let purchase = null;
    if (it.purchaseId) {
      purchase = purchases.find((p) => String(p._id) === String(it.purchaseId));
      if (!purchase) return { success: false, message: "Purchase not found" };
      productId = productId || pid(purchase.product);
    }
    const prod = products.find((p) => String(p._id) === String(productId));
    if (!prod) return { success: false, message: "Product not found" };
    const available = left[productId] != null ? left[productId] : (Number(prod.stock) || 0);
    if (qty > available + 1e-9) {
      return { success: false, message: `"${prod.name}" stock is only ${available}` };
    }
    const adj = await adjustStockSafe(productId, "remove", qty);
    if (!adj?.success) return adj || { success: false, message: "Could not update stock" };
    left[productId] = available - qty;
    const rate = it.rate != null && Number.isFinite(Number(it.rate))
      ? Number(it.rate)
      : (Number(purchase?.rate) || Number(prod.purchasePrice) || Number(prod.price) || 0);
    savedItems.push({
      purchase: it.purchaseId || null,
      product: productId,
      productName: purchase?.productName || prod.name,
      category: purchase?.category || prod.category || "",
      qty,
      rate,
      amount: +(rate * qty).toFixed(2),
    });
  }
  if (!savedItems.length) return { success: false, message: "Return quantity is required" };

  const firstPur = purchases.find((p) => String(p._id) === String(payload.items?.[0]?.purchaseId));
  const list = read(PR_KEY);
  const doc = {
    _id: "lr_" + Date.now().toString(36),
    invoice: firstPur?.invoice || firstPur?.invoiceNum || "STOCK",
    returnInvoice: nextInv(list, "PR"),
    supplier: payload.supplier || firstPur?.supplier || firstPur?.supplierName || "",
    date: payload.date,
    items: savedItems,
    total: savedItems.reduce((s, it) => s + (Number(it.amount) || 0), 0),
    notes: payload.notes || "",
  };
  write(PR_KEY, [doc, ...list]);
  try { await afterPurchaseReturnFinance(payload, purchases); } catch (e) { console.error(e); }
  return { success: true, return: doc };
}

export async function removePurchaseReturn(id) {
  try {
    const r = await api.deletePurchaseReturn(id);
    if (r?.success) return r;
    if (!isMissingRoute(r) && !String(id).startsWith("lr_")) return r || { success: false, message: "Error" };
  } catch { /* use local */ }

  const list = read(PR_KEY);
  const doc = list.find((x) => String(x._id) === String(id));
  if (!doc) return { success: false, message: "Not found" };
  for (const it of doc.items || []) {
    const productId = pid(it.product);
    const qty = Number(it.qty) || 0;
    if (productId && qty) {
      const adj = await adjustStockSafe(productId, "add", qty);
      if (!adj?.success) return adj || { success: false, message: "Could not restore stock" };
    }
  }
  write(PR_KEY, list.filter((x) => String(x._id) !== String(id)));
  return { success: true };
}

export async function listSaleReturns() {
  try {
    const r = await api.getSaleReturns();
    if (r?.success) return { success: true, returns: r.returns || [] };
    if (!isMissingRoute(r) && r?.message) return { success: false, message: r.message, returns: read(SR_KEY) };
  } catch { /* use local */ }
  return { success: true, returns: read(SR_KEY) };
}

export async function saveSaleReturn(payload, { products = [], sales = [] } = {}) {
  try {
    let r = await api.addSaleReturn(payload);
    if (!r?.success && isUnitEnumError(r)) {
      for (const id of itemProductIds(payload)) await fixProductUnit(id);
      r = await api.addSaleReturn(payload);
    }
    if (r?.success) {
      try { await afterSaleReturnFinance(payload, sales); } catch (e) { console.error(e); }
      return r;
    }
    if (!isMissingRoute(r) && r?.message) return r;
  } catch { /* use local */ }

  const sale = sales.find((s) => String(s._id) === String(payload.saleId));
  if (!sale) return { success: false, message: "Sale not found" };
  const savedItems = [];
  for (const it of payload.items || []) {
    const qty = Number(it.qty) || 0;
    if (qty <= 0) continue;
    let productId = pid(it.productId || it.product);
    let prod = products.find((p) => String(p._id) === String(productId) || String(p.id) === String(productId));
    if (!prod) {
      const name = String(it.productName || "").toLowerCase().trim();
      if (name) prod = products.find((p) => String(p.name || "").toLowerCase().trim() === name);
    }
    if (!prod && sale.items) {
      const saleItem = sale.items.find((si) => pid(si.productId || si.product) === productId)
        || sale.items.find((si) => si.productName && products.find((p) => p.name === si.productName));
      if (saleItem?.productName) {
        prod = products.find((p) => p.name === saleItem.productName);
      }
    }
    productId = pid(prod?._id || prod?.id) || productId;
    if (!productId) return { success: false, message: "Product not found on this sale" };
    const adj = await adjustStockSafe(productId, "add", qty);
    if (!adj?.success) return adj || { success: false, message: "Could not update stock" };
    const rate = it.rate != null && Number.isFinite(Number(it.rate))
      ? Number(it.rate)
      : (Number(prod?.price) || 0);
    savedItems.push({
      product: productId,
      productName: prod?.name || it.productName || "",
      category: prod?.category || "",
      qty,
      rate,
      amount: +(rate * qty).toFixed(2),
    });
  }
  if (!savedItems.length) return { success: false, message: "Return quantity is required" };
  const list = read(SR_KEY);
  const doc = {
    _id: "lr_" + Date.now().toString(36),
    sale: payload.saleId,
    invoice: sale.invoice || sale.invoiceNum || "",
    returnInvoice: nextInv(list, "SR"),
    customer: sale.customer || "",
    date: payload.date,
    items: savedItems,
    total: savedItems.reduce((s, it) => s + (Number(it.amount) || 0), 0),
    notes: payload.notes || "",
  };
  write(SR_KEY, [doc, ...list]);
  try { await afterSaleReturnFinance(payload, sales); } catch (e) { console.error(e); }
  return { success: true, return: doc };
}

export async function removeSaleReturn(id) {
  try {
    const r = await api.deleteSaleReturn(id);
    if (r?.success) return r;
    if (!isMissingRoute(r) && !String(id).startsWith("lr_")) return r || { success: false, message: "Error" };
  } catch { /* use local */ }

  const list = read(SR_KEY);
  const doc = list.find((x) => String(x._id) === String(id));
  if (!doc) return { success: false, message: "Not found" };
  for (const it of doc.items || []) {
    const productId = pid(it.product);
    const qty = Number(it.qty) || 0;
    if (productId && qty) {
      const adj = await adjustStockSafe(productId, "remove", qty);
      if (!adj?.success) return adj || { success: false, message: "Could not update stock" };
    }
  }
  write(SR_KEY, list.filter((x) => String(x._id) !== String(id)));
  return { success: true };
}
