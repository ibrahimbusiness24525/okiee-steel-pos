// Convertible families: qty_to = qty_from * (fromFactor / toFactor)
// Price is inverse: price_to = price_from * (toFactor / fromFactor)
const UNIT_FAMILY = {
  piece:  { family: "count", factor: 1 },
  pair:   { family: "count", factor: 2 },
  dozen:  { family: "count", factor: 12 },
  gram:   { family: "weight", factor: 1 },
  kg:     { family: "weight", factor: 1000 },
  ton:    { family: "weight", factor: 1000000 },
  ml:     { family: "volume", factor: 1 },
  liter:  { family: "volume", factor: 1000 },
  meter:  { family: "length", factor: 1 },
  feet:   { family: "length", factor: 0.3048 },
};

function norm(unit) {
  return String(unit || "piece").toLowerCase();
}

function info(unit) {
  return UNIT_FAMILY[norm(unit)] || null;
}

export function convertQuantity(qty, fromUnit, toUnit) {
  const n = Number(qty) || 0;
  const from = info(fromUnit);
  const to = info(toUnit);
  if (!from || !to || from.family !== to.family) {
    return norm(fromUnit) === norm(toUnit) ? n : n;
  }
  if (from.factor === to.factor) return n;
  return n * (from.factor / to.factor);
}

export function convertPrice(price, fromUnit, toUnit) {
  const n = Number(price) || 0;
  const from = info(fromUnit);
  const to = info(toUnit);
  if (!from || !to || from.family !== to.family) {
    return n;
  }
  if (from.factor === to.factor) return n;
  return n * (to.factor / from.factor);
}

export function getRelatedUnit(unit) {
  const u = norm(unit);
  const related = {
    dozen: "piece",
    piece: "dozen",
    pair: "piece",
    kg: "gram",
    gram: "kg",
    ton: "kg",
    liter: "ml",
    ml: "liter",
    meter: "feet",
    feet: "meter",
  };
  return related[u] || null;
}

export function canConvert(unit1, unit2) {
  const a = info(unit1);
  const b = info(unit2);
  if (norm(unit1) === norm(unit2)) return true;
  return !!(a && b && a.family === b.family);
}

export function productUnitOf(product, fallback = "piece") {
  const u = String(product?.stockUnit || product?.unit || fallback || "piece").trim().toLowerCase();
  return u || fallback || "piece";
}

export function getUnitLabel(unit) {
  const labels = {
    piece: "Piece",
    dozen: "Dozen",
    kg: "Kg",
    gram: "Gram",
    meter: "Meter",
    liter: "Liter",
    ml: "Ml",
    box: "Box",
    carton: "Carton",
    bundle: "Bundle",
    packet: "Packet",
    set: "Set",
    pair: "Pair",
    feet: "Feet",
    ton: "Ton",
  };
  return labels[norm(unit)] || "Piece";
}

export const unitOptions = [
  { value: "piece", label: "Piece" },
  { value: "dozen", label: "Dozen" },
  { value: "pair", label: "Pair" },
  { value: "kg", label: "Kg" },
  { value: "gram", label: "Gram" },
  { value: "ton", label: "Ton" },
  { value: "liter", label: "Liter" },
  { value: "ml", label: "Ml" },
  { value: "meter", label: "Meter" },
  { value: "feet", label: "Feet" },
  { value: "box", label: "Box" },
  { value: "carton", label: "Carton" },
  { value: "bundle", label: "Bundle" },
  { value: "packet", label: "Packet" },
  { value: "set", label: "Set" },
];
