import { create } from "zustand";

interface UIState {
  historyPanelOpen: boolean;
  toggleHistoryPanel: () => void;
  setHistoryPanelOpen: (open: boolean) => void;
  autoCascade: boolean;
  toggleAutoCascade: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  historyPanelOpen: false,
  toggleHistoryPanel: () => set((s) => ({ historyPanelOpen: !s.historyPanelOpen })),
  setHistoryPanelOpen: (open) => set({ historyPanelOpen: open }),
  autoCascade: true,
  toggleAutoCascade: () => set((s) => ({ autoCascade: !s.autoCascade })),
}));
