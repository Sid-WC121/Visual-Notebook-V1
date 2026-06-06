import { create } from "zustand";

interface ErrorState {
  errorMessage: string | null;
  setError: (msg: string | null) => void;
}

export const useErrorStore = create<ErrorState>((set) => ({
  errorMessage: null,
  setError: (msg) => set({ errorMessage: msg }),
}));
