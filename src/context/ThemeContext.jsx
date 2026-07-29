import { createContext, useContext, useState } from "react";

export const ThemeCtx = createContext();
export const useTheme = () => useContext(ThemeCtx);

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(false);
  const th = dark ? {
    dark:true, bg:"#0d1117", bgCard:"rgba(255,255,255,0.03)", bgModal:"#1a1f2e",
    border:"rgba(255,255,255,0.06)", borderHover:"rgba(255,255,255,0.15)",
    text:"#e5e7eb", textMuted:"#9ca3af", textDim:"#6b7280",
    sidebar:"linear-gradient(180deg,#0d1117 0%,#161b22 100%)",
    header:"rgba(13,17,23,0.95)", input:"rgba(255,255,255,0.07)",
    inputBorder:"rgba(255,255,255,0.12)", rowHover:"rgba(255,255,255,0.025)",
    thHead:"rgba(255,255,255,0.04)",
    cardShadow:"none",
    modalShadow:"0 25px 60px rgba(0,0,0,0.5)",
  } : {
    dark:false, bg:"#eef2f7", bgCard:"#ffffff", bgModal:"#ffffff",
    border:"rgba(15,23,42,0.1)", borderHover:"rgba(15,23,42,0.3)",
    text:"#0f172a", textMuted:"#334155", textDim:"#64748b",
    sidebar:"linear-gradient(180deg,#1e293b 0%,#0f172a 100%)",
    header:"#ffffff", input:"#f8fafc",
    inputBorder:"rgba(15,23,42,0.15)", rowHover:"rgba(15,23,42,0.03)",
    thHead:"#f1f5f9",
    cardShadow:"0 1px 4px rgba(15,23,42,0.08), 0 0 0 1px rgba(15,23,42,0.06)",
    modalShadow:"0 20px 60px rgba(15,23,42,0.15), 0 0 0 1px rgba(15,23,42,0.08)",
  };
  return <ThemeCtx.Provider value={{...th, toggle:()=>setDark(d=>!d)}}>{children}</ThemeCtx.Provider>;
}
