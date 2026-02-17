import {
  fetchAssignmentDetailsWithSession,
  startAssignmentEditSession,
  submitAssignment,
} from "@/services/assignment";
import type {
  AssignmentDetails,
  AssignmentEditSession,
  AssignmentSubmissionPayload,
  AssignmentSubmitResult,
} from "@/types";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { zustandStorage } from "./storage";

export const ASSIGNMENT_STALE_MS = 30 * 60 * 1000;

interface AssignmentCacheEntry {
  data: AssignmentDetails;
  lastSyncTime: number;
}

interface AssignmentStoreState {
  detailsByAssignmentId: Record<string, AssignmentCacheEntry>;
  editSessionByAssignmentId: Record<string, AssignmentEditSession>;
  isLoadingByAssignmentId: Record<string, boolean>;
  isSubmittingByAssignmentId: Record<string, boolean>;
  uploadProgressByAssignmentId: Record<string, number | null>;
  errorByAssignmentId: Record<string, string | null>;
  hasHydrated: boolean;
}

interface AssignmentStoreActions {
  fetchAssignmentDetails: (
    assignmentId: string,
    options?: { force?: boolean; silent?: boolean },
  ) => Promise<void>;
  refreshAssignmentDetails: (assignmentId: string) => Promise<void>;
  startEditSession: (
    assignmentId: string,
    options?: { force?: boolean },
  ) => Promise<AssignmentEditSession | null>;
  submitAssignment: (
    assignmentId: string,
    payload: AssignmentSubmissionPayload,
  ) => Promise<AssignmentSubmitResult>;
  setUploadProgress: (assignmentId: string, progress: number | null) => void;
  clearAssignmentCache: () => void;
  setHasHydrated: (hasHydrated: boolean) => void;
}

type AssignmentStore = AssignmentStoreState & AssignmentStoreActions;

const detailRequestsInFlight = new Map<string, Promise<AssignmentDetails>>();
const editRequestsInFlight = new Map<string, Promise<AssignmentEditSession>>();

const isStale = (lastSyncTime: number | null): boolean => {
  if (!lastSyncTime) return true;
  return Date.now() - lastSyncTime > ASSIGNMENT_STALE_MS;
};

