import { Toast } from "@/components";
import { Container } from "@/components/ui/container";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { LmsDownloadProgress } from "../../services/lms-download";
import { downloadLmsResourceWithSession } from "../../services/lms-download";
import { useAuthStore } from "@/stores/auth-store";
import { useBunkStore } from "@/stores/bunk-store";
import {
  LMS_RESOURCES_STALE_MS,
  useLmsResourcesStore,
} from "@/stores/lms-resources-store";
import type { LmsResourceItemNode } from "@/types";
import { extractCourseName } from "@/utils/course-name";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { useEffect, useMemo, useState } from "react";
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
import {
  formatSyncTime,
  getModuleVisual,
  getSectionTone,
  itemNodeKey,
  moduleLabel,
  resolveCourseColorFallback,
  sectionNodeKey,
  toRgba,
} from "./utils/course-utils";

const ANNOUNCEMENT_FORUM_MATCHERS = [
  "announcement",
  "announcements",
  "news forum",
  "notice board",
];

const shouldHideItem = (item: LmsResourceItemNode): boolean => {
  if (item.moduleType !== "forum") return false;

  const normalized = `${item.title} ${item.typeLabel ?? ""}`
    .toLowerCase()
    .trim();
  return ANNOUNCEMENT_FORUM_MATCHERS.some((matcher) =>
    normalized.includes(matcher),
  );
};

const formatOrdinal = (value: number): string => String(value).padStart(2, "0");

