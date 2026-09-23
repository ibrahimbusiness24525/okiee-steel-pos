import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useTheme } from "../context/ThemeContext";
import { useLang } from "../context/LangContext";
import { decimalKgToParts, partsToDecimalKg, formatWeightKgG } from "../utils/helpers";

export function useResponsive() {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1200);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return { isMobile: w < 640, isTablet: w >= 640 && w < 1024, isDesktop: w >= 1024, width: w };
}

export const Icon = ({path,size=20}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={path}/>
  </svg>
);

const FIELD_SEL = 'input:not([type="hidden"]):not([disabled]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="file"]), select:not([disabled]), textarea:not([disabled])';

function fieldVisible(el) {
  if (!el || el.tabIndex < 0) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  const st = window.getComputedStyle(el);
  if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** Enter in a popup field moves focus to the next field instead of submitting. */
export function handleEnterNextField(e, root) {
  if (!root || e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "s")) return;
  if (e.key !== "Enter" || e.shiftKey) return;
  const t = e.target;
  if (!(t instanceof HTMLElement) || !root.contains(t)) return;
  if (t.tagName === "TEXTAREA") return;
  if (t.tagName === "BUTTON" || t.getAttribute("role") === "button") return;
  if (t.tagName === "A") return;
  if (t.getAttribute("data-suggest-open") === "1") return;
  const fields = [...root.querySelectorAll(FIELD_SEL)].filter((el) => {
    if (!fieldVisible(el)) return false;
    if (el.type === "radio" && el.name) {
      const checked = root.querySelector(`input[type="radio"][name="${CSS.escape(el.name)}"]:checked`);
      return el === t || el === checked;
    }
    return true;
  });
  const i = fields.indexOf(t);
  if (i < 0) return;
  e.preventDefault();
  e.stopPropagation();
  const next = fields[i + 1];
  if (!next || next === t) return;
  focusField(next);
}

export function focusField(el, { preventScroll = false } = {}) {
  if (!el) return;
  el.focus({ preventScroll });
  if (preventScroll) return;
  if (typeof el.select === "function" && el.tagName === "INPUT" && !["checkbox", "radio", "date", "color", "range"].includes(el.type)) {
    try { el.select(); } catch { /* ignore */ }
  }
}

export function focusFirstField(root) {
  if (!root) return;
  const first = [...root.querySelectorAll(FIELD_SEL)].find(fieldVisible);
  focusField(first, { preventScroll: true });
}

export function focusNextField(fromEl, root) {
  if (!root || !fromEl) return;
  const fields = [...root.querySelectorAll(FIELD_SEL)].filter(fieldVisible);
  const i = fields.indexOf(fromEl);
  if (i < 0) return;
  const next = fields[i + 1];
  if (next) focusField(next);
}

export function getModalScroller(fromEl) {
  const box = fromEl?.closest?.("[data-modal-box]") || document.querySelector("[data-modal-box]");
  return box?.querySelector("[data-modal-scroll]") || box || null;
}

export function snapshotModalScroll(fromEl) {
  const scroller = getModalScroller(fromEl);
  return scroller ? scroller.scrollTop : 0;
}

export function restoreModalScroll(fromEl, top) {
  const scroller = getModalScroller(fromEl);
  if (scroller) scroller.scrollTop = top;
}

export function clickModalSave(root) {
  const btn = root?.querySelector("[data-save='1']:not([disabled])");
  if (btn) btn.click();
}

export function clickModalAddProduct(root) {
  const btn = root?.querySelector("[data-add-product='1']:not([disabled])");
  if (!btn) return;
  btn.click();
  setTimeout(() => {
    const inputs = root?.querySelectorAll("[data-product-search]");
    const last = inputs?.[inputs.length - 1];
    if (last) {
      last.focus();
      if (typeof last.select === "function") {
        try { last.select(); } catch { /* ignore */ }
      }
    }
  }, 50);
}

