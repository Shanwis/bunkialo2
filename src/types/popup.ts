export type PopupIconType =
  | "notifications"
  | "warning"
  | "information"
  | "alert-circle"
  | "calendar"
  | "fast-food"
  | "restaurant"
  | "school"
  | "star";

export interface PopupNotice {
  id: string;
  title: string;
  description: string;
  timestamp: string; // ISO date string
  icon?: PopupIconType;
  iconColor?: string;
  isImportant?: boolean;
}
