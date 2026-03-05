/**
 * Timetable types
 */

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type SessionType = "regular" | "lab" | "tutorial";

export interface TimetableSlot {
  id: string;
  courseId: string;
  courseName: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  sessionType: SessionType;
  isManual: boolean;
  isCustomCourse: boolean;
}

export interface ManualSlot {
  id: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  sessionType: SessionType;
}

export interface SlotOccurrenceStats {
  occurrenceCount: number;
  dayActiveWeekCount: number;
  totalWeekSpanCount: number;
  dayObservationCount: number;
  score: number;
}

export interface TimeOverlapSlotConflict {
  type: "time-overlap";
  conflictId: string;
  preferredSlot: TimetableSlot;
  alternativeSlot: TimetableSlot;
  preferredStats?: SlotOccurrenceStats;
  alternativeStats?: SlotOccurrenceStats;
  resolvedChoice: "preferred" | "alternative" | null;
}

export interface OutlierSlotConflict {
  type: "outlier-review";
  conflictId: string;
  slot: TimetableSlot;
  stats: SlotOccurrenceStats;
  resolvedChoice: "keep" | "ignore" | null;
}

export type SlotConflict = TimeOverlapSlotConflict | OutlierSlotConflict;

export interface TimeOverlapResolutions {
  [conflictId: string]: string;
}

export interface OutlierResolutions {
  [conflictId: string]: "keep" | "ignore";
}

export interface TimetableState {
  slots: TimetableSlot[];
  conflicts: SlotConflict[];
  timeOverlapResolutions: TimeOverlapResolutions;
  outlierResolutions: OutlierResolutions;
  lastGeneratedAt: number | null;
  isLoading: boolean;
}
