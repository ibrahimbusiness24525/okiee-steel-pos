import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { useResponsive, Icon, ICONS } from "./shared";
import { api } from "../utils/api";
import { formatPKR, todayStr } from "../utils/helpers";

const LS = {
  brands: "steelpos_hw_brands",
  categories: "steelpos_hw_categories",
  groups: "steelpos_hw_groups",
  locations: "steelpos_hw_locations",
};
const DEFAULT_CATS = ["Nuts", "Bolts", "Screws", "Washers", "Hinges", "Locks", "Tools", "Fittings", "Valves", "Other"];
const DEFAULT_LOCS = ["Rack A", "Rack B", "Shop Floor", "Godown"];
const UNITS = ["piece", "kg", "set", "bundle", "box", "dozen", "pair", "packet", "meter", "feet"];
const TAXES = ["", "GST 0%", "GST 5%", "GST 17%", "GST 18%"];

const EMPTY = {
  name: "", barcode: "", autoBarcode: true, purchasePrice: "", price: "",
  brand: "", hwCategory: "", subCategory: "", group: "",
  stock: "", lowStockThreshold: "10", location: "", isComposite: false,
  photo: "", suppliers: [], unit: "piece", secondaryUnit: "",
  tax: "", taxInclusive: true, variations: [],
};

function loadList(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch { /* ignore */ }
  return fallback;
}
function saveList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}
function genBarcode() {
  const n = Date.now().toString(36).toUpperCase();
  const r = Math.floor(100 + Math.random() * 900);
  return `HW-${n}-${r}`;
}
function mainSupplierName(p) {
  const list = Array.isArray(p.suppliers) ? p.suppliers : [];
  const main = list.find(s => s.isMain) || list[0];
  return main?.name || "";
}
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 180;
      let w = img.width, h = img.height;
      if (w > h && w > max) { h = (h * max) / w; w = max; }
      else if (h > max) { w = (w * max) / h; h = max; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("image")); };
    img.src = url;
  });
}
function Field({ label, required, children, labelS }) {
  return (
    <div>
      <label style={labelS}>{label}{required && <span style={{ color: "#ef4444", marginLeft: 3 }}>*</span>}</label>
      {children}
    </div>
  );
}

function miniBtn(color) {
  return {
    width: 30, flexShrink: 0, border: "none", borderRadius: 6, cursor: "pointer",
    background: color, color: "#fff", fontWeight: 800, fontSize: 15, lineHeight: 1,
  };
}

function ManageSelect({ value, onChange, options, onAdd, onRemove, inp, th }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inp, flex: 1 }}>
        <option value="">—</option>
        {options.map(o => <option key={o} value={o} style={{ background: th.bgModal }}>{o}</option>)}
      </select>
      <button type="button" title="+" onClick={onAdd} style={miniBtn("#2563eb")}>+</button>
      <button type="button" title="−" onClick={onRemove} style={miniBtn("#dc2626")}>−</button>
    </div>
  );
}

function ActionBtn({ label, color, icon, onClick, disabled, isMobile }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{
        minWidth: isMobile ? 0 : 140, flex: isMobile ? 1 : "0 0 auto",
        padding: isMobile ? "12px 10px" : "14px 18px", borderRadius: 10, border: "none",
        cursor: disabled ? "not-allowed" : "pointer", background: disabled ? "#94a3b8" : color,
        color: "#fff", fontWeight: 800, fontSize: isMobile ? 12 : 14,
        boxShadow: disabled ? "none" : "0 3px 0 rgba(0,0,0,0.18)",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4, opacity: disabled ? 0.6 : 1,
      }}>
      <span style={{ fontSize: 20, lineHeight: 1 }}>{icon}</span>
      {label}
    </button>
  );
}

