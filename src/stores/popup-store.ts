import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "./storage";
import { POPUP_NOTICES } from "@/data/popups";

interface PopupState {
  seenPopupIds: string[];
  markAsSeen: (id: string) => void;
  markAllAsSeen: () => void;
  clearSeenPopups: () => void;
  hasUnseenPopups: () => boolean;
  getUnseenPopups: () => typeof POPUP_NOTICES;
}

export const usePopupStore = create<PopupState>()(
  persist(
    (set, get) => ({
      seenPopupIds: [],

      markAsSeen: (id: string) => {
        set((state) => {
          if (state.seenPopupIds.includes(id)) {
            return state;
          }
          return {
            seenPopupIds: [...state.seenPopupIds, id],
          };
        });
      },

      markAllAsSeen: () => {
        set({
          seenPopupIds: POPUP_NOTICES.map((p) => p.id),
        });
      },

      clearSeenPopups: () => {
        set({ seenPopupIds: [] });
      },

      hasUnseenPopups: () => {
        const { seenPopupIds } = get();
        return POPUP_NOTICES.some((popup) => !seenPopupIds.includes(popup.id));
      },

      getUnseenPopups: () => {
        const { seenPopupIds } = get();
        return POPUP_NOTICES.filter((popup) => !seenPopupIds.includes(popup.id));
      },
    }),
    {
      name: "bunkialo-popup-storage",
      storage: createJSONStorage(() => zustandStorage),
    }
  )
);
