// @ts-check
import {
  Canvas,
  Fill,
  Shader,
  Skia,
  type SkRuntimeEffect,
} from "@shopify/react-native-skia";
import React, { memo, useEffect, useMemo } from "react";
import { useWindowDimensions } from "react-native";
import {
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  type FrameInfo,
} from "react-native-reanimated";
import { GRAINY_GRADIENT_SHADER } from "./conf";
import { hexToRgba } from "./helper";
import type { IGrainyGradient } from "./types";

const GrainyGradient: React.FC<IGrainyGradient> = ({
  width: paramsWidth,
  height: paramsHeight,
  colors = ["#5b0bb5", "#7c3aed", "#fb923c", "#db2777"],
  speed = 2.9,
  animated = true,
  intensity = 0.112,
  size = 1.9,
  enabled = true,
  amplitude = 0.1,
  brightness = 0,
  style,
  resolutionScale = 0.5,
  settleMs = 3000,
}: IGrainyGradient) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const width = paramsWidth ?? screenWidth;
  const height = paramsHeight ?? screenHeight;

  // reduced pixel count for shader computation
  const scale = Math.max(0.1, Math.min(1, resolutionScale));
  const renderWidth = Math.round(width * scale);
  const renderHeight = Math.round(height * scale);

  const shader = useMemo<SkRuntimeEffect | null>(
    () => Skia.RuntimeEffect.Make(GRAINY_GRADIENT_SHADER),
    [],
  );
  const progress = useSharedValue<number>(0);
  const settled = useSharedValue<number>(0);

  // auto-stop animation after settleMs
  useEffect(() => {
    if (!animated || settleMs <= 0) return;
    const timer = setTimeout(() => {
      settled.value = 1;
    }, settleMs);
    return () => clearTimeout(timer);
  }, [animated, settleMs, settled]);

  useFrameCallback((info: FrameInfo) => {
    if (animated && settled.value === 0 && info.timeSincePreviousFrame) {
      progress.value += (info.timeSincePreviousFrame / 1000) * speed;
    }
  }, animated);

  const parsedColors = useMemo(() => {
    const result: [number, number, number, number][] = [];
    for (let i = 0; i < 5; i++) {
      result.push(i < colors.length ? hexToRgba(colors[i]!) : [0, 0, 0, 1]);
    }
    return result;
  }, [colors]);

  const uniforms = useDerivedValue(() => ({
    iResolution: [renderWidth, renderHeight],
    iTime: progress.value,
    uColor0: parsedColors[0],
    uColor1: parsedColors[1],
    uColor2: parsedColors[2],
    uColor3: parsedColors[3],
    uColor4: parsedColors[4],
    uColorCount: Math.min(colors.length, 5),
    uAmplitude: amplitude,
    uGrainIntensity: intensity,
    uGrainSize: size,
    uGrainEnabled: enabled ? 1 : 0,
    uBrightness: brightness,
  }));

  if (!shader) return null;

  return (
    <Canvas style={[{ width, height }, style]}>
      <Fill>
        <Shader source={shader} uniforms={uniforms} />
      </Fill>
    </Canvas>
  );
};

export default memo(GrainyGradient);
