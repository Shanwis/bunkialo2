import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "./storage";
import { POPUP_NOTICES } from "@/data/popups";

const VALID_POPUP_IDS = new Set(POPUP_NOTICES.map((popup) => popup.id));

const normalizeSeenPopupIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];

  const seenPopupIds = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !VALID_POPUP_IDS.has(item)) continue;
    seenPopupIds.add(item);
  }

  return Array.from(seenPopupIds);
};

const extractSeenPopupIds = (value: unknown): string[] | null => {
  if (Array.isArray(value)) {
    return normalizeSeenPopupIds(value);
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    seenPopupIds?: unknown;
    state?: {
      seenPopupIds?: unknown;
    };
  };

  if ("seenPopupIds" in candidate) {
    return normalizeSeenPopupIds(candidate.seenPopupIds);
  }

  if (candidate.state && "seenPopupIds" in candidate.state) {
    return normalizeSeenPopupIds(candidate.state.seenPopupIds);
  }

  return null;
};

interface PopupState {
  seenPopupIds: string[];
  feedbackDefaultGrade: string;
  feedbackDefaultTextResponse: string;
  feedbackCourseDefaults: Record<
    string,
    { grade: string; textResponse: string }
  >;
  hasHydrated: boolean;
  markAsSeen: (id: string) => void;
  markAsUnseen: (id: string) => void;
  markAllAsSeen: () => void;
  clearSeenPopups: () => void;
  hasUnseenPopups: () => boolean;
  getUnseenPopups: () => typeof POPUP_NOTICES;
  setFeedbackAutofillDefaults: (grade: string, textResponse: string) => void;
  setCourseFeedbackAutofillDefault: (
    courseId: string,
    grade: string,
    textResponse: string,
  ) => void;
  setCourseFeedbackAutofillDefaults: (
    defaults: Record<string, { grade: string; textResponse: string }>,
  ) => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

export const usePopupStore = create<PopupState>()(
  persist(
    (set, get) => ({
      seenPopupIds: [],
      feedbackDefaultGrade: "3",
      feedbackDefaultTextResponse: "_",
      feedbackCourseDefaults: {},
      hasHydrated: false,

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),

      markAsSeen: (id: string) => {
        if (!VALID_POPUP_IDS.has(id)) return;

        set((state) => {
          if (state.seenPopupIds.includes(id)) {
            return state;
          }
          return {
            seenPopupIds: [...state.seenPopupIds, id],
          };
        });
      },

      markAsUnseen: (id: string) => {
        if (!VALID_POPUP_IDS.has(id)) return;
        set((state) => ({
          seenPopupIds: state.seenPopupIds.filter((popupId) => popupId !== id),
        }));
      },

      markAllAsSeen: () => {
        set({
          seenPopupIds: Array.from(VALID_POPUP_IDS),
        });
      },

      clearSeenPopups: () => {
        set({ seenPopupIds: [] });
      },

      hasUnseenPopups: () => {
        const { hasHydrated, seenPopupIds } = get();
        if (!hasHydrated) return false;
        return POPUP_NOTICES.some((popup) => !seenPopupIds.includes(popup.id));
      },

      getUnseenPopups: () => {
        const { hasHydrated, seenPopupIds } = get();
        if (!hasHydrated) return [];
        return POPUP_NOTICES.filter(
          (popup) => !seenPopupIds.includes(popup.id),
        );
      },

      setFeedbackAutofillDefaults: (grade: string, textResponse: string) => {
        const trimmedGrade = grade.trim();
        const safeGrade = /^[0-5]$/.test(trimmedGrade) ? trimmedGrade : "3";
        const safeText = textResponse.trim() || "_";

        set({
          feedbackDefaultGrade: safeGrade,
          feedbackDefaultTextResponse: safeText,
        });
      },

      setCourseFeedbackAutofillDefault: (courseId, grade, textResponse) => {
        const id = courseId.trim();
        if (!id) return;

        const trimmedGrade = grade.trim();
        const safeGrade = /^[0-5]$/.test(trimmedGrade) ? trimmedGrade : "3";
        const safeText = textResponse.trim() || "_";

        set((state) => ({
          feedbackCourseDefaults: {
            ...state.feedbackCourseDefaults,
            [id]: { grade: safeGrade, textResponse: safeText },
          },
        }));
      },

      setCourseFeedbackAutofillDefaults: (defaults) => {
        const sanitized: Record<
          string,
          { grade: string; textResponse: string }
        > = {};

        for (const [courseId, value] of Object.entries(defaults)) {
          const id = courseId.trim();
          if (!id) continue;

          const gradeRaw = String(value?.grade ?? "").trim();
          const safeGrade = /^[0-5]$/.test(gradeRaw) ? gradeRaw : "3";
          const safeText = String(value?.textResponse ?? "").trim() || "_";
          sanitized[id] = { grade: safeGrade, textResponse: safeText };
        }

        set({ feedbackCourseDefaults: sanitized });
      },
    }),
    {
      name: "bunkialo-popup-storage",
      storage: createJSONStorage(() => ({
        getItem: async (name) => {
          const value = await zustandStorage.getItem(name);
          if (!value) return null;
          try {
            const parsed = JSON.parse(value);

            const seenPopupIds = extractSeenPopupIds(parsed);
            if (seenPopupIds !== null) {
              return JSON.stringify({
                state: { seenPopupIds },
                version: 0,
              });
            }

            return value;
          } catch {
            return value;
          }
        },
        setItem: (name, value) => zustandStorage.setItem(name, value),
        removeItem: (name) => zustandStorage.removeItem(name),
      })),
      partialize: (state) => ({
        seenPopupIds: state.seenPopupIds,
        feedbackDefaultGrade: state.feedbackDefaultGrade,
        feedbackDefaultTextResponse: state.feedbackDefaultTextResponse,
        feedbackCourseDefaults: state.feedbackCourseDefaults,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