const pluralize = (
  count: number,
  singular: string,
  plural: string,
): string => (count === 1 ? singular : plural);

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
  const bunkCourses = useBunkStore((state) => state.courses);
  const configuredCourse = useMemo(
    () => bunkCourses.find((course) => course.courseId === courseId),
    [bunkCourses, courseId],
  );
  const courseColor =
    configuredCourse?.config?.color ?? resolveCourseColorFallback(courseId);
  const displayCourseName = useMemo(() => {
    const alias = configuredCourse?.config?.alias?.trim();
    if (alias) return alias;

    const rawTitle = tree?.courseTitle ?? `Course ${courseId}`;
    return extractCourseName(rawTitle);
  }, [configuredCourse?.config?.alias, courseId, tree?.courseTitle]);

  const hasCachedTree = Boolean(tree);
  const visibleSections = useMemo(() => {
    if (!tree) return [];
    return tree.sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => !shouldHideItem(item)),
      }))
      .filter((section) => section.items.length > 0);
  }, [tree]);

  const totalItems = useMemo(
    () =>
      visibleSections.reduce(
        (count, section) => count + section.items.length,
        0,
      ),
    [visibleSections],
  );

  const totalSections = visibleSections.length;
  const [downloadProgressByUrl, setDownloadProgressByUrl] = useState<
    Record<string, LmsDownloadProgress>
  >({});
  const [downloadingUrlSet, setDownloadingUrlSet] = useState<
    Record<string, boolean>
  >({});

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

  const openExternal = async (
    url: string,
    options?: { tryDownload?: boolean; preferredName?: string },
  ): Promise<void> => {
    if (options?.tryDownload) {
      if (downloadingUrlSet[url]) return;

      setDownloadingUrlSet((prev) => ({ ...prev, [url]: true }));
      setDownloadProgressByUrl((prev) => ({
        ...prev,
        [url]: {
          totalBytesWritten: 0,
          totalBytesExpected: null,
          fraction: null,
        },
      }));

      const downloadResult = await downloadLmsResourceWithSession(
        url,
        options.preferredName ?? "lms-resource",
        {
          onProgress: (progress) => {
            setDownloadProgressByUrl((prev) => ({
              ...prev,
              [url]: progress,
            }));
          },
        },
      );

      if (!downloadResult.success) {
        setDownloadingUrlSet((prev) => {
          const next = { ...prev };
          delete next[url];
          return next;
        });
        setDownloadProgressByUrl((prev) => {
          const next = { ...prev };
          delete next[url];
          return next;
        });
        Toast.show(downloadResult.message || "Download failed", {
          type: "error",
        });
        return;
      }

      const canShare = await isAvailableAsync();
      if (canShare) {
        await shareAsync(downloadResult.uri, {
          dialogTitle: "Open downloaded file",
        });
      } else {
        await Linking.openURL(downloadResult.uri);
      }

      setDownloadingUrlSet((prev) => {
        const next = { ...prev };
        delete next[url];
        return next;
      });
      setDownloadProgressByUrl((prev) => {
        const next = { ...prev };
        delete next[url];
        return next;
      });
      Toast.show("Downloaded successfully", {
        type: "success",
      });
      return;
    }

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

  const renderItem = (item: LmsResourceItemNode, itemNumber: string) => {
    const canExpandFolder =
      item.moduleType === "folder" && item.children.length > 0;
    const nodeKey = itemNodeKey(item);
    const expanded =
      expandedByNode[nodeKey] ?? !(item.initiallyCollapsed ?? false);

    const moduleVisual = getModuleVisual(item, isDark);
    const moduleTone = isDark
      ? moduleVisual.tone.dark
      : moduleVisual.tone.light;
    const itemDownloadProgress = downloadProgressByUrl[item.url];
    const isItemDownloading = Boolean(downloadingUrlSet[item.url]);
    const itemProgressText =
      isItemDownloading && itemDownloadProgress
        ? itemDownloadProgress.fraction !== null
          ? `Downloading ${Math.round(itemDownloadProgress.fraction * 100)}%`
          : "Downloading..."
        : null;

    return (
      <View
        key={item.id}
        className="overflow-hidden rounded-2xl border"
        style={{
          borderColor: theme.border,
          backgroundColor: theme.backgroundSecondary,
        }}
      >
        <View
          className="absolute bottom-0 left-0 top-0 w-[4px]"
          style={{ backgroundColor: moduleTone.accent }}
        />

        <View className="flex-row items-start gap-3 px-3 py-3">
          <View
            className="mt-0.5 h-8 w-8 items-center justify-center rounded-full"
            style={{
              backgroundColor: theme.background,
              borderColor: theme.border,
              borderWidth: 1,
            }}
          >
            <Ionicons name={moduleVisual.icon} size={16} color={theme.icon} />
          </View>

          <Pressable
            className="flex-1"
            onPress={() =>
              void openExternal(item.url, {
                tryDownload: item.moduleType === "resource",
                preferredName: item.title,
              })
            }
          >
            <View className="flex-row items-center gap-2">
              <View
                className="rounded-md border px-2 py-0.5"
                style={{
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                }}
              >
                <Text
                  className="text-[11px] font-bold tracking-[0.5px]"
                  style={{
                    color: theme.textSecondary,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {itemNumber}
                </Text>
              </View>
              <Text
                className="flex-1 text-[14px] font-semibold"
                style={{ color: theme.text }}
                numberOfLines={2}
              >
                {item.title}
              </Text>
            </View>

            <View className="mt-2 flex-row flex-wrap items-center gap-2">
              <View
                className="rounded-full border px-2.5 py-1"
                style={{
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                }}
              >
                <Text
                  className="text-[10px] font-semibold uppercase tracking-[0.4px]"
                  style={{ color: theme.textSecondary }}
                >
                  {moduleLabel(item)}
                </Text>
              </View>

              {item.children.length > 0 && (
                <Text
                  className="text-[11px]"
                  style={{ color: theme.textSecondary }}
                >
                  {item.children.length} file
                  {item.children.length > 1 ? "s" : ""}
                </Text>
              )}
            </View>

            {itemProgressText && (
              <Text className="mt-1 text-[11px]" style={{ color: theme.textSecondary }}>
                {itemProgressText}
              </Text>
            )}

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
                style={{
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  borderWidth: 1,
                }}
                onPress={() => toggleNodeExpanded(courseId, nodeKey)}
              >
                <Ionicons
                  name={expanded ? "chevron-up" : "chevron-down"}
                  size={16}
                  color={theme.icon}
                />
              </Pressable>
            )}

            <Pressable
              className="h-8 w-8 items-center justify-center rounded-full"
              style={{
                backgroundColor: theme.background,
                borderColor: theme.border,
                borderWidth: 1,
              }}
              onPress={() =>
                void openExternal(item.url, {
                  tryDownload: item.moduleType === "resource",
                  preferredName: item.title,
                })
              }
            >
              {isItemDownloading ? (
                <ActivityIndicator size="small" color={theme.icon} />
              ) : (
                <Ionicons
                  name="open-outline"
                  size={15}
                  color={theme.icon}
                />
              )}
            </Pressable>
          </View>
        </View>

        {canExpandFolder && expanded && (
          <View
            className="border-t px-3 pb-3 pt-2"
            style={{ borderColor: theme.border }}
          >
            <View
              className="ml-3 gap-2 border-l pl-3"
              style={{ borderColor: theme.border }}
            >
              {item.children.map((child, childIndex) => {
                const childDownloadProgress = downloadProgressByUrl[child.url];
                const isChildDownloading = Boolean(downloadingUrlSet[child.url]);
                const childProgressText =
                  isChildDownloading && childDownloadProgress
                    ? childDownloadProgress.fraction !== null
                      ? `${Math.round(childDownloadProgress.fraction * 100)}%`
                      : "..."
                    : null;

                return (
                  <Pressable
                    key={child.id}
                    className="flex-row items-center justify-between rounded-xl border px-3 py-2"
                    style={{
                      backgroundColor: theme.background,
                      borderColor: theme.border,
                    }}
                    onPress={() =>
                      void openExternal(child.url, {
                        tryDownload: true,
                        preferredName: child.name,
                      })
                    }
                  >
                    <View className="flex-1 flex-row items-center gap-2 pr-2">
                      <Text
                        className="text-[11px] font-bold tracking-[0.4px]"
                        style={{
                          color: theme.textSecondary,
                          fontVariant: ["tabular-nums"],
                        }}
                      >
                        {`${itemNumber}.${formatOrdinal(childIndex + 1)}`}
                      </Text>
                      <Text
                        className="flex-1 text-[12px]"
                        style={{ color: theme.text }}
                        numberOfLines={2}
                      >
                        {child.name}
                      </Text>
                      {childProgressText && (
                        <Text
                          className="text-[11px] font-semibold"
                          style={{ color: theme.textSecondary }}
                        >
                          {childProgressText}
                        </Text>
                      )}
                    </View>
                    {isChildDownloading ? (
                      <ActivityIndicator size="small" color={theme.icon} />
                    ) : (
                      <Ionicons
                        name="document-outline"
                        size={14}
                        color={theme.icon}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <Container className="relative">
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
              style={{
                backgroundColor: isDark ? Colors.gray[900] : Colors.white,
              }}
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
              <Text
                className="text-[10px]"
                style={{ color: theme.textSecondary }}
              >
                {formatSyncTime(entry?.lastSyncTime ?? null)}
              </Text>
            </View>
          </View>

          <View
            className="overflow-hidden rounded-3xl border px-4 py-4"
            style={{
              borderColor: theme.border,
              backgroundColor: theme.backgroundSecondary,
            }}
          >
            <View
              className="absolute left-0 right-0 top-0 h-[4px]"
              style={{
                backgroundColor: toRgba(courseColor, isDark ? 0.85 : 0.7),
              }}
            />
            <Text
              className="text-[30px] font-extrabold leading-[36px]"
              style={{ color: theme.text }}
              numberOfLines={3}
            >
              {displayCourseName}
            </Text>

            <View className="mt-3 flex-row flex-wrap items-center gap-2">
              <View
                className="rounded-full border px-3 py-1.5"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  borderColor: theme.border,
                }}
              >
                <View className="flex-row items-end gap-1">
                  <Text
                    className="text-[14px] font-bold leading-[16px]"
                    style={{
                      color: theme.text,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {totalSections}
                  </Text>
                  <Text
                    className="text-[10px] font-semibold uppercase tracking-[0.5px]"
                    style={{ color: theme.textSecondary }}
                  >
                    {pluralize(totalSections, "section", "sections")}
                  </Text>
                </View>
              </View>
              <View
                className="rounded-full border px-3 py-1.5"
                style={{
                  backgroundColor: theme.backgroundSecondary,
                  borderColor: theme.border,
                }}
              >
                <View className="flex-row items-end gap-1">
                  <Text
                    className="text-[14px] font-bold leading-[16px]"
                    style={{
                      color: theme.text,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {totalItems}
                  </Text>
                  <Text
                    className="text-[10px] font-semibold uppercase tracking-[0.5px]"
                    style={{ color: theme.textSecondary }}
                  >
                    {pluralize(totalItems, "resource", "resources")}
                  </Text>
                </View>
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
            <Text
              className="text-[12px]"
              style={{ color: Colors.status.warning }}
            >
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
            <Text
              className="text-[14px] text-center"
              style={{ color: Colors.status.danger }}
            >
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
              <Text
                className="text-[13px] font-semibold"
                style={{ color: theme.text }}
              >
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        {tree && visibleSections.length === 0 && !isLoading && (
          <View
            className="items-center gap-2 rounded-2xl border px-4 py-8"
            style={{
              borderColor: theme.border,
              backgroundColor: theme.backgroundSecondary,
            }}
          >
            <Ionicons
              name="albums-outline"
              size={26}
              color={theme.textSecondary}
            />
            <Text
              className="text-[14px]"
              style={{ color: theme.textSecondary }}
            >
              No resources available in this course.
            </Text>
          </View>
        )}

        {tree && visibleSections.length > 0 && (
          <View className="gap-3">
            {visibleSections.map((section, sectionIndex) => {
              const key = sectionNodeKey(section);
              const expanded =
                expandedByNode[key] ?? !section.initiallyCollapsed;
              const sectionTone = getSectionTone(sectionIndex, isDark);
              const sectionNumber =
                section.sectionNumber && section.sectionNumber > 0
                  ? section.sectionNumber
                  : sectionIndex + 1;
              const sectionOrdinal = formatOrdinal(sectionNumber);

              return (
                <View
                  key={section.id}
                  className="overflow-hidden rounded-[24px] border"
                  style={{
                    borderColor: theme.border,
                    backgroundColor: theme.backgroundSecondary,
                  }}
                >
                  <View
                    className="absolute bottom-0 left-0 top-0 w-[4px]"
                    style={{ backgroundColor: sectionTone.accent }}
                  />

                  <Pressable
                    className="flex-row items-center justify-between px-4 py-3"
                    onPress={() => toggleNodeExpanded(courseId, key)}
                  >
                    <View className="flex-1 pr-2">
                      <View className="flex-row items-center gap-2">
                        <View
                          className="h-8 min-w-[42px] items-center justify-center rounded-lg px-2"
                          style={{
                            backgroundColor: theme.background,
                            borderColor: theme.border,
                            borderWidth: 1,
                          }}
                        >
                          <Text
                            className="text-[12px] font-bold tracking-[0.6px]"
                            style={{
                              color: theme.textSecondary,
                              fontVariant: ["tabular-nums"],
                            }}
                          >
                            {sectionOrdinal}
                          </Text>
                        </View>
                        <Text
                          className="text-[16px] font-bold"
                          style={{ color: theme.text }}
                        >
                          {section.title}
                        </Text>
                      </View>

                      <View
                        className="mt-2 self-start rounded-full border px-3 py-1.5"
                        style={{
                          backgroundColor: theme.background,
                          borderColor: theme.border,
                        }}
                      >
                        <View className="flex-row items-end gap-1">
                          <Text
                            className="text-[13px] font-bold leading-[15px]"
                            style={{
                              color: theme.text,
                              fontVariant: ["tabular-nums"],
                            }}
                          >
                            {section.items.length}
                          </Text>
                          <Text
                            className="text-[10px] font-semibold uppercase tracking-[0.45px]"
                            style={{ color: theme.textSecondary }}
                          >
                            {pluralize(section.items.length, "item", "items")}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View
                      className="h-8 w-8 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: theme.background,
                        borderColor: theme.border,
                        borderWidth: 1,
                      }}
                    >
                      <Ionicons
                        name={expanded ? "chevron-up" : "chevron-down"}
                        size={18}
                        color={theme.icon}
                      />
                    </View>
                  </Pressable>

                  {expanded && (
                    <View className="gap-2 px-3 pb-3">
                      {section.items.map((item, itemIndex) =>
                        renderItem(
                          item,
                          `${sectionOrdinal}.${formatOrdinal(itemIndex + 1)}`,
                        ),
                      )}
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
