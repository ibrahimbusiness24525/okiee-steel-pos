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

function purchaseUnitIndex(purchases = []) {
  const byId = new Map();
  const byName = new Map();
  const put = (map, key, unit, stamp) => {
    if (!key || !unit) return;
    const cur = map.get(key);
    if (!cur || stamp >= cur.stamp) map.set(key, { unit, stamp });
  };
  for (const b of purchases || []) {
    const unit = String(b.unit || b.rows?.[0]?.unit || "").trim().toLowerCase();
    if (!unit) continue;
    const stamp = `${b.createdAt || ""}|${b.date || ""}`;
    const cat = String(b.category || "").toLowerCase();
    const name = String(b.productName || "").trim().toLowerCase();
    put(byId, pidOf(b.product), unit, stamp);
    if (name) put(byName, `${cat}|${name}`, unit, stamp);
  }
  return { byId, byName };
}

export function applyHardwareSalePrices(products, purchases) {
  if (!Array.isArray(products)) return products;
  const units = purchaseUnitIndex(purchases);
  return products.map((p) => {
    const cat = String(p.category || "").toLowerCase();
    let next = p;
    if (cat === "hardware") {
      const sale = hardwareSalePrice(p, purchases);
      if (sale !== Number(p.price)) next = { ...next, price: sale };
    }
    if (cat === "hardware" || cat === "custom") {
      const pid = pidOf(p._id || p.id);
      const name = String(p.name || "").trim().toLowerCase();
      const idHit = pid ? units.byId.get(pid) : null;
      const nameHit = name ? units.byName.get(`${cat}|${name}`) : null;
      const hit = idHit && nameHit ? (idHit.stamp >= nameHit.stamp ? idHit : nameHit) : (idHit || nameHit);
      const unit = hit?.unit || String(p.stockUnit || "").toLowerCase();
      if (unit && String(next.unit || "piece").toLowerCase() !== unit) {
        next = { ...next, unit, stockUnit: unit };
      } else if (p.stockUnit && !p.unit) {
        next = { ...next, unit: String(p.stockUnit).toLowerCase() };
      }
    }
    return next;
  });
}

