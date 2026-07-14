import React, { useEffect } from 'react';
import { StyleSheet, Text, View, Image } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withTiming, 
  withRepeat, 
  Easing, 
  withDelay, 
  withSpring,
  withSequence
} from 'react-native-reanimated';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  onAnimationComplete: () => void;
}

export default function AnimatedSplashScreen({ onAnimationComplete }: Props) {
  const { colors } = useTheme();

  // Animation values
  const logoScale = useSharedValue(0.3);
  const logoOpacity = useSharedValue(0);
  
  // Ripple/Sonar animations
  const ripple1Scale = useSharedValue(0.6);
  const ripple1Opacity = useSharedValue(0);
  const ripple2Scale = useSharedValue(0.6);
  const ripple2Opacity = useSharedValue(0);

  const textOpacity = useSharedValue(0);
  const textTranslateY = useSharedValue(15);

  useEffect(() => {
    // 1. Snappy bounce scale-in for the central logo
    logoScale.value = withSpring(1, { damping: 10, stiffness: 90 }, (finished) => {
      if (finished) {
        // Soft loop breathing/pulsing animation once settled
        logoScale.value = withRepeat(
          withTiming(1.03, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
          -1,
          true
        );
      }
    });
    logoOpacity.value = withTiming(1, { duration: 500 });

    // 2. Ripple 1 (Sonar wave) loops continuously
    ripple1Scale.value = withRepeat(
      withTiming(2.4, { duration: 2000, easing: Easing.out(Easing.ease) }),
      -1,
      false
    );
    ripple1Opacity.value = withRepeat(
      withSequence(
        withTiming(0.4, { duration: 400 }),
        withTiming(0, { duration: 1600 })
      ),
      -1,
      false
    );

    // 3. Ripple 2 (delayed Sonar wave) loops continuously
    ripple2Scale.value = withDelay(
      800,
      withRepeat(
        withTiming(2.4, { duration: 2000, easing: Easing.out(Easing.ease) }),
        -1,
        false
      )
    );
    ripple2Opacity.value = withDelay(
      800,
      withRepeat(
        withSequence(
          withTiming(0.4, { duration: 400 }),
          withTiming(0, { duration: 1600 })
        ),
        -1,
        false
      )
    );

    // 4. Slide-in typography details
    textOpacity.value = withDelay(600, withTiming(1, { duration: 600 }));
    textTranslateY.value = withDelay(600, withSpring(0, { damping: 15, stiffness: 120 }));

    // 5. Trigger transition callback after 2.4 seconds
    const timer = setTimeout(() => {
      onAnimationComplete();
    }, 2400);

    return () => clearTimeout(timer);
  }, []);

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: logoScale.value }],
    opacity: logoOpacity.value,
  }));

  const ripple1Style = useAnimatedStyle(() => ({
    transform: [{ scale: ripple1Scale.value }],
    opacity: ripple1Opacity.value,
  }));

  const ripple2Style = useAnimatedStyle(() => ({
    transform: [{ scale: ripple2Scale.value }],
    opacity: ripple2Opacity.value,
  }));

  const textAnimatedStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textTranslateY.value }]
  }));

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.logoContainer}>
        {/* Glowing Sonar Ripple waves */}
        <Animated.View style={[styles.ripple, { borderColor: colors.activeTint }, ripple1Style]} />
        <Animated.View style={[styles.ripple, { borderColor: colors.activeTint }, ripple2Style]} />

        {/* Central Logo Container wrapping generated image */}
        <Animated.View style={[styles.logoCard, logoAnimatedStyle]}>
          <Image 
            source={require('../../assets/logo.jpg')} 
            style={styles.logoImage} 
            resizeMode="cover"
          />
        </Animated.View>
      </View>
      
      <Animated.View style={[styles.textWrapper, textAnimatedStyle]}>
        <Text style={[styles.title, { color: colors.text }]}>DOKPLOY</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Companion Manager</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    width: 140,
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  logoCard: {
    width: 90,
    height: 90,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#111111',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    // iOS shadow for logo depth
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  ripple: {
    position: 'absolute',
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    zIndex: -1,
  },
  textWrapper: {
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 6,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    marginTop: 6,
  }
});
