import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { ThemeProvider, useTheme } from '../src/theme/ThemeContext';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { QueryClientProvider } from '@tanstack/react-query';
import AnimatedSplashScreen from '../src/components/AnimatedSplashScreen';
import { migrateLegacyCredentials } from '../src/services/profileMigration';
import { queryClient } from '../src/services/queries';

export default function RootLayout() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hasCredentials, setHasCredentials] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  const authenticate = async () => {
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHardware && isEnrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock Dokploy Mobile',
          fallbackLabel: 'Use Device Passcode',
          disableDeviceFallback: false,
        });
        if (result.success) {
          setIsAuthenticated(true);
          router.replace('/(tabs)');
        }
      } else {
        // No biometrics available, bypass
        setIsAuthenticated(true);
        router.replace('/(tabs)');
      }
    } catch {
      // Fallback
      setIsAuthenticated(true);
      router.replace('/(tabs)');
    }
  };

  useEffect(() => {
    // Wait until the splash screen is fully unmounted and the Stack mounts
    if (showSplash) return;

    async function checkCredentials() {
      try {
        await migrateLegacyCredentials();
        const profileStr = await SecureStore.getItemAsync('dokploy_profile');

        const useBiometrics = await SecureStore.getItemAsync('use_biometrics');
        
        // Enabled by default unless explicitly turned off
        const isBiometricsEnabled = useBiometrics !== 'false';

        if (profileStr) {
          setHasCredentials(true);
          if (isBiometricsEnabled) {
            await authenticate();
          } else {
            setIsAuthenticated(true);
            router.replace('/(tabs)');
          }
        } else {
          setIsAuthenticated(true);
          router.replace('/setup');
        }
      } catch (error) {
        setIsAuthenticated(true);
        router.replace('/setup');
      } finally {
        setChecking(false);
      }
    }
    checkCredentials();
  }, [showSplash]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RootLayoutContent 
          checking={checking} 
          isAuthenticated={isAuthenticated} 
          hasCredentials={hasCredentials} 
          authenticate={authenticate} 
          showSplash={showSplash}
          onSplashComplete={() => setShowSplash(false)}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

interface RootLayoutContentProps {
  checking: boolean;
  isAuthenticated: boolean;
  hasCredentials: boolean;
  authenticate: () => Promise<void>;
  showSplash: boolean;
  onSplashComplete: () => void;
}

function RootLayoutContent({ 
  checking, 
  isAuthenticated, 
  hasCredentials, 
  authenticate,
  showSplash,
  onSplashComplete
}: RootLayoutContentProps) {
  const { theme, colors } = useTheme();

  if (showSplash) {
    return <AnimatedSplashScreen onAnimationComplete={onSplashComplete} />;
  }

  if (checking) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  // Locked state screen
  if (hasCredentials && !isAuthenticated) {
    return (
      <View style={{ 
        flex: 1, 
        backgroundColor: colors.background, 
        justifyContent: 'center', 
        alignItems: 'center', 
        padding: 32 
      }}>
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
        <Ionicons name="lock-closed" size={64} color={colors.activeTint} style={{ marginBottom: 20 }} />
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginBottom: 8 }}>App Locked</Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 32, lineHeight: 20 }}>
          Biometric authentication is required to access your Dokploy companion dashboard.
        </Text>
        <TouchableOpacity 
          style={{ 
            height: 52, 
            paddingHorizontal: 32, 
            backgroundColor: colors.activeTint, 
            borderRadius: 10, 
            justifyContent: 'center', 
            alignItems: 'center' 
          }}
          onPress={authenticate}
        >
          <Text style={{ color: theme === 'dark' ? '#000000' : '#ffffff', fontWeight: '700', fontSize: 16 }}>Unlock App</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.background }}>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ 
        headerShown: false, 
        contentStyle: { backgroundColor: colors.background }
      }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="setup" />
        <Stack.Screen name="projects/index" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="project/[id]" />
        <Stack.Screen name="application/[id]" />
        <Stack.Screen name="database/[id]" />
        <Stack.Screen name="backups/database/[id]" />
        <Stack.Screen name="domains/[id]" />
        <Stack.Screen name="compose/[id]" />
      </Stack>
    </GestureHandlerRootView>
  );
}
