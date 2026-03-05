import GrainyGradient from "@/components/shared/ui/organisms/grainy-gradient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore } from "@/stores/auth-store";
import type { LoginTheme } from "@/types";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  InteractionManager,
  Platform,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";

const LOGIN_THEME: LoginTheme = {
  fieldBorder: "rgba(244, 244, 245, 0.2)",
  fieldBackground: "rgba(8, 8, 10, 0.95)",
  fieldFilledBorder: "rgba(255, 255, 255, 0.34)",
  fieldFilledBackground: "rgba(14, 14, 16, 0.95)",
  fieldFocusBorder: "rgba(255, 255, 255, 0.78)",
  fieldFocusBackground: "rgba(16, 16, 18, 0.98)",
  fieldFocusGlow: "#E4E4E7",
  fieldRadius: 22,
  inputPaddingLeft: 44,
  inputPaddingRight: 14,
  placeholderColor: "#71717A",
  textColor: "#FAFAFA",
  iconIdle: "#A1A1AA",
  iconActive: "#FAFAFA",
  iconName: "account-outline",
  lockName: "lock-outline",
  eyeBorder: "rgba(255, 255, 255, 0.46)",
  eyeBackground: "rgba(18, 18, 20, 0.85)",
  eyeColor: "#FAFAFA",
};

type ShaderQualityTier = 0 | 1 | 2;

const LOGIN_SHADER_TIER_KEY = "@bunkialo/login-shader-tier";
const LOGIN_SHADER_GUARD_KEY = "@bunkialo/login-shader-guard";
const LOGIN_SHADER_GUARD_WINDOW_MS = 2 * 60 * 1000;
const LOGIN_SHADER_GUARD_CLEAR_MS = 6500;

const SHADER_PRESETS: Record<
  ShaderQualityTier,
  {
    speed: number;
    intensity: number;
    size: number;
    amplitude: number;
    brightness: number;
    resolutionScale: number;
    settleMs: number;
    animated: boolean;
  }
> = {
  0: {
    speed: 3.2,
    intensity: 0.13,
    size: 1.8,
    amplitude: 0.16,
    brightness: 0.02,
    resolutionScale: 0.35,
    settleMs: 3000,
    animated: true,
  },
  1: {
    speed: 2.6,
    intensity: 0.1,
    size: 1.6,
    amplitude: 0.12,
    brightness: 0.015,
    resolutionScale: 0.35,
    settleMs: 2200,
    animated: true,
  },
  2: {
    speed: 1.9,
    intensity: 0.08,
    size: 1.45,
    amplitude: 0.09,
    brightness: 0.012,
    resolutionScale: 0.25,
    settleMs: 1500,
    animated: false,
  },
};

const parseShaderTier = (rawTier: string | null): ShaderQualityTier => {
  if (rawTier === "1") return 1;
  if (rawTier === "2") return 2;
  return 0;
};

