function pidOf(v) {
  if (!v) return "";
  if (typeof v === "object") return String(v._id || v.id || "");
  return String(v);
}

export function hardwareSaleFromPurchases(product, purchases = []) {
  const pid = pidOf(product?._id || product?.id);
  const name = String(product?.name || "").trim().toLowerCase();
  for (const b of purchases || []) {
    const bid = pidOf(b.product);
    const bname = String(b.productName || "").trim().toLowerCase();
    if (pid && bid === pid) {
      const sp = Number(b.rows?.[0]?.salePrice) || 0;
      if (sp > 0) return sp;
    } else if (name && bname === name && String(b.category || "").toLowerCase() === "hardware") {
      const sp = Number(b.rows?.[0]?.salePrice) || 0;
      if (sp > 0) return sp;
    }
  }
  return 0;
}

/** Hardware: `price` is sale, `purchasePrice` is cost. Recover sale only if missing. */
export function hardwareSalePrice(product, purchases = []) {
  const listed = Number(product?.price) || 0;
  if (listed > 0) return listed;
  const fromBill = hardwareSaleFromPurchases(product, purchases);
  if (fromBill > 0) return fromBill;
  return listed;
}

export function applyHardwareSalePrices(products, purchases) {
  if (!Array.isArray(products)) return products;
  return products.map((p) => {
    const cat = String(p.category || "").toLowerCase();
    let next = p;
    if (cat === "hardware") {
      const sale = hardwareSalePrice(p, purchases);
      if (sale !== Number(p.price)) next = { ...next, price: sale };
    }
    if (cat === "hardware" || cat === "custom") {
      const unit = latestPurchaseUnit(p, purchases) || String(p.stockUnit || "").toLowerCase();
      if (unit && String(next.unit || "piece").toLowerCase() !== unit) {
        next = { ...next, unit, stockUnit: unit };
      } else if (p.stockUnit && !p.unit) {
        next = { ...next, unit: String(p.stockUnit).toLowerCase() };
      }
    }
    return next;
  });
}

function latestPurchaseUnit(product, purchases = []) {
  const pid = pidOf(product?._id || product?.id);
  const name = String(product?.name || "").trim().toLowerCase();
  let unit = "";
  let stamp = "";
  for (const b of purchases || []) {
    const bid = pidOf(b.product);
    const bname = String(b.productName || "").trim().toLowerCase();
    const same = (pid && bid === pid) || (name && bname === name && String(b.category || "").toLowerCase() === String(product?.category || "").toLowerCase());
    if (!same) continue;
    const u = String(b.unit || b.rows?.[0]?.unit || "").trim().toLowerCase();
    if (!u) continue;
    const s = `${b.createdAt || ""}|${b.date || ""}`;
    if (!unit || s >= stamp) {
      unit = u;
      stamp = s;
    }
  }
  return unit;
}
