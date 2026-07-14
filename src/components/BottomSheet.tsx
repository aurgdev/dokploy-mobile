import React, { forwardRef, useImperativeHandle } from "react";
import { StyleSheet, View, useWindowDimensions, Pressable } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { useTheme } from "../theme/ThemeContext";

interface BottomSheetProps {
  children: React.ReactNode;
  onClose?: () => void;
}

export interface BottomSheetRef {
  open: () => void;
  close: () => void;
}

const BottomSheet = forwardRef<BottomSheetRef, BottomSheetProps>(
  ({ children, onClose }, ref) => {
    const { height } = useWindowDimensions();
    const targetOpenY = height * 0.15; // Snaps to 85% of screen height
    const translateY = useSharedValue(height);
    const { colors } = useTheme();

    const open = () => {
      translateY.value = withSpring(targetOpenY, {
        damping: 18,
        stiffness: 140,
        mass: 0.9,
      });
    };

    const close = () => {
      translateY.value = withSpring(
        height,
        {
          damping: 20,
          stiffness: 150,
        },
        (finished) => {
          if (finished && onClose) {
            runOnJS(onClose)();
          }
        },
      );
    };

    useImperativeHandle(ref, () => ({ open, close }));

    const gesture = Gesture.Pan()
      .onUpdate((event) => {
        // Physics: Apply rubber-banding when dragging above the target top boundary
        if (event.translationY < 0) {
          translateY.value = targetOpenY + event.translationY * 0.35; // resistive scaling
        } else {
          translateY.value = targetOpenY + event.translationY;
        }
      })
      .onEnd((event) => {
        // Dismiss if pulled down significantly (> 150px) or flicked downwards with speed
        if (event.translationY > 150 || event.velocityY > 600) {
          runOnJS(close)();
        } else {
          // Snap back to open position with velocity handoff
          translateY.value = withSpring(targetOpenY, {
            damping: 18,
            stiffness: 140,
            velocity: event.velocityY,
          });
        }
      });

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: translateY.value }],
    }));

    // Fade-in backing scrim based on sheet position
    const scrimStyle = useAnimatedStyle(() => {
      const opacity = interpolate(
        translateY.value,
        [height, targetOpenY],
        [0, 0.65],
        Extrapolation.CLAMP,
      );
      return {
        opacity,
        pointerEvents: translateY.value > height - 50 ? "none" : "auto",
      };
    });

    return (
      <>
        {/* Background Dimming Scrim */}
        <Animated.View style={[styles.scrim, scrimStyle]}>
          <Pressable style={styles.scrimPressable} onPress={close} />
        </Animated.View>

        {/* Main Gestural Sheet */}
        <Animated.View style={[
          styles.sheet, 
          animatedStyle, 
          { 
            backgroundColor: colors.card, 
            borderColor: colors.border 
          }
        ]}>
          <GestureDetector gesture={gesture}>
            <View style={styles.handleContainer}>
              <View style={[styles.handle, { backgroundColor: colors.sheetHandle }]} />
            </View>
          </GestureDetector>
          <View style={styles.contentContainer}>{children}</View>
        </Animated.View>
      </>
    );
  },
);

const styles = StyleSheet.create({
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000000",
    zIndex: 99,
  },
  scrimPressable: {
    flex: 1,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    top: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    zIndex: 100,
    elevation: 24,
  },
  handleContainer: {
    width: "100%",
    height: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  handle: {
    width: 36,
    height: 4.5,
    borderRadius: 3,
  },
  contentContainer: {
    flex: 1,
    paddingHorizontal: 24,
  },
});

export default BottomSheet;
