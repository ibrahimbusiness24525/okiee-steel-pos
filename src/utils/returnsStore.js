import { api } from "./api";

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
    const r = await api.addPurchaseReturn(payload);
    if (r?.success) return r;
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
    const adj = await api.adjustStock(productId, "remove", qty);
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
      const adj = await api.adjustStock(productId, "add", qty);
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
    const r = await api.addSaleReturn(payload);
    if (r?.success) return r;
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
    const adj = await api.adjustStock(productId, "add", qty);
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
      const adj = await api.adjustStock(productId, "remove", qty);
      if (!adj?.success) return adj || { success: false, message: "Could not update stock" };
    }
  }
  write(SR_KEY, list.filter((x) => String(x._id) !== String(id)));
  return { success: true };
}
