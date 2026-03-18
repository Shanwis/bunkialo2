import { Colors } from "@/constants/theme";
import type { PopupNotice } from "@/types";

export const POPUP_NOTICES: PopupNotice[] = [
  {
    id: "menu-update-2026-03",
    title: "Menu Updated",
    description: "The mess menu has been updated to the temporary menu of 2026.",
    timestamp: "2026-03-17T12:00:00+05:30",
    icon: "restaurant",
    iconColor: Colors.status.success,
    isImportant: true,
  },
];