/** Arrow keys + Enter for search dropdowns. */
export function useTypeaheadNav(items, onPick) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const openRef = useRef(false);
  const hiRef = useRef(0);
  const itemsRef = useRef(items);
  const pickRef = useRef(onPick);
  const listRef = useRef(null);
  openRef.current = open;
  hiRef.current = hi;
  itemsRef.current = items;
  pickRef.current = onPick;

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const el = list?.querySelector(`[data-nav-i="${hi}"]`);
    if (!list || !el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [hi, open]);

  const onKeyDown = (e) => {
    const list = itemsRef.current || [];
    const n = list.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      const was = openRef.current;
      setOpen(true);
      setHi((h) => (!n ? 0 : was ? (h + 1) % n : 0));
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      const was = openRef.current;
      setOpen(true);
      setHi((h) => (!n ? 0 : was ? (h - 1 + n) % n : Math.max(n - 1, 0)));
      return true;
    }
    if (e.key === "Enter" && openRef.current && n) {
      e.preventDefault();
      e.stopPropagation();
      const item = list[hiRef.current] ?? list[0];
      if (item) pickRef.current?.(item);
      setOpen(false);
      return true;
    }
    if (e.key === "Escape" && openRef.current) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return true;
    }
    return false;
  };

  return { open, setOpen, hi, setHi, onKeyDown, listRef };
}

export const ICONS = {
  print:     "M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2 M6 14h12v8H6z",
  calendar:  "M3 4h18v18H3V4z M3 9h18 M8 2v4 M16 2v4",
  trend_down:"M23 18l-9.5-9.5-5 5L1 6 M17 18h6v-6",
  info:      "M12 22a10 10 0 100-20 10 10 0 000 20z M12 8h.01 M12 12v4",
  dashboard: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
  purchase:  "M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0",
  sales:     "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2 M9 5a2 2 0 002 2h2a2 2 0 002-2 M9 5a2 2 0 012-2h2a2 2 0 012 2",
  product:   "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z",
  inventory: "M3 3h18v18H3z M9 3v18 M3 9h18 M3 15h18",
  staff:     "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8z M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75",
  logout:    "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9",
  plus:      "M12 5v14 M5 12h14",
  edit:      "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z",
  trash:     "M3 6h18 M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2",
  close:     "M18 6L6 18 M6 6l12 12",
  steel:     "M2 12h20 M12 2v20 M7 7l10 10 M17 7L7 17",
  invoice:   "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  trend_up:  "M23 6l-9.5 9.5-5-5L1 18 M17 6h6v6",
  box:       "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z",
  eye:       "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 9a3 3 0 100 6 3 3 0 000-6z",
  eye_off:   "M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94 M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19 M1 1l22 22 M14.12 14.12a3 3 0 11-4.24-4.24",
  mail:      "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
  sun:       "M12 2v2 M12 20v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M2 12h2 M20 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42 M12 6a6 6 0 000 12 6 6 0 000-12z",
  moon:      "M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z",
  search:    "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0",
  warning:   "M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4 M12 17h.01",
  check:     "M20 6L9 17l-5-5",
  percent:   "M19 5L5 19 M6.5 4a2.5 2.5 0 100 5 2.5 2.5 0 000-5z M17.5 15a2.5 2.5 0 100 5 2.5 2.5 0 000-5z",
  bank:      "M3 21h18 M3 10h18 M5 6l7-3 7 3 M4 10v11 M20 10v11 M8 14v3 M12 14v3 M16 14v3",
  wallet:    "M21 12V7H5a2 2 0 010-4h14v4 M3 5v14a2 2 0 002 2h16v-5 M18 12a2 2 0 000 4h3v-4z",
  coins:     "M12 2a10 10 0 100 20A10 10 0 0012 2z M12 6v6l4 2",
  book:      "M4 19.5A2.5 2.5 0 016.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z",
  menu:      "M3 12h18 M3 6h18 M3 18h18",
};

