import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Modal, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { POPUP_NOTICES } from "@/data/popups";
import { usePopupStore } from "@/stores/popup-store";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { PopupNotice } from "@/types";

export function NoticePopup() {
  const hasHydrated = usePopupStore((state) => state.hasHydrated);
  const seenPopupIds = usePopupStore((state) => state.seenPopupIds);
  const markAsSeen = usePopupStore((state) => state.markAsSeen);
  const [currentPopup, setCurrentPopup] = useState<PopupNotice | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const isDark = useColorScheme() === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(300)).current;

  // show animation
  const animateIn = useCallback(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, [backdropOpacity, slideAnim]);

  // hide animation, then cleanup
  const animateOut = useCallback(() => {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 300,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (currentPopup) markAsSeen(currentPopup.id);
      setModalVisible(false);
      setCurrentPopup(null);
    });
  }, [backdropOpacity, slideAnim, currentPopup, markAsSeen]);

  // pick the next unseen popup
  useEffect(() => {
    if (!hasHydrated || modalVisible) return;

    const unseen = POPUP_NOTICES.filter(
      (popup) => !seenPopupIds.includes(popup.id),
    );
    if (unseen.length === 0) return;

    const sorted = [...unseen].sort((a, b) => {
      if (a.isImportant && !b.isImportant) return -1;
      if (!a.isImportant && b.isImportant) return 1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    // reset anim values before showing
    backdropOpacity.setValue(0);
    slideAnim.setValue(300);
    setCurrentPopup(sorted[0]);
    setModalVisible(true);
  }, [hasHydrated, modalVisible, seenPopupIds, backdropOpacity, slideAnim]);

  // trigger enter animation once modal is up
  useEffect(() => {
    if (modalVisible && currentPopup) animateIn();
  }, [modalVisible, currentPopup, animateIn]);

  if (!hasHydrated || !currentPopup || !modalVisible) return null;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <View className="flex-1 justify-end">
        {/* backdrop */}
        <Animated.View
          className="absolute inset-0"
          style={{ backgroundColor: "rgba(0,0,0,0.45)", opacity: backdropOpacity }}
        >
          <Pressable className="flex-1" onPress={animateOut} />
        </Animated.View>

        {/* card */}
        <Animated.View
          className="mx-4 mb-4 rounded-3xl p-6"
          style={{
            transform: [{ translateY: slideAnim }],
            backgroundColor: theme.background,
            paddingBottom: Math.max(24, insets.bottom + 16),
            borderWidth: 1,
            borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.12,
            shadowRadius: 16,
            elevation: 12,
          }}
        >
          {/* icon + title */}
          <View className="mb-4 flex-row items-center gap-3">
            <View
              className="h-11 w-11 items-center justify-center rounded-xl"
              style={{
                backgroundColor: currentPopup.iconColor
                  ? `${currentPopup.iconColor}18`
                  : `${Colors.accent}18`,
              }}
            >
              <Ionicons
                name={currentPopup.icon || "notifications"}
                size={22}
                color={currentPopup.iconColor || Colors.accent}
              />
            </View>
            <Text
              className="flex-1 text-[17px] font-bold tracking-tight"
              style={{ color: theme.text }}
              numberOfLines={2}
            >
              {currentPopup.title}
            </Text>
          </View>

          {/* description */}
          <Text
            className="mb-6 text-[15px] leading-6"
            style={{ color: theme.textSecondary }}
          >
            {currentPopup.description}
          </Text>

          {/* dismiss */}
          <Pressable
            onPress={animateOut}
            className="items-center justify-center rounded-2xl py-3.5 active:opacity-70"
            style={{
              backgroundColor: isDark ? Colors.gray[800] : Colors.gray[100],
            }}
          >
            <Text
              className="text-[14px] font-semibold"
              style={{ color: theme.text, letterSpacing: 0.3 }}
            >
              Got it
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}