export default function LoginScreen() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [gradientReady, setGradientReady] = useState(false);
  const [shaderTier, setShaderTier] = useState<ShaderQualityTier>(0);
  const { login, isLoading, error, setError } = useAuthStore();
  const { width, height } = useWindowDimensions();
  const heroProgress = useRef(new Animated.Value(0)).current;
  const cardProgress = useRef(new Animated.Value(0)).current;
  const isLandscape = width > height;
  const isCompactHeight = height < 780;
  const shaderPreset = SHADER_PRESETS[shaderTier];

  useEffect(() => {
    let mounted = true;
    let guardClearTimeout: ReturnType<typeof setTimeout> | null = null;

    const initShaderTier = async () => {
      try {
        const [storedTier, guardTimestampRaw] = await Promise.all([
          AsyncStorage.getItem(LOGIN_SHADER_TIER_KEY),
          AsyncStorage.getItem(LOGIN_SHADER_GUARD_KEY),
        ]);

        let nextTier = parseShaderTier(storedTier);

        if (guardTimestampRaw) {
          const guardTimestamp = Number(guardTimestampRaw);
          const hasRecentGuard =
            Number.isFinite(guardTimestamp) &&
            Date.now() - guardTimestamp <= LOGIN_SHADER_GUARD_WINDOW_MS;

          if (hasRecentGuard && nextTier < 2) {
            nextTier = (nextTier + 1) as ShaderQualityTier;
            await AsyncStorage.setItem(LOGIN_SHADER_TIER_KEY, String(nextTier));
          }
        }

        await AsyncStorage.setItem(LOGIN_SHADER_GUARD_KEY, String(Date.now()));

        if (mounted) {
          setShaderTier(nextTier);
        }

        guardClearTimeout = setTimeout(() => {
          void AsyncStorage.removeItem(LOGIN_SHADER_GUARD_KEY);
        }, LOGIN_SHADER_GUARD_CLEAR_MS);
      } catch {
        if (mounted) {
          setShaderTier(1);
        }
      }
    };

    void initShaderTier();

    return () => {
      mounted = false;
      if (guardClearTimeout) {
        clearTimeout(guardClearTimeout);
      }
      void AsyncStorage.removeItem(LOGIN_SHADER_GUARD_KEY);
    };
  }, []);

  // defer gradient mount until after initial layout/animations
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setGradientReady(true);
    });
    return () => handle.cancel();
  }, []);

  useEffect(() => {
    heroProgress.setValue(0);
    cardProgress.setValue(0);

    const heroDuration = shaderTier === 0 ? 150 : shaderTier === 1 ? 130 : 110;
    const cardDuration = shaderTier === 0 ? 190 : shaderTier === 1 ? 160 : 130;
    const cardDelay = shaderTier === 2 ? 16 : 30;

    Animated.parallel([
      Animated.timing(heroProgress, {
        toValue: 1,
        duration: heroDuration,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(cardProgress, {
        toValue: 1,
        duration: cardDuration,
        delay: cardDelay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [cardProgress, heroProgress, shaderTier]);

  const handleUsernameChange = useCallback(
    (value: string) => {
      if (error) setError(null);
      setUsername(value);
    },
    [error, setError],
  );

  const handlePasswordChange = useCallback(
    (value: string) => {
      if (error) setError(null);
      setPassword(value);
    },
    [error, setError],
  );

  const handleLogin = useCallback(async () => {
    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    if (!trimmedUsername || !trimmedPassword) {
      setError("Please enter both username and password");
      return;
    }

    await login(trimmedUsername, trimmedPassword);
  }, [username, password, login, setError]);

  const hasUsername = Boolean(username.trim());
  const hasPassword = Boolean(password.trim());
  const canSubmit = hasUsername && hasPassword && !isLoading;
  const theme = LOGIN_THEME;
  const heroAnimatedStyle = {
    opacity: heroProgress,
    transform: [
      {
        translateY: heroProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [14, 0],
        }),
      },
    ],
  };
  const cardAnimatedStyle = {
    opacity: cardProgress,
    transform: [
      {
        translateY: cardProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [20, 0],
        }),
      },
      {
        scale: cardProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.985, 1],
        }),
      },
    ],
  };

  return (
    <View className="flex-1 bg-black">
      <StatusBar style="light" />
      {gradientReady && (
        <GrainyGradient
          colors={["#111113", "#1B1B20", "#26262C", "#16161A"]}
          speed={shaderPreset.speed}
          intensity={shaderPreset.intensity}
          size={shaderPreset.size}
          amplitude={shaderPreset.amplitude}
          brightness={shaderPreset.brightness}
          resolutionScale={shaderPreset.resolutionScale}
          settleMs={shaderPreset.settleMs}
          animated={shaderPreset.animated}
          style={styles.absoluteFill}
        />
      )}
      <View className="absolute inset-0 bg-black/28" />

      <SafeAreaView
        className="flex-1"
        edges={["top", "bottom"]}
        style={[
          styles.safeArea,
          isCompactHeight && styles.safeAreaCompact,
          isLandscape && styles.safeAreaLandscape,
        ]}
      >
        <KeyboardAwareScrollView
          className="flex-1"
          contentContainerStyle={[
            styles.scrollContent,
            isCompactHeight && styles.scrollContentCompact,
            isLandscape && styles.scrollContentLandscape,
          ]}
          bottomOffset={24}
          extraKeyboardSpace={32}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.contentShell,
              isCompactHeight && styles.contentShellCompact,
              isLandscape && styles.contentShellLandscape,
            ]}
          >
            <Animated.View
              className="gap-4"
              style={[
                heroAnimatedStyle,
                styles.heroBlock,
                isLandscape && styles.heroBlockLandscape,
              ]}
            >
              <View className="self-start rounded-full border border-zinc-700/55 bg-black/40 px-4 py-2">
                <Text className="text-[11px] font-semibold uppercase tracking-[2.6px] text-zinc-300">
                  sign-in
                </Text>
              </View>

              <View className="gap-3">
                <Text
                  className="font-black tracking-[-2px] text-zinc-100"
                  style={[
                    styles.title,
                    isCompactHeight && styles.titleCompact,
                    isLandscape && styles.titleLandscape,
                  ]}
                >
                  Bunkialo
                </Text>
                <Text
                  className="text-zinc-300"
                  style={[
                    styles.subtitle,
                    isCompactHeight && styles.subtitleCompact,
                    isLandscape && styles.subtitleLandscape,
                  ]}
                >
                  Sign in once to keep attendance, assignments, and reminders
                  synced.
                </Text>
              </View>
            </Animated.View>

            <Animated.View
              className="gap-5"
              style={[
                cardAnimatedStyle,
                styles.cardBlock,
                isLandscape && styles.cardBlockLandscape,
              ]}
            >
              <View
                className="rounded-[32px] border border-zinc-700/55 bg-[#080808]/80 p-6"
                style={styles.formCard}
              >
                <View className="gap-4">
                  <View>
                    <View
                      style={[
                        styles.fieldShell,
                        { borderColor: theme.fieldBorder },
                        {
                          backgroundColor: theme.fieldBackground,
                          borderRadius: theme.fieldRadius,
                          borderWidth: 1,
                        },
                        usernameFocused && styles.fieldShellFocused,
                        usernameFocused && {
                          borderColor: theme.fieldFocusBorder,
                          backgroundColor: theme.fieldFocusBackground,
                          shadowColor: theme.fieldFocusGlow,
                        },
                        hasUsername && styles.fieldShellFilled,
                        hasUsername && {
                          borderColor: theme.fieldFilledBorder,
                          backgroundColor: theme.fieldFilledBackground,
                        },
                        error && styles.fieldShellError,
                      ]}
                    >
                      <View
                        pointerEvents="none"
                        style={[
                          styles.fieldInnerHighlight,
                          {
                            borderRadius: Math.max(theme.fieldRadius - 2, 8),
                          },
                        ]}
                      />
                      <MaterialCommunityIcons
                        name={theme.iconName}
                        size={18}
                        color={
                          usernameFocused || hasUsername
                            ? theme.iconActive
                            : theme.iconIdle
                        }
                        style={styles.leadingIcon}
                      />
                      <Input
                        placeholder="Lms roll number"
                        value={username}
                        onChangeText={handleUsernameChange}
                        onFocus={() => setUsernameFocused(true)}
                        onBlur={() => setUsernameFocused(false)}
                        nativeID="username"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete={
                          Platform.OS === "android" ? "username" : undefined
                        }
                        textContentType={
                          Platform.OS === "ios" ? "username" : undefined
                        }
                        importantForAutofill="yes"
                        placeholderTextColor={theme.placeholderColor}
                        style={[
                          styles.fieldInput,
                          {
                            color: theme.textColor,
                            paddingLeft: theme.inputPaddingLeft,
                            paddingRight: theme.inputPaddingRight,
                          },
                        ]}
                        keyboardType="default"
                        inputMode="text"
                        returnKeyType="next"
                      />
                    </View>
                  </View>

                  <View>
                    <View
                      style={[
                        styles.fieldShell,
                        { borderColor: theme.fieldBorder },
                        {
                          backgroundColor: theme.fieldBackground,
                          borderRadius: theme.fieldRadius,
                          borderWidth: 1,
                        },
                        passwordFocused && styles.fieldShellFocused,
                        passwordFocused && {
                          borderColor: theme.fieldFocusBorder,
                          backgroundColor: theme.fieldFocusBackground,
                          shadowColor: theme.fieldFocusGlow,
                        },
                        hasPassword && styles.fieldShellFilled,
                        hasPassword && {
                          borderColor: theme.fieldFilledBorder,
                          backgroundColor: theme.fieldFilledBackground,
                        },
                        error && styles.fieldShellError,
                      ]}
                    >
                      <View
                        pointerEvents="none"
                        style={[
                          styles.fieldInnerHighlight,
                          {
                            borderRadius: Math.max(theme.fieldRadius - 2, 8),
                          },
                        ]}
                      />
                      <MaterialCommunityIcons
                        name={theme.lockName}
                        size={18}
                        color={
                          passwordFocused || hasPassword
                            ? theme.iconActive
                            : theme.iconIdle
                        }
                        style={styles.leadingIcon}
                      />
                      <Input
                        placeholder="Lms password"
                        value={password}
                        onChangeText={handlePasswordChange}
                        onFocus={() => setPasswordFocused(true)}
                        onBlur={() => setPasswordFocused(false)}
                        nativeID="password"
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete={
                          Platform.OS === "android" ? "password" : undefined
                        }
                        textContentType={
                          Platform.OS === "ios" ? "password" : undefined
                        }
                        importantForAutofill="yes"
                        placeholderTextColor={theme.placeholderColor}
                        style={[
                          styles.fieldInput,
                          {
                            color: theme.textColor,
                            paddingLeft: theme.inputPaddingLeft,
                            paddingRight: 54,
                          },
                        ]}
                        returnKeyType="go"
                        onSubmitEditing={() => {
                          if (canSubmit) {
                            void handleLogin();
                          }
                        }}
                      />
                      <Pressable
                        onPress={() => setShowPassword((prev) => !prev)}
                        style={[
                          styles.eyeButton,
                          {
                            borderColor: theme.eyeBorder,
                            backgroundColor: theme.eyeBackground,
                          },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={
                          showPassword ? "Hide password" : "Show password"
                        }
                      >
                        <MaterialCommunityIcons
                          name={
                            showPassword ? "eye-off-outline" : "eye-outline"
                          }
                          size={18}
                          color={showPassword ? theme.eyeColor : "#A1A1AA"}
                        />
                      </Pressable>
                    </View>
                  </View>

                  {error ? (
                    <View className="flex-row items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2.5">
                      <MaterialCommunityIcons
                        name="alert-circle-outline"
                        size={16}
                        color="#FCA5A5"
                      />
                      <Text className="flex-1 text-xs leading-5 text-red-200">
                        {error}
                      </Text>
                    </View>
                  ) : null}

                  <Button
                    title="Sign In"
                    onPress={handleLogin}
                    loading={isLoading}
                    disabled={!canSubmit}
                  />

                  <Text className="pt-2 text-center text-[11px] text-zinc-500">
                    Credentials are encrypted and stored locally.
                  </Text>
                </View>
              </View>
            </Animated.View>
          </View>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = {
  absoluteFill: {
    position: "absolute" as const,
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  safeArea: {
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  safeAreaCompact: {
    paddingHorizontal: 18,
    paddingBottom: 20,
  },
  safeAreaLandscape: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  fieldShell: {
    position: "relative",
    overflow: "visible",
    borderWidth: 1,
    backgroundColor: "rgba(15, 15, 18, 0.82)",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.34,
    shadowRadius: 22,
    elevation: 6,
  },
  fieldInnerHighlight: {
    position: "absolute" as const,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    top: 1,
    left: 1,
    right: 1,
    bottom: 1,
  },
  fieldShellFocused: {
    shadowOpacity: 0.32,
    shadowRadius: 20,
    elevation: 6,
  },
  fieldShellFilled: {},
  fieldShellError: {
    borderColor: "rgba(239, 68, 68, 0.84)",
  },
  leadingIcon: {
    position: "absolute",
    left: 14,
    top: 18,
    zIndex: 3,
  },
  fieldInput: {
    backgroundColor: "transparent",
    borderColor: "transparent",
    borderWidth: 0,
    height: 56,
    fontSize: 16,
  },
  eyeButton: {
    position: "absolute",
    right: 12,
    top: 12,
    height: 32,
    width: 32,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 54,
    lineHeight: 56,
  },
  titleCompact: {
    fontSize: 46,
    lineHeight: 50,
  },
  titleLandscape: {
    fontSize: 48,
    lineHeight: 50,
  },
  subtitle: {
    maxWidth: 340,
    fontSize: 16,
    lineHeight: 32,
  },
  subtitleCompact: {
    fontSize: 14,
    lineHeight: 26,
  },
  subtitleLandscape: {
    maxWidth: 420,
  },
  contentShell: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    gap: 30,
  },
  contentShellCompact: {
    gap: 24,
  },
  contentShellLandscape: {
    maxWidth: 980,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 20,
  },
  heroBlock: {
    width: "100%",
  },
  heroBlockLandscape: {
    width: "44%",
    paddingTop: 8,
  },
  cardBlock: {
    width: "100%",
  },
  cardBlockLandscape: {
    width: "56%",
  },
  formCard: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 8,
    borderRadius: 36,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 28,
  },
  scrollContentCompact: {
    justifyContent: "flex-start",
    paddingTop: 18,
    paddingBottom: 16,
  },
  scrollContentLandscape: {
    justifyContent: "center",
    paddingVertical: 12,
  },
} as const;
