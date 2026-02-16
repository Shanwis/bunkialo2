import { Toast } from "@/components";
import { Container } from "@/components/ui/container";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAuthStore } from "@/stores/auth-store";
import {
  LMS_RESOURCES_STALE_MS,
  useLmsResourcesStore,
} from "@/stores/lms-resources-store";
import type { LmsResourceItemNode, LmsResourceSectionNode } from "@/types";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, type ComponentProps } from "react";
import {
  ActivityIndicator,
  InteractionManager,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type Tone = {
  surface: string;
  border: string;
  accent: string;
  text: string;
  subtext: string;
  chipBg: string;
  chipText: string;
  iconBg: string;
};

type ThemedTone = {
  light: Tone;
  dark: Tone;
};

type ModuleVisual = {
  label: string;
  icon: IoniconName;
  tone: ThemedTone;
};

const SECTION_TONES: ThemedTone[] = [
  {
    light: {
      surface: "#F8F4FF",
      border: "#E5DAFF",
      accent: "#896FD6",
      text: "#312754",
      subtext: "#5A4C86",
      chipBg: "#EAE2FF",
      chipText: "#5D48A1",
      iconBg: "#EEE7FF",
    },
    dark: {
      surface: "rgba(137,111,214,0.17)",
      border: "rgba(179,157,255,0.42)",
      accent: "#C9BAFF",
      text: "#F1ECFF",
      subtext: "#CCC2EE",
      chipBg: "rgba(177,150,255,0.24)",
      chipText: "#DCCFFF",
      iconBg: "rgba(194,174,255,0.28)",
    },
  },
  {
    light: {
      surface: "#F0FAF6",
      border: "#CFEFDF",
      accent: "#2F9D71",
      text: "#1B4A36",
      subtext: "#366351",
      chipBg: "#DDF4E9",
      chipText: "#217A58",
      iconBg: "#E1F6EC",
    },
    dark: {
      surface: "rgba(54,173,125,0.16)",
      border: "rgba(96,206,156,0.38)",
      accent: "#8DDEBA",
      text: "#E8FFF3",
      subtext: "#BEE8D4",
      chipBg: "rgba(109,216,168,0.22)",
      chipText: "#CFFFE7",
      iconBg: "rgba(109,216,168,0.26)",
    },
  },
  {
    light: {
      surface: "#FFF7EE",
      border: "#FFE5C9",
      accent: "#D8872F",
      text: "#5B3920",
      subtext: "#805A3D",
      chipBg: "#FFECD6",
      chipText: "#AD6722",
      iconBg: "#FFF1DE",
    },
    dark: {
      surface: "rgba(216,135,47,0.15)",
      border: "rgba(255,187,109,0.34)",
      accent: "#FFC889",
      text: "#FFF4E7",
      subtext: "#EFD4B5",
      chipBg: "rgba(255,188,110,0.22)",
      chipText: "#FFE2BC",
      iconBg: "rgba(255,190,120,0.26)",
    },
  },
  {
    light: {
      surface: "#EFF8FF",
      border: "#CCE7FF",
      accent: "#3E90D6",
      text: "#1D4363",
      subtext: "#3A6284",
      chipBg: "#DDF0FF",
      chipText: "#2D74B3",
      iconBg: "#E4F3FF",
    },
    dark: {
      surface: "rgba(62,144,214,0.16)",
      border: "rgba(120,183,236,0.4)",
      accent: "#9ED2FF",
      text: "#EAF6FF",
      subtext: "#C2DDF2",
      chipBg: "rgba(121,189,242,0.22)",
      chipText: "#D4ECFF",
      iconBg: "rgba(130,196,246,0.26)",
    },
  },
];

const MODULE_VISUALS: Record<string, ModuleVisual> = {
  forum: {
    label: "Forum",
    icon: "megaphone-outline",
    tone: {
      light: {
        surface: "#EEF5FF",
        border: "#CFE1FF",
        accent: "#3D73C7",
        text: "#1A345E",
        subtext: "#496490",
        chipBg: "#DDEAFF",
        chipText: "#2B5CAA",
        iconBg: "#E4EEFF",
      },
      dark: {
        surface: "rgba(86,132,209,0.16)",
        border: "rgba(132,169,233,0.42)",
        accent: "#B2CDFF",
        text: "#EDF3FF",
        subtext: "#CBD9F3",
        chipBg: "rgba(138,174,238,0.24)",
        chipText: "#DDEAFF",
        iconBg: "rgba(138,174,238,0.3)",
      },
    },
  },
  attendance: {
    label: "Attendance",
    icon: "calendar-outline",
    tone: {
      light: {
        surface: "#F2FBF8",
        border: "#D1EFE5",
        accent: "#2E9F77",
        text: "#184A38",
        subtext: "#386957",
        chipBg: "#DFF4EC",
        chipText: "#217D5C",
        iconBg: "#E5F7F0",
      },
      dark: {
        surface: "rgba(74,181,139,0.16)",
        border: "rgba(108,212,171,0.42)",
        accent: "#B4F1D6",
        text: "#E9FFF6",
        subtext: "#C6ECDC",
        chipBg: "rgba(116,220,179,0.24)",
        chipText: "#D6FFE9",
        iconBg: "rgba(118,220,180,0.3)",
      },
    },
  },
  resource: {
    label: "File",
    icon: "document-text-outline",
    tone: {
      light: {
        surface: "#FFF6ED",
        border: "#FFE3C9",
        accent: "#CF8637",
        text: "#5A3920",
        subtext: "#7F5B3E",
        chipBg: "#FFEBD8",
        chipText: "#A86827",
        iconBg: "#FFF1E0",
      },
      dark: {
        surface: "rgba(209,133,59,0.16)",
        border: "rgba(242,178,111,0.42)",
        accent: "#FFD2A2",
        text: "#FFF3E7",
        subtext: "#EFD3B6",
        chipBg: "rgba(244,185,122,0.24)",
        chipText: "#FFE2C0",
        iconBg: "rgba(244,185,122,0.3)",
      },
    },
  },
  folder: {
    label: "Folder",
    icon: "folder-open-outline",
    tone: {
      light: {
        surface: "#F6F1FF",
        border: "#E1D4FF",
        accent: "#8B65CC",
        text: "#3D2D61",
        subtext: "#68538F",
        chipBg: "#ECDDFF",
        chipText: "#6A48AE",
        iconBg: "#EEE4FF",
      },
      dark: {
        surface: "rgba(139,101,204,0.17)",
        border: "rgba(179,148,232,0.42)",
        accent: "#D6BEFF",
        text: "#F3EAFF",
        subtext: "#D4C2F0",
        chipBg: "rgba(182,150,236,0.25)",
        chipText: "#E5D2FF",
        iconBg: "rgba(185,154,238,0.3)",
      },
    },
  },
  assign: {
    label: "Assignment",
    icon: "create-outline",
    tone: {
      light: {
        surface: "#FFF1F5",
        border: "#FDD2E2",
        accent: "#D25D8A",
        text: "#5A233B",
        subtext: "#8A4B66",
        chipBg: "#FEE1EB",
        chipText: "#B2456F",
        iconBg: "#FFE8F0",
      },
      dark: {
        surface: "rgba(210,93,138,0.17)",
        border: "rgba(233,140,176,0.42)",
        accent: "#FFBDD6",
        text: "#FFEAF2",
        subtext: "#F3C8D8",
        chipBg: "rgba(236,148,183,0.24)",
        chipText: "#FFD9E8",
        iconBg: "rgba(236,148,183,0.3)",
      },
    },
  },
  quiz: {
    label: "Quiz",
    icon: "help-circle-outline",
    tone: {
      light: {
        surface: "#FFFBEA",
        border: "#FFEFAE",
        accent: "#C09A2A",
        text: "#514112",
        subtext: "#7A6730",
        chipBg: "#FFF3CB",
        chipText: "#997819",
        iconBg: "#FFF6D8",
      },
      dark: {
        surface: "rgba(192,154,42,0.18)",
        border: "rgba(226,191,95,0.42)",
        accent: "#F0D27A",
        text: "#FFF9DF",
        subtext: "#EBDFAE",
        chipBg: "rgba(230,193,94,0.24)",
        chipText: "#FFF0BE",
        iconBg: "rgba(230,193,94,0.3)",
      },
    },
  },
  vpl: {
    label: "VPL",
    icon: "code-slash-outline",
    tone: {
      light: {
        surface: "#ECFBFA",
        border: "#C8EFEC",
        accent: "#2E9B96",
        text: "#184947",
        subtext: "#376866",
        chipBg: "#D9F4F2",
        chipText: "#237A75",
        iconBg: "#E1F7F5",
      },
      dark: {
        surface: "rgba(46,155,150,0.18)",
        border: "rgba(101,198,194,0.42)",
        accent: "#A9E7E4",
        text: "#E7FFFE",
        subtext: "#C4ECEA",
        chipBg: "rgba(115,208,204,0.24)",
        chipText: "#D1F9F7",
        iconBg: "rgba(115,208,204,0.3)",
      },
    },
  },
  unknown: {
    label: "Resource",
    icon: "layers-outline",
    tone: {
      light: {
        surface: "#F5F7FA",
        border: "#DCE3EC",
        accent: "#5E6B7A",
        text: "#233041",
        subtext: "#4A5A6B",
        chipBg: "#E8EDF4",
        chipText: "#435469",
        iconBg: "#ECF1F7",
      },
      dark: {
        surface: "rgba(94,107,122,0.2)",
        border: "rgba(143,156,171,0.42)",
        accent: "#C8D2DE",
        text: "#EEF4FA",
        subtext: "#D0DAE7",
        chipBg: "rgba(147,160,176,0.26)",
        chipText: "#DEE7F2",
        iconBg: "rgba(147,160,176,0.3)",
      },
    },
  },
};

const formatSyncTime = (timestamp: number | null): string => {
  if (!timestamp) return "Never";

  const date = new Date(timestamp);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  if (isToday) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const sectionNodeKey = (section: LmsResourceSectionNode): string =>
  `section:${section.id}`;
const itemNodeKey = (item: LmsResourceItemNode): string => `item:${item.id}`;

const getSectionTone = (sectionIndex: number, isDark: boolean): Tone => {
  const tone = SECTION_TONES[sectionIndex % SECTION_TONES.length];
  return isDark ? tone.dark : tone.light;
};

const getModuleVisual = (item: LmsResourceItemNode, isDark: boolean): ModuleVisual => {
  const visual = MODULE_VISUALS[item.moduleType] ?? MODULE_VISUALS.unknown;
  return {
    ...visual,
    tone: {
      light: visual.tone.light,
      dark: visual.tone.dark,
    },
  };
};

const moduleLabel = (item: LmsResourceItemNode): string => {
  if (item.typeLabel) return item.typeLabel;
  const visual = MODULE_VISUALS[item.moduleType] ?? MODULE_VISUALS.unknown;
  return visual.label;
};

export default function CourseResourcesScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;

  const { courseid } = useLocalSearchParams<{ courseid: string | string[] }>();
  const courseId = useMemo(
    () => (Array.isArray(courseid) ? (courseid[0] ?? "") : (courseid ?? "")),
    [courseid],
  );

  const isOffline = useAuthStore((state) => state.isOffline);

  const hasHydrated = useLmsResourcesStore((state) => state.hasHydrated);
  const fetchCourseResources = useLmsResourcesStore(
    (state) => state.fetchCourseResources,
  );
  const refreshCourseResources = useLmsResourcesStore(
    (state) => state.refreshCourseResources,
  );
  const toggleNodeExpanded = useLmsResourcesStore(
    (state) => state.toggleNodeExpanded,
  );

  const entry = useLmsResourcesStore((state) =>
    courseId ? state.cacheByCourseId[courseId] : undefined,
  );
  const expandedByNode = useLmsResourcesStore((state) =>
    courseId ? (state.expandedByCourseId[courseId] ?? {}) : {},
  );
  const isLoading = useLmsResourcesStore((state) =>
    courseId ? (state.isLoadingByCourseId[courseId] ?? false) : false,
  );
  const error = useLmsResourcesStore((state) =>
    courseId ? (state.errorByCourseId[courseId] ?? null) : null,
  );

  const tree = entry?.tree;
  const hasCachedTree = Boolean(tree);
  const visibleSections = useMemo(
    () => tree?.sections.filter((section) => section.items.length > 0) ?? [],
    [tree],
  );

  const totalItems = useMemo(
    () => visibleSections.reduce((count, section) => count + section.items.length, 0),
    [visibleSections],
  );

  useEffect(() => {
    if (!courseId || !hasHydrated) return;

    const isTreeStale =
      !entry || Date.now() - entry.lastSyncTime > LMS_RESOURCES_STALE_MS;
    if (!isTreeStale) return;

    const task = InteractionManager.runAfterInteractions(() => {
      void fetchCourseResources(courseId, {
        silent: Boolean(entry),
      });
    });

    return () => task.cancel();
  }, [courseId, entry, fetchCourseResources, hasHydrated]);

  const openExternal = async (url: string): Promise<void> => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        throw new Error("Unsupported URL");
      }

      await Linking.openURL(url);
    } catch {
      Toast.show("Could not open LMS link", { type: "error" });
    }
  };

  const renderItem = (item: LmsResourceItemNode, sectionIndex: number) => {
    const canExpandFolder =
      item.moduleType === "folder" && item.children.length > 0;
    const nodeKey = itemNodeKey(item);
    const expanded =
      expandedByNode[nodeKey] ?? !(item.initiallyCollapsed ?? false);

    const moduleVisual = getModuleVisual(item, isDark);
    const moduleTone = isDark ? moduleVisual.tone.dark : moduleVisual.tone.light;

    return (
      <View
        key={item.id}
        className="overflow-hidden rounded-2xl border"
        style={{
          borderColor: moduleTone.border,
          backgroundColor: moduleTone.surface,
        }}
      >
        <View
          className="absolute bottom-0 left-0 top-0 w-[5px]"
          style={{ backgroundColor: moduleTone.accent }}
        />

        <View className="flex-row items-start gap-3 px-3 py-3">
          <View
            className="mt-0.5 h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: moduleTone.iconBg }}
          >
            <Ionicons name={moduleVisual.icon} size={16} color={moduleTone.accent} />
          </View>

          <Pressable
            className="flex-1"
            onPress={() => void openExternal(item.url)}
          >
            <Text
              className="text-[14px] font-semibold"
              style={{ color: moduleTone.text }}
              numberOfLines={2}
            >
              {item.title}
            </Text>

            <View className="mt-2 flex-row flex-wrap items-center gap-2">
              <View
                className="rounded-full px-2.5 py-1"
                style={{ backgroundColor: moduleTone.chipBg }}
              >
                <Text
                  className="text-[10px] font-semibold uppercase tracking-[0.4px]"
                  style={{ color: moduleTone.chipText }}
                >
                  {moduleLabel(item)}
                </Text>
              </View>

              {item.children.length > 0 && (
                <Text className="text-[11px]" style={{ color: moduleTone.subtext }}>
                  {item.children.length} file{item.children.length > 1 ? "s" : ""}
                </Text>
              )}
            </View>

            {item.availabilityText && (
              <View
                className="mt-2 rounded-xl border px-2.5 py-2"
                style={{
                  backgroundColor: `${Colors.status.warning}14`,
                  borderColor: `${Colors.status.warning}55`,
                }}
              >
                <Text
                  className="text-[11px]"
                  style={{ color: Colors.status.warning }}
                  numberOfLines={2}
                >
                  {item.availabilityText}
                </Text>
              </View>
            )}
          </Pressable>

          <View className="items-center gap-1">
            {canExpandFolder && (
              <Pressable
                className="h-8 w-8 items-center justify-center rounded-full"
                style={{ backgroundColor: moduleTone.iconBg }}
                onPress={() => toggleNodeExpanded(courseId, nodeKey)}
              >
                <Ionicons
                  name={expanded ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={moduleTone.accent}
                />
              </Pressable>
            )}

            <Pressable
              className="h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: moduleTone.iconBg }}
              onPress={() => void openExternal(item.url)}
            >
              <Ionicons
                name="open-outline"
                size={15}
                color={moduleTone.accent}
              />
            </Pressable>
          </View>
        </View>

        {canExpandFolder && expanded && (
          <View
            className="border-t px-3 pb-3 pt-2"
            style={{ borderColor: moduleTone.border }}
          >
            <View
              className="ml-3 gap-2 border-l pl-3"
              style={{ borderColor: moduleTone.border }}
            >
              {item.children.map((child) => (
                <Pressable
                  key={child.id}
                  className="flex-row items-center justify-between rounded-xl border px-3 py-2"
                  style={{
                    backgroundColor: isDark ? theme.background : Colors.white,
                    borderColor: moduleTone.border,
                  }}
                  onPress={() => void openExternal(child.url)}
                >
                  <Text
                    className="flex-1 pr-2 text-[12px]"
                    style={{ color: theme.text }}
                    numberOfLines={2}
                  >
                    {child.name}
                  </Text>
                  <Ionicons
                    name="document-outline"
                    size={14}
                    color={moduleTone.accent}
                  />
                </Pressable>
              ))}
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <Container className="relative">
      <View pointerEvents="none" className="absolute inset-0">
        <View
          className="absolute -left-10 top-8 h-44 w-44 rounded-full"
          style={{ backgroundColor: isDark ? "#8B65CC22" : "#8B65CC1A" }}
        />
        <View
          className="absolute -right-8 top-32 h-36 w-36 rounded-full"
          style={{ backgroundColor: isDark ? "#2E9B9620" : "#2E9B9615" }}
        />
      </View>

      <ScrollView
        contentContainerClassName="px-4 pb-10"
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              if (!courseId) return;
              void refreshCourseResources(courseId);
            }}
            tintColor={theme.text}
          />
        }
      >
        <View className="mb-5 mt-3 gap-4">
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={() => router.back()}
              className="h-11 w-11 items-center justify-center rounded-full"
              style={{ backgroundColor: isDark ? Colors.gray[900] : Colors.white }}
            >
              <Ionicons name="arrow-back" size={21} color={theme.text} />
            </Pressable>

            <View
              className="rounded-full border px-3 py-1.5"
              style={{
                backgroundColor: isDark ? Colors.gray[900] : Colors.white,
                borderColor: theme.border,
              }}
            >
              <Text className="text-[10px]" style={{ color: theme.textSecondary }}>
                {formatSyncTime(entry?.lastSyncTime ?? null)}
              </Text>
            </View>
          </View>

          <View
            className="rounded-[26px] border px-4 py-4"
            style={{
              borderColor: isDark ? "#8B65CC55" : "#D9CCFF",
              backgroundColor: isDark ? "rgba(139,101,204,0.16)" : "#F7F2FF",
            }}
          >
            <Text className="text-[30px] font-extrabold" style={{ color: theme.text }}>
              {tree?.courseTitle ?? `Course ${courseId}`}
            </Text>
            <Text className="mt-1 text-[13px]" style={{ color: theme.textSecondary }}>
              Hierarchical LMS resource tree
            </Text>

            <View className="mt-4 flex-row flex-wrap gap-2">
              <View
                className="rounded-full px-3 py-1"
                style={{
                  backgroundColor: isDark ? "#8B65CC44" : "#E8DEFF",
                }}
              >
                <Text className="text-[11px] font-semibold" style={{ color: theme.text }}>
                  {visibleSections.length} section{visibleSections.length > 1 ? "s" : ""}
                </Text>
              </View>
              <View
                className="rounded-full px-3 py-1"
                style={{
                  backgroundColor: isDark ? "#2E9B9644" : "#D9F4F2",
                }}
              >
                <Text className="text-[11px] font-semibold" style={{ color: theme.text }}>
                  {totalItems} resource{totalItems > 1 ? "s" : ""}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {isOffline && hasCachedTree && (
          <View
            className="mb-4 rounded-2xl border px-3 py-2.5"
            style={{
              backgroundColor: `${Colors.status.warning}1A`,
              borderColor: `${Colors.status.warning}66`,
            }}
          >
            <Text className="text-[12px]" style={{ color: Colors.status.warning }}>
              Offline mode: showing cached resources
            </Text>
          </View>
        )}

        {!hasCachedTree && isLoading && (
          <View className="items-center gap-3 py-12">
            <ActivityIndicator size="large" color={theme.text} />
            <Text className="text-sm" style={{ color: theme.textSecondary }}>
              Loading course resources...
            </Text>
          </View>
        )}

        {!hasCachedTree && error && !isLoading && (
          <View
            className="items-center gap-4 rounded-2xl border p-4"
            style={{
              borderColor: `${Colors.status.danger}55`,
              backgroundColor: `${Colors.status.danger}12`,
            }}
          >
            <Text className="text-[14px] text-center" style={{ color: Colors.status.danger }}>
              {error}
            </Text>
            <Pressable
              className="rounded-full px-4 py-2"
              style={{ backgroundColor: theme.backgroundSecondary }}
              onPress={() => {
                if (!courseId) return;
                void refreshCourseResources(courseId);
              }}
            >
              <Text className="text-[13px] font-semibold" style={{ color: theme.text }}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        {tree && visibleSections.length === 0 && !isLoading && (
          <View
            className="items-center gap-2 rounded-2xl border px-4 py-8"
            style={{ borderColor: theme.border, backgroundColor: theme.backgroundSecondary }}
          >
            <Ionicons name="albums-outline" size={26} color={theme.textSecondary} />
            <Text className="text-[14px]" style={{ color: theme.textSecondary }}>
              No resources available in this course.
            </Text>
          </View>
        )}

        {tree && visibleSections.length > 0 && (
          <View className="gap-3">
            {visibleSections.map((section, sectionIndex) => {
              const key = sectionNodeKey(section);
              const expanded = expandedByNode[key] ?? !section.initiallyCollapsed;
              const sectionTone = getSectionTone(sectionIndex, isDark);

              return (
                <View
                  key={section.id}
                  className="overflow-hidden rounded-[24px] border"
                  style={{
                    borderColor: sectionTone.border,
                    backgroundColor: sectionTone.surface,
                  }}
                >
                  <View
                    className="h-[4px] w-full"
                    style={{ backgroundColor: sectionTone.accent }}
                  />

                  <Pressable
                    className="flex-row items-center justify-between px-4 py-3"
                    onPress={() => toggleNodeExpanded(courseId, key)}
                  >
                    <View className="flex-1 pr-2">
                      <View className="flex-row items-center gap-2">
                        <View
                          className="h-7 w-7 items-center justify-center rounded-full"
                          style={{ backgroundColor: sectionTone.iconBg }}
                        >
                          <Ionicons
                            name="layers-outline"
                            size={14}
                            color={sectionTone.accent}
                          />
                        </View>
                        <Text className="text-[16px] font-bold" style={{ color: sectionTone.text }}>
                          {section.title}
                        </Text>
                      </View>

                      <View
                        className="mt-2 self-start rounded-full px-2.5 py-1"
                        style={{ backgroundColor: sectionTone.chipBg }}
                      >
                        <Text className="text-[10px] font-semibold" style={{ color: sectionTone.chipText }}>
                          {section.items.length} item{section.items.length > 1 ? "s" : ""}
                        </Text>
                      </View>
                    </View>

                    <View
                      className="h-8 w-8 items-center justify-center rounded-full"
                      style={{ backgroundColor: sectionTone.iconBg }}
                    >
                      <Ionicons
                        name={expanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={sectionTone.accent}
                      />
                    </View>
                  </Pressable>

                  {expanded && (
                    <View className="gap-2 px-3 pb-3">
                      {section.items.map((item) => renderItem(item, sectionIndex))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Container>
  );
}
