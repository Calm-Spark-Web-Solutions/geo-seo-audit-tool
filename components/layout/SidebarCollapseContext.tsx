"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const STORAGE_KEY = "ranklume.sidebarCollapsed";

type SidebarCollapseContextValue = {
  collapsed: boolean;
  toggleCollapsed: () => void;
  /** True after localStorage has been read (client-only). */
  hydrated: boolean;
};

const SidebarCollapseContext = createContext<
  SidebarCollapseContextValue | undefined
>(undefined);

export function SidebarCollapseProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Restore persisted collapse state after mount (SSR/localStorage mismatch).
    /* eslint-disable react-hooks/set-state-in-effect -- intentional one-time hydration */
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "1") setCollapsed(true);
    } catch {
      /* ignore */
    }
    setHydrated(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed, hydrated]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  const value = useMemo(
    () => ({ collapsed, toggleCollapsed, hydrated }),
    [collapsed, toggleCollapsed, hydrated],
  );

  return (
    <SidebarCollapseContext.Provider value={value}>
      {children}
    </SidebarCollapseContext.Provider>
  );
}

export function useSidebarCollapsed(): SidebarCollapseContextValue {
  const ctx = useContext(SidebarCollapseContext);
  if (!ctx) {
    throw new Error(
      "useSidebarCollapsed must be used within SidebarCollapseProvider",
    );
  }
  return ctx;
}