export function Modal({ title, onClose, children, wide, xl, layer = 50, headerRight }) {
  const th = useTheme();
  const { isMobile } = useResponsive();
  const boxRef = useRef(null);
  const maxW = xl ? "min(1360px, calc(100vw - 16px))" : wide ? 760 : 500;
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => focusFirstField(boxRef.current), 40);
    return () => {
      document.body.style.overflow = prevOverflow;
      clearTimeout(t);
    };
  }, []);
  const onKeys = (e) => {
    if (e.key === "F5" || ((e.ctrlKey || e.metaKey) && (e.key === "Enter" || String(e.key).toLowerCase() === "s"))) {
      e.preventDefault();
      e.stopPropagation();
      clickModalSave(boxRef.current);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === "a") {
      if (boxRef.current?.querySelector("[data-add-product='1']")) {
        e.preventDefault();
        e.stopPropagation();
        clickModalAddProduct(boxRef.current);
        return;
      }
    }
    handleEnterNextField(e, boxRef.current);
  };
  return createPortal(
    <div style={{position:"fixed",inset:0,zIndex:Math.max(layer, 200),display:"flex",alignItems:isMobile?"flex-end":"center",justifyContent:"center",padding:isMobile?0:16}}>
      <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(4px)"}} onClick={onClose}/>
      <div
        ref={boxRef}
        data-modal-box="1"
        onKeyDownCapture={onKeys}
        style={{position:"relative",width:"100%",maxWidth:maxW,borderRadius:isMobile?"20px 20px 0 0":20,border:`1px solid ${th.border}`,overflow:"hidden",background:th.bgModal,boxShadow:th.modalShadow,maxHeight:isMobile?"94vh": xl ? "94vh" : "90vh",display:"flex",flexDirection:"column"}}
      >
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,padding:isMobile?"14px 18px": xl ? "14px 20px" : "16px 24px",borderBottom:`1px solid ${th.border}`,background:th.bgModal,zIndex:1,flexShrink:0}}>
          <h3 style={{color:th.text,fontWeight:700,fontSize:isMobile?16:18,margin:0,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{title}</h3>
          <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0,flexWrap:"wrap",justifyContent:"flex-end"}}>
            {headerRight}
            <button type="button" onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:th.textDim,padding:4}}><Icon path={ICONS.close} size={20}/></button>
          </div>
        </div>
        <div data-modal-scroll="1" style={{padding:isMobile?"16px 18px": xl ? "16px 20px" : "20px 24px",overflowY:"auto",flex:1,minHeight:0,overflowAnchor:"none"}}>{children}</div>
      </div>
    </div>,
    document.body
  );
}

export function FInput({ label, type="text", value, onChange, placeholder, options, required, min, step, hint }) {
  const th = useTheme();
  const s = {background:th.input,border:`1px solid ${th.inputBorder}`,color:th.text,borderRadius:12,padding:"11px 14px",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"'Segoe UI',sans-serif"};
  return (
    <div>
      <label style={{color:th.textMuted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:6,display:"block",fontWeight:600}}>
        {label}{required&&<span style={{color:"#f87171",marginLeft:3}}>*</span>}
      </label>
      {options ? (
        <select value={value} onChange={e=>onChange(e.target.value)} required={required} style={s}>
          <option value="">...</option>
          {options.map(o=><option key={o.value||o} value={o.value||o} style={{background:th.bgModal}}>{o.label||o}</option>)}
        </select>
      ) : (
        <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} required={required} min={min} step={step} style={s}
          onFocus={e=>e.target.style.borderColor="#1abc9c"} onBlur={e=>e.target.style.borderColor=th.inputBorder}/>
      )}
      {hint&&<p style={{color:th.textDim,fontSize:11,margin:"4px 0 0"}}>{hint}</p>}
    </div>
  );
}

