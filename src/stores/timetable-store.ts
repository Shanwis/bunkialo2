import type {
  DayOfWeek,
  OutlierSlotConflict,
  SlotConflict,
  SlotOccurrenceStats,
  TimeOverlapSlotConflict,
  TimetableSlot,
  TimetableState,
} from "@/types";
import { extractCourseName } from "@/utils/course-name";
import { inferRecurringLmsSlotsVerbose } from "@/utils/timetable-inference";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { useAttendanceStore } from "./attendance-store";
import { useBunkStore } from "./bunk-store";
import { zustandStorage } from "./storage";

interface TimetableActions {
  generateTimetable: () => void;
  clearTimetable: () => void;
  resolveConflict: (
    conflictIndex: number,
    keep: "preferred" | "alternative" | "keep-outlier" | "ignore-outlier",
  ) => void;
  resolveAllPreferred: () => void;
  revertConflictResolution: (conflictId: string) => void;
  clearConflicts: () => void;
}

const TIMETABLE_PERSIST_VERSION = 7;
const RECOMPUTE_MAX_RETRIES = 20;
const RECOMPUTE_RETRY_DELAY_MS = 200;
const AUTO_SLOT_START_CONFLICT_WINDOW_MINUTES = 120;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const MONTH_MAP: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const generateId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const timesOverlap = (
  start1: string,
  end1: string,
  start2: string,
  end2: string,
): boolean => {
  return start1 < end2 && start2 < end1;
};

const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

const getStartOfIsoWeekUtcMs = (timestampMs: number): number => {
  const date = new Date(timestampMs);
  const day = date.getUTCDay() || 7;
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - (day - 1));
  return date.getTime();
};

const getInclusiveIsoWeekSpan = (
  fromTimestampMs: number,
  toTimestampMs: number,
): number => {
  if (toTimestampMs <= fromTimestampMs) return 1;
  const start = getStartOfIsoWeekUtcMs(fromTimestampMs);
  const end = getStartOfIsoWeekUtcMs(toTimestampMs);
  if (end <= start) return 1;
  return Math.floor((end - start) / MS_PER_WEEK) + 1;
};

