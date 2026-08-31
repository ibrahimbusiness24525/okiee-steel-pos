import { createContext, useContext, useState } from "react";
import { T } from "../utils/constants";

export const LangCtx = createContext();
export const useLang = () => useContext(LangCtx);

export function LangProvider({ children }) {
  const [lang, setLang] = useState("en");
  const toggle = () => setLang(l => l === "ur" ? "en" : "ur");
  const t = T[lang];
  const isUrdu = lang === "ur";
  return (
    <LangCtx.Provider value={{ t, lang, toggle, isUrdu }}>
      <div style={{ fontFamily: isUrdu ? "'Noto Nastaliq Urdu', 'Jameel Noori Nastaleeq', serif" : "'Segoe UI',system-ui,sans-serif", fontSize: isUrdu ? "15px" : undefined }}>
        {children}
      </div>
    </LangCtx.Provider>
  );
}
