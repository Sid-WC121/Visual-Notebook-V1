import { create } from "zustand";

export interface SlotMap {
  [slotName: string]: { column: string; type: string };
}

export interface ExtraMap {
  [name: string]: number | string;
}

interface VizState {
  vizCellId: string | null;
  chartTypeId: string;
  slots: SlotMap;
  extras: ExtraMap;
  openVizPanel: (cellId: string, chartTypeId?: string) => void;
  closeVizPanel: () => void;
  setChartTypeId: (id: string) => void;
  setSlot: (name: string, column: string, type: string) => void;
  clearSlot: (name: string) => void;
  setExtra: (name: string, value: number | string) => void;
  setExtras: (e: ExtraMap) => void;
}

export const useVizStore = create<VizState>((set) => ({
  vizCellId: null,
  chartTypeId: "viz_histogram",
  slots: {},
  extras: {},
  openVizPanel: (cellId, chartTypeId) =>
    set({ vizCellId: cellId, slots: {}, extras: {}, ...(chartTypeId ? { chartTypeId } : {}) }),
  closeVizPanel: () => set({ vizCellId: null, slots: {}, extras: {} }),
  setChartTypeId: (id) => set({ chartTypeId: id, slots: {}, extras: {} }),
  setSlot: (name, column, type) =>
    set((s) => ({ slots: { ...s.slots, [name]: { column, type } } })),
  clearSlot: (name) =>
    set((s) => {
      const next = { ...s.slots };
      delete next[name];
      return { slots: next };
    }),
  setExtra: (name, value) => set((s) => ({ extras: { ...s.extras, [name]: value } })),
  setExtras: (e) => set({ extras: e }),
}));
