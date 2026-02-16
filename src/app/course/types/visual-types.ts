import type { ComponentProps } from "react";
import { Ionicons } from "@expo/vector-icons";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

export type Tone = {
  surface: string;
  border: string;
  accent: string;
  text: string;
  subtext: string;
  chipBg: string;
  chipText: string;
  iconBg: string;
};

export type ThemedTone = {
  light: Tone;
  dark: Tone;
};

export type ModuleVisual = {
  label: string;
  icon: IoniconName;
  tone: ThemedTone;
};