function fromProduct(p) {
  if (!p) return { ...EMPTY, barcode: genBarcode() };
  return {
    name: p.name || "",
    barcode: p.barcode || "",
    autoBarcode: !p.barcode,
    purchasePrice: p.purchasePrice != null && p.purchasePrice !== "" ? String(p.purchasePrice) : "",
    price: p.price != null && p.price !== "" ? String(p.price) : "",
    brand: p.brand || "",
    hwCategory: p.subType || p.hwCategory || "",
    subCategory: p.subCategory || "",
    group: p.group || "",
    stock: p.stock != null ? String(p.stock) : "",
    lowStockThreshold: p.lowStockThreshold != null ? String(p.lowStockThreshold) : "10",
    location: p.location || "",
    isComposite: !!p.isComposite,
    photo: p.photo || "",
    suppliers: Array.isArray(p.suppliers) ? p.suppliers.map(s => ({ ...s })) : [],
    unit: p.unit || "piece",
    secondaryUnit: p.secondaryUnit || "",
    tax: p.tax || "",
    taxInclusive: p.taxInclusive !== false,
    variations: Array.isArray(p.variations) ? [...p.variations] : [],
  };
}

export default function HardwareManageModal({ products, loadProducts, loadPurchases, seed, onClose }) {
  const th = useTheme();
  const { lang } = useLang();
  const { isMobile, width } = useResponsive();
  const isUrdu = lang === "ur";
  const fileRef = useRef(null);
  const saveRef = useRef(null);

  const [tab, setTab] = useState("create");
  const [form, setForm] = useState(() => fromProduct(seed));
  const [editingId, setEditingId] = useState(seed?._id || null);
  const [origStock, setOrigStock] = useState(Number(seed?.stock) || 0);
  const [saving, setSaving] = useState(false);
  const [searchBy, setSearchBy] = useState("name");
  const [search, setSearch] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [variationName, setVariationName] = useState("");
  const [showVarInput, setShowVarInput] = useState(false);

  const [brands, setBrands] = useState(() => loadList(LS.brands, []));
  const [hwCats, setHwCats] = useState(() => loadList(LS.categories, DEFAULT_CATS));
  const [groups, setGroups] = useState(() => loadList(LS.groups, []));
  const [locations, setLocations] = useState(() => loadList(LS.locations, DEFAULT_LOCS));

  const L = isUrdu ? {
    title: "ہارڈ ویئر آئٹمز", create: "آئٹم بنائیں", history: "لین دین کی تاریخ",
    excel: "ایکسل سے درآمد", utils: "یوٹیلیٹیز", variations: "ویری ایشنز",
    barcodes: "بارکوڈ پرنٹ", itemName: "آئٹم کا نام", barcode: "بارکوڈ",
    auto: "آٹو", cost: "خریداری قیمت", sale: "فروخت قیمت", brand: "برانڈ",
    category: "قسم", subCat: "ذیلی قسم", group: "گروپ", stock: "موجودہ اسٹاک",
    lowStock: "کم اسٹاک ویلیو", location: "لوکیشن / ریک", composite: "کمپوزٹ ہے",
    picture: "تصویر (اختیاری)", upload: "اپلوڈ", clear: "صاف",
    addVar: "ویری ایشن شامل کریں", suppliers: "سپلائرز", setMain: "مین بنائیں",
    unit: "اکائی", baseUnit: "بنیادی اکائی", secUnit: "ثانوی اکائی",
    tax: "ٹیکس", selectTax: "ٹیکس منتخب کریں", included: "فروخت قیمت میں شامل",
    addTax: "فروخت قیمت پر شامل کریں", save: "محفوظ (F5)", update: "ترمیم / اپڈیٹ",
    del: "حذف", clearFields: "فیلڈز صاف کریں", searchBy: "تلاش",
    byName: "نام", byCat: "قسم", bySup: "مین سپلائر", byBar: "بارکوڈ", byGroup: "گروپ",
    total: "کل آئٹمز", coming: "جلد دستیاب ہوگا",
    addOpt: "نیا آپشن لکھیں", already: "یہ پہلے سے موجود ہے",
    needName: "آئٹم کا نام ضروری ہے", needCost: "خریداری قیمت ضروری ہے",
    needSale: "فروخت قیمت ضروری ہے", saved: "آئٹم محفوظ ہو گیا",
    updated: "آئٹم اپڈیٹ ہو گیا", delConfirm: "کیا یہ آئٹم حذف کریں؟",
  } : {
    title: "Manage Hardware Items", create: "Create Items", history: "Item Transaction History",
    excel: "Import From Excel", utils: "Utilities", variations: "Create Variations",
    barcodes: "Print Barcodes", itemName: "Item Name", barcode: "BarCode",
    auto: "Auto", cost: "Cost Price", sale: "Sale Price", brand: "Brand",
    category: "Category", subCat: "Sub-Category", group: "Group", stock: "Current Stock",
    lowStock: "Low Stock Value", location: "Location / Rack", composite: "Is Composite",
    picture: "Picture (Optional)", upload: "Upload", clear: "Clear",
    addVar: "Add Variations", suppliers: "Suppliers", setMain: "Set As Main",
    unit: "Unit", baseUnit: "Base Unit", secUnit: "Secondary Unit",
    tax: "Tax", selectTax: "Select Tax", included: "Already included in the Sales Price",
    addTax: "Add to the Sales Price", save: "Save (F5)", update: "Edit/Update",
    del: "Delete", clearFields: "Clear Fields", searchBy: "Search by",
    byName: "Item Name", byCat: "Category", bySup: "Main Supplier", byBar: "Barcode", byGroup: "Group",
    total: "Total Items", coming: "This section will be available in a later update.",
    addOpt: "Enter a new option", already: "Already in the list",
    needName: "Item Name is required", needCost: "Cost Price is required",
    needSale: "Sale Price is required", saved: "Hardware item saved",
    updated: "Hardware item updated", delConfirm: "Delete this hardware item?",
  };

  useEffect(() => {
    setForm(fromProduct(seed));
    setEditingId(seed?._id || null);
    setOrigStock(Number(seed?.stock) || 0);
  }, [seed]);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    if (form.autoBarcode && !editingId) setForm(p => (p.barcode ? p : { ...p, barcode: genBarcode() }));
  }, [form.autoBarcode, editingId]);

  const hwProducts = useMemo(
    () => (products || []).filter(p => p.category === "Hardware"),
    [products]
  );

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return hwProducts;
    return hwProducts.filter(p => {
      if (searchBy === "name") return (p.name || "").toLowerCase().includes(q);
      if (searchBy === "category") return (p.subType || p.hwCategory || "").toLowerCase().includes(q);
      if (searchBy === "supplier") return mainSupplierName(p).toLowerCase().includes(q);
      if (searchBy === "barcode") return (p.barcode || "").toLowerCase().includes(q);
      if (searchBy === "group") return (p.group || "").toLowerCase().includes(q);
      return true;
    });
  }, [hwProducts, search, searchBy]);

  const addToList = (key, list, setList) => {
    const v = window.prompt(L.addOpt);
    if (!v || !v.trim()) return;
    const next = v.trim();
    if (list.some(x => x.toLowerCase() === next.toLowerCase())) { alert(L.already); return; }
    const updated = [...list, next];
    setList(updated); saveList(key, updated);
  };
  const removeFromList = (key, list, setList, current, onClear) => {
    if (!current) return;
    const updated = list.filter(x => x !== current);
    setList(updated); saveList(key, updated);
    if (onClear) onClear();
  };

  const clearFields = () => {
    setForm({ ...EMPTY, barcode: genBarcode(), autoBarcode: true });
    setEditingId(null);
    setOrigStock(0);
    setSupplierName("");
    setVariationName("");
    setShowVarInput(false);
  };

  const loadRow = (p) => {
    setForm(fromProduct(p));
    setEditingId(p._id);
    setOrigStock(Number(p.stock) || 0);
    setTab("create");
  };

  const canSave = () => !!(form.name && form.name.trim() && form.purchasePrice !== "" && form.price !== "");

  const buildPayload = () => {
    let barcode = (form.barcode || "").trim();
    if (form.autoBarcode && !barcode) barcode = genBarcode();
    return {
      name: form.name.trim(),
      category: "Hardware",
      barcode,
      brand: form.brand || "",
      subType: form.hwCategory || "",
      subCategory: form.subCategory || "",
      group: form.group || "",
      stock: Number(form.stock) || 0,
      lowStockThreshold: Number(form.lowStockThreshold) || 0,
      location: form.location || "",
      isComposite: !!form.isComposite,
      photo: form.photo || "",
      suppliers: form.suppliers,
      unit: form.unit || "piece",
      secondaryUnit: form.secondaryUnit || "",
      tax: form.tax || "",
      taxInclusive: !!form.taxInclusive,
      variations: form.variations,
      purchasePrice: parseFloat(form.purchasePrice) || 0,
      price: parseFloat(form.price) || 0,
    };
  };

  const refresh = async () => {
    await loadProducts();
    if (loadPurchases) await loadPurchases();
  };

  const openingPurchase = async (productId, qty, payload, supplier) => {
    const amount = Number(qty) || 0;
    if (!productId || amount <= 0) return { success: true };
    const rate = Number(payload.purchasePrice) || 0;
    return api.addPurchase({
      supplier: supplier || "Opening Stock",
      date: todayStr(),
      product: productId,
      productName: payload.name,
      category: payload.category || "Hardware",
      qty: amount,
      rate,
      total: +(rate * amount).toFixed(2),
      productPrice: rate,
      rows: [{ qty: amount, purchasePrice: rate, salePrice: Number(payload.price) || 0 }],
    });
  };
  const saveNew = async () => {
    if (!form.name.trim()) { alert(L.needName); return; }
    if (form.purchasePrice === "") { alert(L.needCost); return; }
    if (form.price === "") { alert(L.needSale); return; }
    setSaving(true);
    const payload = buildPayload();
    const qty = Number(payload.stock) || 0;
    const typedSup = (supplierName || "").trim();
    let suppliers = Array.isArray(payload.suppliers) ? [...payload.suppliers] : [];
    if (typedSup && !suppliers.some((s) => (s.name || "").toLowerCase() === typedSup.toLowerCase())) {
      suppliers.push({ name: typedSup, id: `S${suppliers.length + 1}`, isMain: suppliers.length === 0 });
    }
    const supplier = (suppliers.find((s) => s.isMain) || suppliers[0])?.name || typedSup || "Opening Stock";
    const res = await api.addProduct({ ...payload, suppliers, stock: 0 });
    if (!res.success) { alert(res.message); setSaving(false); return; }
    const productId = res.product?._id || res.product?.id;
    if (qty > 0 && productId) {
      const pur = await openingPurchase(productId, qty, payload, supplier);
      if (pur && pur.success === false) alert(pur.message);
    }
    await refresh();
    clearFields();
    setSaving(false);
  };

  const updateExisting = async () => {
    if (!editingId) return;
    if (!form.name.trim()) { alert(L.needName); return; }
    if (form.purchasePrice === "") { alert(L.needCost); return; }
    if (form.price === "") { alert(L.needSale); return; }
    setSaving(true);
    const payload = buildPayload();
    const res = await api.updateProduct(editingId, payload);
    if (!res.success) { alert(res.message); setSaving(false); return; }
    const nextStock = Number(form.stock) || 0;
    if (nextStock !== origStock) {
      const diff = nextStock - origStock;
      if (diff > 0) {
        const typedSup = (supplierName || "").trim();
        const supplier = (payload.suppliers?.find(s => s.isMain) || payload.suppliers?.[0])?.name || typedSup || "Opening Stock";
        const pur = await openingPurchase(editingId, diff, payload, supplier);
        if (pur && pur.success === false) alert(pur.message);
      } else {
        const adj = await api.adjustStock(editingId, "remove", Math.abs(diff));
        if (!adj.success) alert(adj.message);
      }
    }
    await refresh();
    setOrigStock(nextStock);
    setSaving(false);
  };

  const delCurrent = async () => {
    if (!editingId) return;
    if (!window.confirm(L.delConfirm)) return;
    const res = await api.deleteProduct(editingId);
    if (res.success) { await refresh(); clearFields(); }
    else alert(res.message);
  };

  saveRef.current = saveNew;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "F5") {
        e.preventDefault();
        if (!saving) saveRef.current?.();
      }
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  const inp = {
    background: th.input, border: `1px solid ${th.inputBorder}`, color: th.text,
    borderRadius: 8, padding: isMobile ? "9px 11px" : "8px 10px", fontSize: 13,
    outline: "none", width: "100%", boxSizing: "border-box",
  };
  const labelS = { color: th.textMuted, fontSize: 11, fontWeight: 700, marginBottom: 4, display: "block" };
  const boxS = {
    border: `1px solid ${th.border}`, borderRadius: 10, padding: 10,
    background: th.bgCard, minHeight: isMobile ? "auto" : 168,
  };
  const cols = width >= 1100 ? "1fr 1fr 1fr" : width >= 720 ? "1fr 1fr" : "1fr";
  const midCols = width >= 1100 ? "180px 1.2fr 1fr 1.1fr" : width >= 720 ? "1fr 1fr" : "1fr";

  const tabs = [
    { id: "create", label: L.create },
    { id: "history", label: L.history },
    { id: "excel", label: L.excel },
    { id: "utils", label: L.utils },
    { id: "variations", label: L.variations },
    { id: "barcodes", label: L.barcodes },
  ];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", flexDirection: "column", background: "rgba(15,23,42,0.55)" }}>
      <div style={{
        flex: 1, margin: isMobile ? 0 : 12, borderRadius: isMobile ? 0 : 14, overflow: "hidden",
        display: "flex", flexDirection: "column", background: th.bgModal, boxShadow: th.modalShadow,
        border: `1px solid ${th.border}`,
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
          padding: "10px 14px", borderBottom: `1px solid ${th.border}`, background: th.thHead, flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 18 }}>🔧</span>
            <h3 style={{ margin: 0, color: th.text, fontSize: isMobile ? 15 : 17, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {L.title}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: th.textDim, padding: 4 }}>
            <Icon path={ICONS.close} size={20} />
          </button>
        </div>

        <div style={{
          display: "flex", gap: 4, padding: "8px 10px 0", overflowX: "auto", flexShrink: 0,
          borderBottom: `1px solid ${th.border}`,
        }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "8px 12px", border: "none", cursor: "pointer", whiteSpace: "nowrap",
              borderRadius: "8px 8px 0 0", fontSize: 12, fontWeight: 700,
              background: tab === t.id ? th.bgModal : "transparent",
              color: tab === t.id ? "#0f766e" : th.textMuted,
              boxShadow: tab === t.id ? `inset 0 -2px 0 #0f766e` : "none",
            }}>{t.label}</button>
          ))}
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: isMobile ? 12 : 14 }}>
          {tab !== "create" ? (
            <div style={{ textAlign: "center", color: th.textDim, padding: "60px 16px", fontSize: 14 }}>{L.coming}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: cols, gap: 10 }}>
                <Field label={L.itemName} required labelS={labelS}>
                  <input value={form.name} onChange={e => set("name", e.target.value)} style={inp} placeholder={isUrdu ? "مثلاً 3/4 انچ نٹ" : "e.g. 3/4 inch Nut"} />
                </Field>
                <Field label={L.brand} labelS={labelS}>
                  <ManageSelect value={form.brand} onChange={v => set("brand", v)} options={brands} inp={inp} th={th}
                    onAdd={() => addToList(LS.brands, brands, setBrands)}
                    onRemove={() => removeFromList(LS.brands, brands, setBrands, form.brand, () => set("brand", ""))} />
                </Field>
                <Field label={L.stock} labelS={labelS}>
                  <input type="text" inputMode="decimal" value={form.stock} onChange={e => set("stock", e.target.value.replace(/[^0-9.]/g, ""))} style={inp} placeholder="0" />
                </Field>

                <Field label={L.barcode} labelS={labelS}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input value={form.barcode} onChange={e => setForm(p => ({ ...p, barcode: e.target.value, autoBarcode: false }))} style={{ ...inp, flex: 1 }} placeholder="HW-..." />
                    <label style={{ display: "flex", alignItems: "center", gap: 4, color: th.text, fontSize: 12, whiteSpace: "nowrap", fontWeight: 600 }}>
                      <input type="checkbox" checked={form.autoBarcode} onChange={e => {
                        const on = e.target.checked;
                        setForm(p => ({ ...p, autoBarcode: on, barcode: on ? (p.barcode || genBarcode()) : p.barcode }));
                      }} />
                      {L.auto}
                    </label>
                  </div>
                </Field>
                <Field label={L.category} labelS={labelS}>
                  <ManageSelect value={form.hwCategory} onChange={v => set("hwCategory", v)} options={hwCats} inp={inp} th={th}
                    onAdd={() => addToList(LS.categories, hwCats, setHwCats)}
                    onRemove={() => removeFromList(LS.categories, hwCats, setHwCats, form.hwCategory, () => set("hwCategory", ""))} />
                </Field>
                <Field label={L.lowStock} labelS={labelS}>
                  <input type="text" inputMode="decimal" value={form.lowStockThreshold} onChange={e => set("lowStockThreshold", e.target.value.replace(/[^0-9.]/g, ""))} style={inp} placeholder="10" />
                </Field>

                <Field label={L.cost} required labelS={labelS}>
                  <input type="text" inputMode="decimal" value={form.purchasePrice} onChange={e => set("purchasePrice", e.target.value.replace(/[^0-9.]/g, ""))} style={inp} placeholder="0" />
                </Field>
                <Field label={L.subCat} labelS={labelS}>
                  <input value={form.subCategory} onChange={e => set("subCategory", e.target.value)} style={inp} placeholder={isUrdu ? "ذیلی قسم" : "Sub-category"} />
                </Field>
                <Field label={L.location} labelS={labelS}>
                  <ManageSelect value={form.location} onChange={v => set("location", v)} options={locations} inp={inp} th={th}
                    onAdd={() => addToList(LS.locations, locations, setLocations)}
                    onRemove={() => removeFromList(LS.locations, locations, setLocations, form.location, () => set("location", ""))} />
                </Field>

                <Field label={L.sale} required labelS={labelS}>
                  <input type="text" inputMode="decimal" value={form.price} onChange={e => set("price", e.target.value.replace(/[^0-9.]/g, ""))} style={inp} placeholder="0" />
                </Field>
                <Field label={L.group} labelS={labelS}>
                  <ManageSelect value={form.group} onChange={v => set("group", v)} options={groups} inp={inp} th={th}
                    onAdd={() => addToList(LS.groups, groups, setGroups)}
                    onRemove={() => removeFromList(LS.groups, groups, setGroups, form.group, () => set("group", ""))} />
                </Field>
                <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 6 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, color: th.text, fontSize: 13, fontWeight: 600 }}>
                    <input type="checkbox" checked={form.isComposite} onChange={e => set("isComposite", e.target.checked)} />
                    {L.composite}
                  </label>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: midCols, gap: 10 }}>
                <div style={boxS}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: th.textMuted, marginBottom: 8 }}>{L.picture}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <div style={{
                      width: 72, height: 72, borderRadius: 8, flexShrink: 0, overflow: "hidden",
                      background: "rgba(124,110,247,0.12)", border: `1px dashed ${th.border}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {form.photo
                        ? <img src={form.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        : <span style={{ color: th.textDim, fontSize: 11 }}>IMG</span>}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <input ref={fileRef} type="file" accept="image/*" hidden onChange={async e => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try { set("photo", await resizeImage(f)); } catch { alert("Could not read image"); }
                        e.target.value = "";
                      }} />
                      <button type="button" onClick={() => fileRef.current?.click()} style={{ ...miniBtn("#0f766e"), width: "auto", padding: "6px 10px", fontSize: 12 }}>{L.upload}</button>
                      <button type="button" onClick={() => set("photo", "")} style={{ ...miniBtn("#64748b"), width: "auto", padding: "6px 10px", fontSize: 12 }}>{L.clear}</button>
                    </div>
                  </div>
                  <button type="button" onClick={() => setShowVarInput(v => !v)}
                    style={{ marginTop: 8, width: "100%", padding: "8px 10px", border: "none", borderRadius: 8, cursor: "pointer", background: "#0d9488", color: "#fff", fontWeight: 800, fontSize: 12 }}>
                    {L.addVar}
                  </button>
                  {showVarInput && (
                    <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                      <input value={variationName} onChange={e => setVariationName(e.target.value)} placeholder="e.g. 1/2 inch" style={{ ...inp, flex: 1 }} />
                      <button type="button" onClick={() => {
                        const v = variationName.trim();
                        if (!v) return;
                        setForm(p => ({ ...p, variations: [...p.variations, v] }));
                        setVariationName("");
                      }} style={miniBtn("#0f766e")}>+</button>
                    </div>
                  )}
                  {form.variations.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                      {form.variations.map((v, i) => (
                        <span key={i} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 20, background: "rgba(13,148,136,0.12)", color: "#0f766e", fontWeight: 700 }}>
                          {v}
                          <button type="button" onClick={() => setForm(p => ({ ...p, variations: p.variations.filter((_, j) => j !== i) }))}
                            style={{ marginLeft: 4, border: "none", background: "none", cursor: "pointer", color: "#0f766e" }}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div style={boxS}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: th.textMuted, marginBottom: 8 }}>{L.suppliers}</div>
                  <div style={{ maxHeight: 88, overflowY: "auto", border: `1px solid ${th.border}`, borderRadius: 6, marginBottom: 8 }}>
                    {form.suppliers.length === 0 && <div style={{ padding: 10, color: th.textDim, fontSize: 12, textAlign: "center" }}>—</div>}
                    {form.suppliers.map((s, i) => (
                      <div key={i} onClick={() => setForm(p => ({ ...p, suppliers: p.suppliers.map((x, j) => ({ ...x, isMain: j === i })) }))}
                        style={{
                          display: "flex", justifyContent: "space-between", padding: "6px 8px", cursor: "pointer", fontSize: 12,
                          background: s.isMain ? "rgba(37,99,235,0.1)" : "transparent", color: th.text, borderBottom: `1px solid ${th.border}`,
                        }}>
                        <span>{s.name}{s.isMain ? " ★" : ""}</span>
                        <span style={{ color: th.textDim }}>{s.id}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 4, marginBottom: 6 }}>
                    <input value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder={isUrdu ? "سپلائر کا نام" : "Supplier name"} style={{ ...inp, flex: 1 }} />
                    <button type="button" onClick={() => {
                      const n = supplierName.trim();
                      if (!n) return;
                      setForm(p => ({
                        ...p,
                        suppliers: [...p.suppliers, { name: n, id: `S${p.suppliers.length + 1}`, isMain: p.suppliers.length === 0 }],
                      }));
                      setSupplierName("");
                    }} style={miniBtn("#2563eb")}>+</button>
                    <button type="button" onClick={() => setForm(p => ({ ...p, suppliers: p.suppliers.filter(s => !s.isMain) }))} style={miniBtn("#dc2626")}>−</button>
                  </div>
                  <button type="button" onClick={() => {
                    if (!form.suppliers.length) return;
                  }} style={{ width: "100%", padding: "7px", borderRadius: 7, border: "none", cursor: "pointer", background: "#1d4ed8", color: "#fff", fontWeight: 700, fontSize: 12 }}>
                    {L.setMain}
                  </button>
                </div>

                <div style={boxS}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: th.textMuted, marginBottom: 8 }}>{L.unit}</div>
                  <Field label={L.baseUnit} labelS={labelS}>
                    <select value={form.unit} onChange={e => set("unit", e.target.value)} style={inp}>
                      {UNITS.map(u => <option key={u} value={u} style={{ background: th.bgModal }}>{u}</option>)}
                    </select>
                  </Field>
                  <div style={{ height: 8 }} />
                  <Field label={L.secUnit} labelS={labelS}>
                    <select value={form.secondaryUnit} onChange={e => set("secondaryUnit", e.target.value)} style={inp}>
                      <option value="">—</option>
                      {UNITS.map(u => <option key={u} value={u} style={{ background: th.bgModal }}>{u}</option>)}
                    </select>
                  </Field>
                </div>

                <div style={boxS}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: th.textMuted, marginBottom: 8 }}>{L.tax}</div>
                  <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                    <select value={form.tax} onChange={e => set("tax", e.target.value)} style={{ ...inp, flex: 1 }}>
                      <option value="">{L.selectTax}</option>
                      {TAXES.filter(Boolean).map(tx => <option key={tx} value={tx} style={{ background: th.bgModal }}>{tx}</option>)}
                    </select>
                    <button type="button" onClick={() => set("tax", "")} style={{ ...miniBtn("#64748b"), width: 32 }}>C</button>
                  </div>
                  <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: th.text, marginBottom: 8 }}>
                    <input type="radio" checked={form.taxInclusive} onChange={() => set("taxInclusive", true)} />
                    {L.included}
                  </label>
                  <label style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: th.text }}>
                    <input type="radio" checked={!form.taxInclusive} onChange={() => set("taxInclusive", false)} />
                    {L.addTax}
                  </label>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap", padding: "4px 0 2px" }}>
                <ActionBtn isMobile={isMobile} label={L.save} icon="💾" color="#2563eb" onClick={saveNew} disabled={saving || !canSave() || !!editingId} />
                <ActionBtn isMobile={isMobile} label={L.update} icon="🔄" color="#16a34a" onClick={updateExisting} disabled={saving || !editingId || !canSave()} />
                <ActionBtn isMobile={isMobile} label={L.del} icon="✖" color="#dc2626" onClick={delCurrent} disabled={saving || !editingId} />
                <ActionBtn isMobile={isMobile} label={L.clearFields} icon="🧹" color="#0d9488" onClick={clearFields} disabled={saving} />
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: th.textMuted }}>{L.searchBy}:</span>
                {[
                  ["name", L.byName], ["category", L.byCat], ["supplier", L.bySup], ["barcode", L.byBar], ["group", L.byGroup],
                ].map(([id, lab]) => (
                  <label key={id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: th.text, fontWeight: 600 }}>
                    <input type="radio" checked={searchBy === id} onChange={() => setSearchBy(id)} />
                    {lab}
                  </label>
                ))}
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="..."
                  style={{ ...inp, flex: 1, minWidth: 160 }} />
              </div>

              <div style={{ border: `1px solid ${th.border}`, borderRadius: 10, overflow: "hidden", background: th.bgCard }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 980 }}>
                    <thead>
                      <tr style={{ background: th.thHead }}>
                        {["Item Name", "Bar Code", "Cost Price", "Sale Price", "Unit", "Brand", "Category", "SubCategory", "Main Supplier", "Current Stock", "Low Stock", "Location/Rack", "Group"].map(h => (
                          <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: th.textMuted, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.length === 0 && (
                        <tr><td colSpan={13} style={{ textAlign: "center", padding: 28, color: th.textDim }}>{L.total}: 0</td></tr>
                      )}
                      {displayed.map(p => {
                        const active = p._id === editingId;
                        return (
                          <tr key={p._id} onClick={() => loadRow(p)}
                            style={{ cursor: "pointer", background: active ? "rgba(37,99,235,0.1)" : "transparent", borderTop: `1px solid ${th.border}` }}
                            onMouseEnter={e => { if (!active) e.currentTarget.style.background = th.rowHover; }}
                            onMouseLeave={e => { e.currentTarget.style.background = active ? "rgba(37,99,235,0.1)" : "transparent"; }}>
                            <td style={{ padding: "8px 10px", color: th.text, fontWeight: 700, whiteSpace: "nowrap" }}>{p.name}</td>
                            <td style={{ padding: "8px 10px", color: th.textMuted }}>{p.barcode || "—"}</td>
                            <td style={{ padding: "8px 10px", color: th.text }}>{formatPKR(Number(p.purchasePrice) || 0)}</td>
                            <td style={{ padding: "8px 10px", color: "#16a34a", fontWeight: 700 }}>{formatPKR(Number(p.price) || 0)}</td>
                            <td style={{ padding: "8px 10px", color: th.textMuted }}>{p.unit || "piece"}</td>
                            <td style={{ padding: "8px 10px", color: th.text }}>{p.brand || "—"}</td>
                            <td style={{ padding: "8px 10px", color: th.text }}>{p.subType || "—"}</td>
                            <td style={{ padding: "8px 10px", color: th.text }}>{p.subCategory || "—"}</td>
                            <td style={{ padding: "8px 10px", color: th.text }}>{mainSupplierName(p) || "—"}</td>
                            <td style={{ padding: "8px 10px", color: Number(p.stock) < Number(p.lowStockThreshold || 10) ? "#d97706" : th.text, fontWeight: 700 }}>{p.stock ?? 0}</td>
                            <td style={{ padding: "8px 10px", color: th.textMuted }}>{p.lowStockThreshold ?? 10}</td>
                            <td style={{ padding: "8px 10px", color: th.text }}>{p.location || "—"}</td>
                            <td style={{ padding: "8px 10px", color: th.text }}>{p.group || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "7px 12px", borderTop: `1px solid ${th.border}`, color: th.textMuted, fontSize: 12, fontWeight: 700 }}>
                  {L.total}: {displayed.length}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