// ─── WeightKgGInput ─────────────────────────────────────────────────────────
// Proper Kg + Grams entry for Chader weight, so values like "12kg 600g" can
// never be mistyped as a single confusing decimal (e.g. 12.600 vs 12.06).
// `value` is the existing decimal-kg number/string, `onChange(decimalKg)`
// receives the combined decimal back — fully compatible with existing
// calculation code that expects one decimal-kg number.
// Stays in sync even if the parent clears/resets `value` from outside
// (e.g. after saving a sale, switching product/row) — it won't get "stuck"
// showing an old number like 500 that can't be removed from the field.
export function WeightKgGInput({ value, onChange, isUrdu, compact }) {
  const th = useTheme();
  const [kg, setKg] = useState("");
  const [g,  setG]  = useState("");
  const lastEmitted = useRef(null);
  const mounted = useRef(false);

  useEffect(() => {
    const incoming = Number(value) || 0;
    // Skip resync if this prop change is just the echo of our own last edit —
    // otherwise re-derive kg/g from whatever the parent now holds (including
    // a reset back to 0/empty), so the boxes never go stale.
    if (!mounted.current || incoming !== lastEmitted.current) {
      const parts = decimalKgToParts(incoming);
      setKg(parts.kg ? String(parts.kg) : "");
      setG(parts.g ? String(parts.g) : "");
      lastEmitted.current = incoming;
      mounted.current = true;
    }
  }, [value]);

  const commit = (nextKg, nextG) => {
    const decimal = partsToDecimalKg(nextKg === "" ? 0 : nextKg, nextG === "" ? 0 : nextG);
    lastEmitted.current = decimal;
    onChange(decimal);
  };

  const inpS = {
    background: th.input, border: `1px solid ${th.inputBorder}`, color: th.text,
    borderRadius: compact ? 8 : 10, padding: compact ? "7px 9px" : "9px 11px",
    fontSize: compact ? 13 : 14, outline: "none", width: "100%", boxSizing: "border-box",
  };

  const decimalNow = partsToDecimalKg(kg || 0, g || 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 6 }}>
        <div style={{ flex: 1 }}>
          {!compact && <label style={{ color: th.textMuted, fontSize: 11, display: "block", marginBottom: 3 }}>{isUrdu ? "کلوگرام" : "Kg"}</label>}
          <input
            type="text" inputMode="numeric" value={kg} placeholder={compact ? "kg" : "0"}
            onChange={e => { const v = e.target.value.replace(/[^0-9]/g, ""); setKg(v); commit(v, g); }}
            style={inpS}
          />
        </div>
        <div style={{ flex: 1 }}>
          {!compact && <label style={{ color: th.textMuted, fontSize: 11, display: "block", marginBottom: 3 }}>{isUrdu ? "گرام (0-999)" : "Grams (0-999)"}</label>}
          <input
            type="text" inputMode="numeric" value={g} placeholder={compact ? "g" : "0"}
            onChange={e => {
              let v = e.target.value.replace(/[^0-9]/g, "");
              if (v !== "" && Number(v) > 999) v = "999";
              setG(v); commit(kg, v);
            }}
            style={inpS}
          />
        </div>
      </div>
      {decimalNow > 0 && (
        <div style={{ fontSize: 11, color: th.textDim, marginTop: 4 }}>
          {isUrdu ? "=" : "="} {formatWeightKgG(decimalNow)} ({decimalNow}kg)
        </div>
      )}
    </div>
  );
}

export function SaveBtn({ label, onClick, loading, color, disabled }) {
  return (
    <button data-save="1" onClick={onClick} disabled={loading||disabled} style={{width:"100%",padding:"13px",borderRadius:12,border:"none",cursor:(loading||disabled)?"not-allowed":"pointer",background:(loading||disabled)?"rgba(26,188,156,0.4)":color||"linear-gradient(135deg,#1abc9c,#2980b9)",boxShadow:(loading||disabled)?"none":"0 4px 15px rgba(26,188,156,0.3)",color:"#fff",fontWeight:700,fontSize:14,letterSpacing:"0.05em"}}>
      {loading ? "..." : label}
    </button>
  );
}

