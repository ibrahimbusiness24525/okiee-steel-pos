export const formatPKR = (n) => "PKR " + Math.round(Number(n)||0).toLocaleString("en-PK");
export const todayStr  = () => new Date().toISOString().slice(0,10);

// ─── Thermal print page-height fix ──────────────────────────────────────────
// `@page { size: 65mm auto; }` is NOT valid CSS (the `size` shorthand only
// accepts a length pair OR the single keyword `auto` — mixing a length with
// `auto` is invalid). Browsers silently ignore the whole rule when this
// happens and fall back to their default paper size (usually A4/Letter,
// ~279-297mm tall). Short invoices fit inside that default page and print
// fine; once an invoice's content grows past that height (in practice this
// starts showing once a bill has ~17+ line items) it overflows onto a
// second "page" that the thermal printer either cuts off or refuses to
// print, making the invoice look like it "didn't come out".
// Fix: measure the actual rendered content height and set an explicit
// (valid) `size: 65mm <height>mm;` so the page is always exactly as tall
// as the receipt, no matter how many items it has.
export const pxToPageHeightMM = (el) => {
  const heightPx = (el && (el.scrollHeight || el.offsetHeight)) || 300;
  // 96 CSS px per inch, 25.4mm per inch, +10mm safety buffer so nothing
  // ever gets clipped at the very bottom of long invoices.
  return Math.ceil((heightPx * 25.4) / 96) + 10;
};

// ─── Chader/weight helpers (kg + grams) ────────────────────────────────────
// Weight is always stored internally as ONE decimal number of kilograms
// (e.g. 12.6 for "12kg 600g"). These helpers convert between that decimal
// and separate kg/gram parts so entry + display is never wrong/ambiguous.

// decimal kg -> { kg, g }  (rounded to the nearest gram to avoid float drift)
export const decimalKgToParts = (dec) => {
  const totalGrams = Math.round((Number(dec) || 0) * 1000);
  const kg = Math.trunc(totalGrams / 1000);
  const g  = Math.abs(totalGrams) % 1000;
  return { kg, g };
};

// kg part + gram part (0-999) -> decimal kg, rounded to 3 decimals (gram precision)
export const partsToDecimalKg = (kg, g) => {
  const k = Number(kg) || 0;
  let gr  = Number(g) || 0;
  if (gr > 999) gr = 999; // grams can't reach 1000, that would be +1kg
  if (gr < 0)   gr = 0;
  return Math.round((k * 1000 + gr)) / 1000;
};

// decimal kg -> "12kg 600g" / "12kg" / "600g" / "0kg" for display everywhere
export const formatWeightKgG = (dec) => {
  const { kg, g } = decimalKgToParts(dec);
  if (!kg && !g) return "0kg";
  if (!g) return `${kg}kg`;
  if (!kg) return `${g}g`;
  return `${kg}kg ${g}g`;
};

// Shop Profile helpers
export const SHOP_PROFILE_KEY = "steelpos_shop_profile";
export const defaultShopProfile = () => ({
  shopName: "", shopNameUr: "", address: "", addressUr: "", logoBase64: "",
  owners: [{ name: "", nameUr: "", phone: "" }],
});
export const loadShopProfile = () => {
  try { const s = localStorage.getItem(SHOP_PROFILE_KEY); return s ? JSON.parse(s) : defaultShopProfile(); }
  catch { return defaultShopProfile(); }
};
export const saveShopProfile = (p) => localStorage.setItem(SHOP_PROFILE_KEY, JSON.stringify(p));