export const useAssignmentStore = create<AssignmentStore>()(
  persist(
    (set, get) => ({
      detailsByAssignmentId: {},
      editSessionByAssignmentId: {},
      isLoadingByAssignmentId: {},
      isSubmittingByAssignmentId: {},
      uploadProgressByAssignmentId: {},
      errorByAssignmentId: {},
      hasHydrated: false,

      setHasHydrated: (hasHydrated) => set({ hasHydrated }),

      fetchAssignmentDetails: async (assignmentId, options) => {
        const force = options?.force ?? false;
        const silent = options?.silent ?? false;

        const entry = get().detailsByAssignmentId[assignmentId];
        if (!force && entry && !isStale(entry.lastSyncTime)) {
          set((state) => ({
            errorByAssignmentId: {
              ...state.errorByAssignmentId,
              [assignmentId]: null,
            },
          }));
          return;
        }

        set((state) => ({
          isLoadingByAssignmentId: {
            ...state.isLoadingByAssignmentId,
            [assignmentId]: silent
              ? (state.isLoadingByAssignmentId[assignmentId] ?? false)
              : true,
          },
          errorByAssignmentId: {
            ...state.errorByAssignmentId,
            [assignmentId]: null,
          },
        }));

        let request = detailRequestsInFlight.get(assignmentId);
        if (!request) {
          request = fetchAssignmentDetailsWithSession(assignmentId);
          detailRequestsInFlight.set(assignmentId, request);
        }

        try {
          const details = await request;
          set((state) => ({
            detailsByAssignmentId: {
              ...state.detailsByAssignmentId,
              [assignmentId]: {
                data: details,
                lastSyncTime: Date.now(),
              },
            },
            isLoadingByAssignmentId: {
              ...state.isLoadingByAssignmentId,
              [assignmentId]: false,
            },
            errorByAssignmentId: {
              ...state.errorByAssignmentId,
              [assignmentId]: null,
            },
          }));
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to fetch assignment details";
          set((state) => ({
            isLoadingByAssignmentId: {
              ...state.isLoadingByAssignmentId,
              [assignmentId]: false,
            },
            errorByAssignmentId: {
              ...state.errorByAssignmentId,
              [assignmentId]: message,
            },
          }));
        } finally {
          if (detailRequestsInFlight.get(assignmentId) === request) {
            detailRequestsInFlight.delete(assignmentId);
          }
        }
      },

      refreshAssignmentDetails: async (assignmentId) => {
        await get().fetchAssignmentDetails(assignmentId, { force: true });
      },

      startEditSession: async (assignmentId, options) => {
        const force = options?.force ?? false;
        const existing = get().editSessionByAssignmentId[assignmentId];
        if (!force && existing && !isStale(existing.fetchedAt)) {
          return existing;
        }

        let request = editRequestsInFlight.get(assignmentId);
        if (!request) {
          request = startAssignmentEditSession(assignmentId);
          editRequestsInFlight.set(assignmentId, request);
        }

        try {
          const session = await request;
          set((state) => ({
            editSessionByAssignmentId: {
              ...state.editSessionByAssignmentId,
              [assignmentId]: session,
            },
            errorByAssignmentId: {
              ...state.errorByAssignmentId,
              [assignmentId]: null,
            },
          }));
          return session;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to start assignment edit session";
          set((state) => ({
            errorByAssignmentId: {
              ...state.errorByAssignmentId,
              [assignmentId]: message,
            },
          }));
          return null;
        } finally {
          if (editRequestsInFlight.get(assignmentId) === request) {
            editRequestsInFlight.delete(assignmentId);
          }
        }
      },

      submitAssignment: async (assignmentId, payload) => {
        set((state) => ({
          isSubmittingByAssignmentId: {
            ...state.isSubmittingByAssignmentId,
            [assignmentId]: true,
          },
          uploadProgressByAssignmentId: {
            ...state.uploadProgressByAssignmentId,
            [assignmentId]: null,
          },
          errorByAssignmentId: {
            ...state.errorByAssignmentId,
            [assignmentId]: null,
          },
        }));

        const session = await get().startEditSession(assignmentId, { force: true });
        if (!session) {
          set((state) => ({
            isSubmittingByAssignmentId: {
              ...state.isSubmittingByAssignmentId,
              [assignmentId]: false,
            },
          }));
          return {
            success: false,
            reason: "server",
            message: "Could not initialize assignment submission",
          };
        }

        const result = await submitAssignment(session, payload, {
          onProgress: (fraction) => {
            set((state) => ({
              uploadProgressByAssignmentId: {
                ...state.uploadProgressByAssignmentId,
                [assignmentId]: fraction,
              },
            }));
          },
        });

        set((state) => ({
          isSubmittingByAssignmentId: {
            ...state.isSubmittingByAssignmentId,
            [assignmentId]: false,
          },
          uploadProgressByAssignmentId: {
            ...state.uploadProgressByAssignmentId,
            [assignmentId]: null,
          },
          errorByAssignmentId: {
            ...state.errorByAssignmentId,
            [assignmentId]: result.success ? null : result.message,
          },
        }));

        if (result.success) {
          await get().refreshAssignmentDetails(assignmentId);
        }

        return result;
      },

      setUploadProgress: (assignmentId, progress) => {
        set((state) => ({
          uploadProgressByAssignmentId: {
            ...state.uploadProgressByAssignmentId,
            [assignmentId]: progress,
          },
        }));
      },

      clearAssignmentCache: () => {
        detailRequestsInFlight.clear();
        editRequestsInFlight.clear();
        set({
          detailsByAssignmentId: {},
          editSessionByAssignmentId: {},
          isLoadingByAssignmentId: {},
          isSubmittingByAssignmentId: {},
          uploadProgressByAssignmentId: {},
          errorByAssignmentId: {},
        });
      },
    }),
    {
      name: "assignment-storage",
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({
        detailsByAssignmentId: state.detailsByAssignmentId,
        editSessionByAssignmentId: state.editSessionByAssignmentId,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