export function StatCard({ label, value, icon, color, sub, onClick }) {
  const th = useTheme();
  const valueStr = value == null ? "" : String(value);
  const wrapRef = useRef(null);
  const valRef = useRef(null);
  const [valueSize, setValueSize] = useState(20);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const el = valRef.current;
    if (!wrap || !el) return;
    const fit = () => {
      let s = 20;
      el.style.fontSize = s + "px";
      while (s > 10 && el.scrollWidth > wrap.clientWidth) {
        s -= 0.5;
        el.style.fontSize = s + "px";
      }
      setValueSize(s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [valueStr]);

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      style={{borderRadius:16,padding:"14px 14px",border:`1px solid ${th.border}`,display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8,background:th.bgCard,boxShadow:th.cardShadow,cursor:onClick?"pointer":"default",transition:"border-color .15s, transform .15s",overflow:"hidden"}}
      onMouseEnter={onClick ? (e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.transform = "translateY(-1px)"; } : undefined}
      onMouseLeave={onClick ? (e) => { e.currentTarget.style.borderColor = th.border; e.currentTarget.style.transform = "none"; } : undefined}
    >
      <div ref={wrapRef} style={{flex:1,minWidth:0}}>
        <p style={{color:th.textMuted,fontSize:10,textTransform:"uppercase",letterSpacing:"0.03em",margin:"0 0 4px",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</p>
        <p ref={valRef} title={valueStr} style={{fontSize:valueSize,fontWeight:800,color:th.text,margin:0,lineHeight:1.15,whiteSpace:"nowrap",letterSpacing:"-0.03em",fontVariantNumeric:"tabular-nums"}}>{value}</p>
        {sub&&<p style={{fontSize:11,marginTop:4,color,margin:"4px 0 0",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{sub}</p>}
      </div>
      <div style={{width:32,height:32,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",background:`${color}22`,color,flexShrink:0}}>
        <Icon path={icon} size={15}/>
      </div>
    </div>
  );
}

export function DateFilterBar({ filter, setFilter, customFrom, setCustomFrom, customTo, setCustomTo, extra, search, setSearch, searchPlaceholder }) {
  const th = useTheme();
  const { lang } = useLang();
  const isUrdu = lang === "ur";
  const labels = {
    today: isUrdu ? "آج" : "Today",
    yesterday: isUrdu ? "کل" : "Yesterday",
    week: isUrdu ? "ایک ہفتہ" : "1 Week",
    month: isUrdu ? "ایک مہینہ" : "1 Month",
    custom: isUrdu ? "تاریخ" : "Date",
  };
  const btn = (active) => ({
    padding: "7px 12px", borderRadius: 10, border: "none", cursor: "pointer",
    fontWeight: 700, fontSize: 12, fontFamily: "'Segoe UI',sans-serif",
    background: active ? "linear-gradient(135deg,#1abc9c,#2980b9)" : th.thHead,
    color: active ? "#fff" : th.textMuted,
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", width: "100%" }}>
      {["today", "yesterday", "week", "month", "custom"].map((f) => (
        <button key={f} type="button" style={btn(filter === f)} onClick={() => setFilter(f)}>{labels[f]}</button>
      ))}
      {filter === "custom" && (
        <>
          <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 10, border: `1px solid ${th.border}`, background: th.bgCard, color: th.text, fontSize: 13, outline: "none" }} />
          <span style={{ color: th.textMuted }}>→</span>
          <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
            style={{ padding: "7px 10px", borderRadius: 10, border: `1px solid ${th.border}`, background: th.bgCard, color: th.text, fontSize: 13, outline: "none" }} />
        </>
      )}
      {typeof setSearch === "function" && (
        <input
          value={search || ""}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder || (isUrdu ? "تلاش..." : "Search...")}
          style={{ flex: "1 1 180px", minWidth: 140, padding: "7px 10px", borderRadius: 10, border: `1px solid ${th.border}`, background: th.input || th.bgCard, color: th.text, fontSize: 13, outline: "none" }}
        />
      )}
      {extra}
    </div>
  );
}

export function Table({ cols, rows, onEdit, onDelete, onRowClick, compact }) {
  const th = useTheme();
  const {t} = useLang();
  const { isMobile } = useResponsive();
  const cellPad = compact ? "8px 10px" : "12px 16px";
  if (isMobile) {
    return (
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {rows.length === 0 && (
          <div style={{textAlign:"center",padding:"40px",color:th.textDim,borderRadius:16,border:`1px solid ${th.border}`,background:th.bgCard}}>{t.noRecords}</div>
        )}
        {rows.map((row, i) => (
          <div key={i} onClick={onRowClick ? () => onRowClick(row.data) : undefined} style={{borderRadius:14,border:`1px solid ${th.border}`,background:th.bgCard,padding:"14px 16px",boxShadow:th.cardShadow,cursor:onRowClick?"pointer":"default"}}>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {cols.map((col, j) => (
                <div key={j} style={{display:"flex",alignItems:"flex-start",gap:8,fontSize:13}}>
                  <span style={{color:th.textDim,fontSize:11,textTransform:"uppercase",letterSpacing:"0.06em",minWidth:80,flexShrink:0,paddingTop:2}}>{col}</span>
                  <span style={{color:th.text,flex:1,wordBreak:"break-word"}}>{row.cells[j]}</span>
                </div>
              ))}
            </div>
            {(onEdit || onDelete) && (
              <div style={{display:"flex",gap:8,marginTop:12,paddingTop:10,borderTop:`1px solid ${th.border}`}} onClick={(e) => e.stopPropagation()}>
                {onEdit && <button onClick={()=>onEdit(row.data)} style={{flex:1,padding:"8px",borderRadius:10,border:"1px solid rgba(59,130,246,0.3)",background:"rgba(59,130,246,0.08)",color:"#60a5fa",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"'Segoe UI',sans-serif"}}>✏️ {t.edit}</button>}
                {onDelete && <button onClick={()=>onDelete(row.data)} style={{flex:1,padding:"8px",borderRadius:10,border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.08)",color:"#f87171",cursor:"pointer",fontSize:13,fontWeight:600,fontFamily:"'Segoe UI',sans-serif"}}>🗑️ {t.delete}</button>}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div style={{borderRadius:16,border:`1px solid ${th.border}`,overflow:"hidden",background:th.bgCard,boxShadow:th.cardShadow}}>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",fontSize:compact?13:14,borderCollapse:"collapse"}}>
          <thead>
            <tr style={{borderBottom:`1px solid ${th.border}`,background:th.thHead}}>
              {cols.map(c=><th key={c} style={{textAlign:"left",padding:cellPad,color:th.textMuted,fontSize:11,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:700,whiteSpace:"nowrap"}}>{c}</th>)}
              {(onEdit||onDelete)&&<th style={{textAlign:"right",padding:cellPad,color:th.textMuted,fontSize:11,textTransform:"uppercase",fontWeight:600}}>{t.actions}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length===0&&<tr><td colSpan={cols.length+1} style={{textAlign:"center",padding:"48px",color:th.textDim}}>{t.noRecords}</td></tr>}
            {rows.map((row,i)=>(
              <tr key={i} style={{borderBottom:`1px solid ${th.border}`,transition:"background 0.15s",cursor:onRowClick?"pointer":"default"}}
                onClick={onRowClick ? () => onRowClick(row.data) : undefined}
                onMouseEnter={e=>e.currentTarget.style.background=th.rowHover}
                onMouseLeave={e=>{e.currentTarget.style.background="transparent"}}>
                {row.cells.map((cell,j)=><td key={j} style={{padding:cellPad,color:th.text,verticalAlign:"middle"}}>{cell}</td>)}
                {(onEdit||onDelete)&&(
                  <td style={{padding:"12px 16px",textAlign:"right"}} onClick={(e) => e.stopPropagation()}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:8}}>
                      {onEdit&&<button onClick={()=>onEdit(row.data)} style={{padding:"6px",borderRadius:8,border:"none",cursor:"pointer",background:"transparent",color:th.textDim}}
                        onMouseEnter={e=>{e.currentTarget.style.background="rgba(59,130,246,0.15)";e.currentTarget.style.color="#60a5fa"}}
                        onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=th.textDim}}>
                        <Icon path={ICONS.edit} size={15}/></button>}
                      {onDelete&&<button onClick={()=>onDelete(row.data)} style={{padding:"6px",borderRadius:8,border:"none",cursor:"pointer",background:"transparent",color:th.textDim}}
                        onMouseEnter={e=>{e.currentTarget.style.background="rgba(239,68,68,0.15)";e.currentTarget.style.color="#f87171"}}
                        onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=th.textDim}}>
                        <Icon path={ICONS.trash} size={15}/></button>}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
