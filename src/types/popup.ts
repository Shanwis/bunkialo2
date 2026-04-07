import type { ComponentType } from "react";

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

export type PopupCtaAction = "run-lms-feedback-autofill";

export interface PopupCustomContentProps {
  popup: PopupNotice;
  onClose: () => void;
}

export interface PopupNotice {
  id: string;
  title: string;
  description: string;
  timestamp: string; // ISO date string
  icon?: PopupIconType;
  iconColor?: string;
  isImportant?: boolean;
  ctaLabel?: string;
  ctaAction?: PopupCtaAction;
  customContent?: ComponentType<PopupCustomContentProps>;
}
