import { createContext, useContext, useState, type ReactNode } from "react";

interface EducationalModeContextValue {
  enabled: boolean;
  toggle: () => void;
  setEnabled: (v: boolean) => void;
}

const EducationalModeContext = createContext<EducationalModeContextValue | null>(null);

export function EducationalModeProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  return (
    <EducationalModeContext.Provider value={{ enabled, toggle: () => setEnabled((v) => !v), setEnabled }}>
      {children}
    </EducationalModeContext.Provider>
  );
}

export function useEducationalMode() {
  const ctx = useContext(EducationalModeContext);
  if (!ctx) throw new Error("useEducationalMode must be used within EducationalModeProvider");
  return ctx;
}