const parseAttendanceDateMs = (value: string): number | null => {
  const dateMatch = value.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (!dateMatch) return null;
  const day = Number(dateMatch[1]);
  const month = MONTH_MAP[dateMatch[2].toLowerCase()];
  const year = Number(dateMatch[3]);
  if (month === undefined) return null;
  const date = new Date(year, month, day);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

const getGlobalWeekSpanCount = (
  attendanceCourses: ReturnType<typeof useAttendanceStore.getState>["courses"],
): number | null => {
  let oldestRecordMs: number | null = null;
  for (const course of attendanceCourses) {
    for (const record of course.records) {
      const parsedMs = parseAttendanceDateMs(record.date);
      if (parsedMs === null) continue;
      oldestRecordMs =
        oldestRecordMs === null ? parsedMs : Math.min(oldestRecordMs, parsedMs);
    }
  }
  if (oldestRecordMs === null) return null;
  return getInclusiveIsoWeekSpan(oldestRecordMs, Date.now());
};

const autoSlotStoreKey = (
  courseId: string,
  dayOfWeek: DayOfWeek,
  startTime: string,
) => `${courseId}-${dayOfWeek}-${startTime}`;

const slotResolutionKey = (slot: TimetableSlot) =>
  `${slot.courseId}-${slot.dayOfWeek}-${slot.startTime}-${slot.endTime}-${slot.sessionType}-${slot.isManual ? "manual" : "auto"}`;

const buildPairConflictId = (slotA: TimetableSlot, slotB: TimetableSlot) => {
  const ordered = [slotResolutionKey(slotA), slotResolutionKey(slotB)].sort();
  return `pair-${ordered[0]}__${ordered[1]}`;
};

const buildOutlierConflictId = (courseId: string, slotKey: string) =>
  `outlier-${courseId}-${slotKey}`;

// rank purely by occurrence frequency
const rankSlotForConflict = (
  stats?: SlotOccurrenceStats,
): number => {
  if (!stats) return 0;
  const totalWeeks = Math.max(stats.totalWeekSpanCount ?? stats.dayActiveWeekCount, 1);
  return stats.occurrenceCount / totalWeeks;
};

const isOutlierCandidate = (
  occurrenceCount: number,
  totalWeekSpanCount: number,
): boolean => {
  const totalWeeks = Math.max(totalWeekSpanCount, 1);
  const ratio = occurrenceCount / totalWeeks;
  return occurrenceCount <= 1 || ratio < 0.34;
};

const recomputeWhenBaseStoresHydrated = (generateTimetable: () => void) => {
  let attempts = 0;

  const run = () => {
    const attendanceHydrated = useAttendanceStore.getState().hasHydrated;
    const bunkHydrated = useBunkStore.getState().hasHydrated;

    if ((attendanceHydrated && bunkHydrated) || attempts >= RECOMPUTE_MAX_RETRIES) {
      generateTimetable();
      return;
    }

    attempts += 1;
    setTimeout(run, RECOMPUTE_RETRY_DELAY_MS);
  };

  setTimeout(run, 0);
};

export const useTimetableStore = create<TimetableState & TimetableActions>()(
  persist(
    (set, get) => ({
      slots: [],
      conflicts: [],
      timeOverlapResolutions: {},
      outlierResolutions: {},
      lastGeneratedAt: null,
      isLoading: false,

      generateTimetable: () => {
        set({ isLoading: true });

        const attendanceCourses = useAttendanceStore.getState().courses;
        const { courses: bunkCourses, hiddenCourses } = useBunkStore.getState();
        const { timeOverlapResolutions, outlierResolutions } = get();
        const globalWeekSpanCount = getGlobalWeekSpanCount(attendanceCourses);

        // step 1: generate auto slots from LMS attendance data
        const autoSlotMap = new Map<string, TimetableSlot>();
        const autoSlotStatsMap = new Map<string, SlotOccurrenceStats>();
        const outlierConflicts: OutlierSlotConflict[] = [];

        for (const course of attendanceCourses) {
          if (hiddenCourses[course.courseId]) continue;

          const bunkCourse = bunkCourses.find(
            (c) => c.courseId === course.courseId,
          );
          const overrideLmsSlots =
            bunkCourse?.config?.overrideLmsSlots ?? false;
          if (overrideLmsSlots) continue;
          const displayName =
            bunkCourse?.config?.alias || extractCourseName(course.courseName);

          const inferred = inferRecurringLmsSlotsVerbose(course.records, {
            startToleranceMinutes: 20,
            totalWeekSpanOverride: globalWeekSpanCount ?? undefined,
          });
          const candidatesByDay = new Map<
            DayOfWeek,
            typeof inferred.candidates
          >();
          const candidateBySlotKey = new Map<
            string,
            (typeof inferred.candidates)[number]
          >();
          const selectedByRuleKeys = new Set<string>();

          for (const candidate of inferred.candidates) {
            const dayCandidates = candidatesByDay.get(candidate.dayOfWeek) ?? [];
            dayCandidates.push(candidate);
            candidatesByDay.set(candidate.dayOfWeek, dayCandidates);
            candidateBySlotKey.set(candidate.slotKey, candidate);
            if (candidate.selectedByRule) {
              selectedByRuleKeys.add(candidate.slotKey);
            }
          }

          const chosenSlotKeys = new Set(selectedByRuleKeys);

          for (const [, dayCandidates] of candidatesByDay.entries()) {
            const selectedCandidates = dayCandidates.filter((c) =>
              selectedByRuleKeys.has(c.slotKey),
            );
            const alternativeCandidates = dayCandidates.filter(
              (c) => !selectedByRuleKeys.has(c.slotKey),
            );

            for (const alternative of alternativeCandidates) {
              let nearest = selectedCandidates[0];
              let minDiff = Number.POSITIVE_INFINITY;

              for (const selected of selectedCandidates) {
                const diff = Math.abs(
                  timeToMinutes(selected.startTime) -
                  timeToMinutes(alternative.startTime),
                );
                if (diff < minDiff) {
                  minDiff = diff;
                  nearest = selected;
                }
              }

              // too far from any selected slot — check if it's an outlier
              if (
                !nearest ||
                minDiff > AUTO_SLOT_START_CONFLICT_WINDOW_MINUTES
              ) {
                const outlierConflictId = buildOutlierConflictId(
                  course.courseId,
                  alternative.slotKey,
                );
                const resolvedOutlier = outlierResolutions[outlierConflictId];
                const outlierStats: SlotOccurrenceStats = {
                  occurrenceCount: alternative.occurrenceCount,
                  dayActiveWeekCount: alternative.dayActiveWeekCount,
                  totalWeekSpanCount: alternative.totalWeekSpanCount,
                  dayObservationCount: alternative.dayObservationCount,
                  score: alternative.score,
                };
                if (
                  isOutlierCandidate(
                    alternative.occurrenceCount,
                    alternative.totalWeekSpanCount,
                  )
                ) {
                  outlierConflicts.push({
                    type: "outlier-review",
                    conflictId: outlierConflictId,
                    slot: {
                      id: generateId(),
                      courseId: course.courseId,
                      courseName: displayName,
                      dayOfWeek: alternative.dayOfWeek,
                      startTime: alternative.startTime,
                      endTime: alternative.endTime,
                      sessionType: alternative.sessionType,
                      isManual: false,
                      isCustomCourse: false,
                    },
                    stats: outlierStats,
                    resolvedChoice: resolvedOutlier ?? "ignore",
                  });
                  if (resolvedOutlier === "keep") {
                    chosenSlotKeys.add(alternative.slotKey);
                  }
                } else {
                  chosenSlotKeys.add(alternative.slotKey);
                }
                continue;
              }

              // non-overlapping slots can coexist
              if (
                !timesOverlap(
                  nearest.startTime,
                  nearest.endTime,
                  alternative.startTime,
                  alternative.endTime,
                )
              ) {
                chosenSlotKeys.add(alternative.slotKey);
                continue;
              }

              // overlapping same-course variants: silently pick highest occurrence
              if (alternative.occurrenceCount > nearest.occurrenceCount) {
                chosenSlotKeys.delete(nearest.slotKey);
                chosenSlotKeys.add(alternative.slotKey);
              }
              // else: keep the selected one (already in chosenSlotKeys)
            }
          }

          for (const slotKey of chosenSlotKeys) {
            const candidate = candidateBySlotKey.get(slotKey);
            if (!candidate) continue;
            const key = autoSlotStoreKey(
              course.courseId,
              candidate.dayOfWeek,
              candidate.startTime,
            );
            autoSlotMap.set(key, {
              id: generateId(),
              courseId: course.courseId,
              courseName: displayName,
              dayOfWeek: candidate.dayOfWeek,
              startTime: candidate.startTime,
              endTime: candidate.endTime,
              sessionType: candidate.sessionType,
              isManual: false,
              isCustomCourse: false,
            });
            autoSlotStatsMap.set(key, {
              occurrenceCount: candidate.occurrenceCount,
              dayActiveWeekCount: candidate.dayActiveWeekCount,
              totalWeekSpanCount: candidate.totalWeekSpanCount,
              dayObservationCount: candidate.dayObservationCount,
              score: candidate.score,
            });
          }
        }

        // step 2: collect all manual slots from bunk store
        const manualSlots: TimetableSlot[] = [];

        for (const course of bunkCourses) {
          if (!course.isCustomCourse && hiddenCourses[course.courseId]) continue;
          if (!course.manualSlots || course.manualSlots.length === 0) continue;

          const displayName =
            course.config?.alias || extractCourseName(course.courseName);

          for (const slot of course.manualSlots) {
            manualSlots.push({
              id: slot.id,
              courseId: course.courseId,
              courseName: displayName,
              dayOfWeek: slot.dayOfWeek,
              startTime: slot.startTime,
              endTime: slot.endTime,
              sessionType: slot.sessionType,
              isManual: true,
              isCustomCourse: course.isCustomCourse,
            });
          }
        }

        // step 3: merge slots (manual slots take precedence for same course+day+time)
        const finalSlotMap = new Map<string, TimetableSlot>();
        const autoSlots = Array.from(autoSlotMap.values());

        for (const slot of autoSlots) {
          const key = `${slot.dayOfWeek}-${slot.startTime}-${slot.courseId}`;
          finalSlotMap.set(key, slot);
        }

        for (const slot of manualSlots) {
          const key = `${slot.dayOfWeek}-${slot.startTime}-${slot.courseId}`;
          finalSlotMap.set(key, slot);
        }

        const mergedSlots = Array.from(finalSlotMap.values());
        mergedSlots.sort((a, b) => {
          if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
          return a.startTime.localeCompare(b.startTime);
        });

        const getSlotStats = (
          slot: TimetableSlot,
        ): SlotOccurrenceStats | undefined => {
          if (slot.isManual) return undefined;
          return autoSlotStatsMap.get(
            autoSlotStoreKey(slot.courseId, slot.dayOfWeek, slot.startTime),
          );
        };

        // step 4: detect cross-course time overlaps
        const timeOverlapConflicts: TimeOverlapSlotConflict[] = [];
        const removedSlotKeys = new Set<string>();

        for (let i = 0; i < mergedSlots.length; i += 1) {
          for (let j = i + 1; j < mergedSlots.length; j += 1) {
            const slotA = mergedSlots[i];
            const slotB = mergedSlots[j];

            if (slotA.dayOfWeek !== slotB.dayOfWeek) continue;
            if (slotA.courseId === slotB.courseId) continue;
            if (
              !timesOverlap(
                slotA.startTime,
                slotA.endTime,
                slotB.startTime,
                slotB.endTime,
              )
            ) {
              continue;
            }

            const statsA = getSlotStats(slotA);
            const statsB = getSlotStats(slotB);
            const rankA = rankSlotForConflict(statsA);
            const rankB = rankSlotForConflict(statsB);

            // higher occurrence frequency = preferred
            let preferredSlot = slotA;
            let alternativeSlot = slotB;
            let preferredStats = statsA;
            let alternativeStats = statsB;

            if (rankB > rankA) {
              preferredSlot = slotB;
              alternativeSlot = slotA;
              preferredStats = statsB;
              alternativeStats = statsA;
            }

            const conflictId = buildPairConflictId(slotA, slotB);
            const preferredKey = slotResolutionKey(preferredSlot);
            const alternativeKey = slotResolutionKey(alternativeSlot);
            const resolvedSlotKey =
              timeOverlapResolutions[conflictId] ?? preferredKey;
            const resolvedChoice =
              resolvedSlotKey === alternativeKey
                ? "alternative"
                : "preferred";

            if (resolvedChoice === "preferred") {
              removedSlotKeys.add(alternativeKey);
            } else if (resolvedChoice === "alternative") {
              removedSlotKeys.add(preferredKey);
            }

            timeOverlapConflicts.push({
              type: "time-overlap",
              conflictId,
              preferredSlot,
              alternativeSlot,
              preferredStats,
              alternativeStats,
              resolvedChoice,
            });
          }
        }

        const slots = mergedSlots.filter(
          (slot) => !removedSlotKeys.has(slotResolutionKey(slot)),
        );
        const conflicts: SlotConflict[] = [
          ...timeOverlapConflicts,
          ...outlierConflicts,
        ];

        set({
          slots,
          conflicts,
          lastGeneratedAt: Date.now(),
          isLoading: false,
        });
      },

      resolveConflict: (conflictIndex, keep) => {
        const { conflicts, timeOverlapResolutions, outlierResolutions } = get();
        if (conflictIndex < 0 || conflictIndex >= conflicts.length) return;

        const conflict = conflicts[conflictIndex];

        if (conflict.type === "time-overlap") {
          const chosenSlotKey =
            keep === "alternative"
              ? slotResolutionKey(conflict.alternativeSlot)
              : slotResolutionKey(conflict.preferredSlot);
          set({
            timeOverlapResolutions: {
              ...timeOverlapResolutions,
              [conflict.conflictId]: chosenSlotKey,
            },
          });
          get().generateTimetable();
          return;
        }

        if (conflict.type === "outlier-review") {
          set({
            outlierResolutions: {
              ...outlierResolutions,
              [conflict.conflictId]: keep === "keep-outlier" ? "keep" : "ignore",
            },
          });
        }
        get().generateTimetable();
      },

      resolveAllPreferred: () => {
        const { conflicts, timeOverlapResolutions, outlierResolutions } = get();
        const timeConflicts = conflicts.filter(
          (c): c is TimeOverlapSlotConflict => c.type === "time-overlap",
        );
        const outlierConflicts = conflicts.filter(
          (c): c is OutlierSlotConflict => c.type === "outlier-review",
        );
        if (timeConflicts.length === 0 && outlierConflicts.length === 0) return;

        const updatedTimeResolutions = { ...timeOverlapResolutions };
        for (const conflict of timeConflicts) {
          updatedTimeResolutions[conflict.conflictId] =
            slotResolutionKey(conflict.preferredSlot);
        }

        const updatedOutlierResolutions = { ...outlierResolutions };
        for (const conflict of outlierConflicts) {
          updatedOutlierResolutions[conflict.conflictId] = "ignore";
        }

        set({
          timeOverlapResolutions: updatedTimeResolutions,
          outlierResolutions: updatedOutlierResolutions,
        });
        get().generateTimetable();
      },

      revertConflictResolution: (conflictId) => {
        const { timeOverlapResolutions, outlierResolutions } = get();
        const updatedTimeResolutions = { ...timeOverlapResolutions };
        const updatedOutlierResolutions = { ...outlierResolutions };
        let hasChange = false;

        if (conflictId in updatedTimeResolutions) {
          delete updatedTimeResolutions[conflictId];
          hasChange = true;
        }
        if (conflictId in updatedOutlierResolutions) {
          delete updatedOutlierResolutions[conflictId];
          hasChange = true;
        }
        if (!hasChange) return;

        set({
          timeOverlapResolutions: updatedTimeResolutions,
          outlierResolutions: updatedOutlierResolutions,
        });
        get().generateTimetable();
      },

      clearConflicts: () => {
        set({ conflicts: [] });
      },

      clearTimetable: () => {
        set({
          slots: [],
          conflicts: [],
          timeOverlapResolutions: {},
          outlierResolutions: {},
          lastGeneratedAt: null,
          isLoading: false,
        });
      },
    }),
    {
      name: "timetable-storage",
      version: TIMETABLE_PERSIST_VERSION,
      storage: createJSONStorage(() => zustandStorage),
      migrate: (persistedState, version) => {
        const state = (persistedState ?? {}) as Partial<TimetableState>;

        if (version < TIMETABLE_PERSIST_VERSION) {
          return {
            ...state,
            slots: [],
            conflicts: [],
            timeOverlapResolutions: {},
            outlierResolutions: {},
          };
        }

        return state;
      },
      partialize: (state) => ({
        slots: state.slots,
        conflicts: state.conflicts,
        timeOverlapResolutions: state.timeOverlapResolutions,
        outlierResolutions: state.outlierResolutions,
        lastGeneratedAt: state.lastGeneratedAt,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        const hadPersistedTimetable =
          state.slots.length > 0 ||
          state.conflicts.length > 0 ||
          Object.keys(state.timeOverlapResolutions ?? {}).length > 0 ||
          Object.keys(state.outlierResolutions ?? {}).length > 0 ||
          state.lastGeneratedAt !== null;

        if (!hadPersistedTimetable) return;

        recomputeWhenBaseStoresHydrated(state.generateTimetable);
      },
    },
  ),
);

// get current and next class based on current time
export const getCurrentAndNextClass = (
  slots: TimetableSlot[],
  now: Date = new Date(),
) => {
  const currentDay = now.getDay() as DayOfWeek;
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  const todaySlots = slots.filter((s) => s.dayOfWeek === currentDay);
  todaySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

  let currentClass: TimetableSlot | null = null;
  let nextClass: TimetableSlot | null = null;

  for (const slot of todaySlots) {
    if (currentTime >= slot.startTime && currentTime < slot.endTime) {
      currentClass = slot;
    } else if (currentTime < slot.startTime && !nextClass) {
      nextClass = slot;
    }
  }

  if (!nextClass) {
    for (let i = 1; i <= 7; i++) {
      const checkDay = ((currentDay + i) % 7) as DayOfWeek;
      const daySlots = slots.filter((s) => s.dayOfWeek === checkDay);
      if (daySlots.length > 0) {
        daySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));
        nextClass = daySlots[0];
        break;
      }
    }
  }

  return { currentClass, nextClass };
};

export const formatTimeDisplay = (time: string): string => {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes.toString().padStart(2, "0")} ${period}`;
};

export const getDayName = (day: DayOfWeek, short = true): string => {
  const names = short
    ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    : [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
  return names[day];
};

export const getNearbySlots = (
  slots: TimetableSlot[],
  now: Date = new Date(),
): TimetableSlot[] => {
  if (slots.length === 0) return [];

  const currentDay = now.getDay() as DayOfWeek;
  const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  const todaySlots = slots.filter((s) => s.dayOfWeek === currentDay);
  todaySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));

  const hasRemainingToday = todaySlots.some(
    (slot) => slot.endTime > currentTime,
  );

  let result: TimetableSlot[] = [];

  if (hasRemainingToday) {
    result = todaySlots;
  } else {
    for (let i = 1; i <= 7; i++) {
      const nextDay = ((currentDay + i) % 7) as DayOfWeek;
      const nextDaySlots = slots.filter((s) => s.dayOfWeek === nextDay);
      if (nextDaySlots.length > 0) {
        nextDaySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));
        result = nextDaySlots;
        break;
      }
    }
  }

  return result;
};
