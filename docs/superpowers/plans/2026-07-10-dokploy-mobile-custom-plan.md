# Custom Dokploy Mobile Companion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a custom React Native (Expo) mobile client to monitor and manage a single Dokploy VPS using Apple-style fluid UI gestures.

**Architecture:** A tab-based navigation app utilizing `expo-router`. Connects to Dokploy REST endpoints using standard `fetch` with API credentials stored securely via `expo-secure-store`. Leverages custom gestures via `react-native-gesture-handler` and spring physics via `react-native-reanimated` for the bottom sheet.

**Tech Stack:** Expo SDK 55, expo-router, react-native-reanimated, react-native-gesture-handler, expo-secure-store, expo-haptics.

## Global Constraints
* Target Platform: Android
* Easing Curves: Critically damped spring (`damping: 1.0`, `response: 0.35` equivalent) for general UI transitions
* Haptics: Trigger on button-down, success confirmation, and action errors
* No native layout libraries (use React Native standard `StyleSheet`)

---

### Task 1: Scaffolding & Dependency Setup

**Files:**
* Modify: `package.json`
* Modify: `app.json`

**Interfaces:**
* Produces: Clean Expo project structure ready for React Native Reanimated and SecureStore.

- [ ] **Step 1: Initialize a clean Expo project**
  Create project in current directory:
  Run: `npx -y create-expo-app@latest ./ --template blank-typescript`
  *(Note: Since we are running in an empty directory, this will scaffold the TS template directly here).*

- [ ] **Step 2: Install required native packages**
  Run: `npx expo install react-native-reanimated react-native-gesture-handler expo-secure-store expo-haptics expo-router react-native-safe-area-context react-native-screens`

- [ ] **Step 3: Update app.json to configure expo-router**
  Modify `app.json` to configure the router entry point:
  ```json
  {
    "expo": {
      "name": "dokploy-mobile",
      "slug": "dokploy-mobile",
      "scheme": "dokploymobile",
      "web": {
        "bundler": "metro"
      },
      "plugins": [
        "expo-router"
      ]
    }
  }
  ```

---

### Task 2: File-Based Navigation & Setup Screen

**Files:**
* Create: `app/_layout.tsx`
* Create: `app/(tabs)/_layout.tsx`
* Create: `app/(tabs)/index.tsx`
* Create: `app/(tabs)/deployments.tsx`
* Create: `app/(tabs)/settings.tsx`
* Create: `app/setup.tsx`

**Interfaces:**
* Consumes: Navigation configuration from Task 1.
* Produces: Basic tab screens and screen switching based on credential existence.

- [ ] **Step 1: Create main root layout `app/_layout.tsx`**
  This handles the initial check for secure store keys and redirects to `/setup` if missing.
  ```typescript
  import { Stack } from 'expo-router';
  import { GestureHandlerRootView } from 'react-native-gesture-handler';

  export default function RootLayout() {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="setup" options={{ presentation: 'modal' }} />
        </Stack>
      </GestureHandlerRootView>
    );
  }
  ```

- [ ] **Step 2: Create Setup Screen `app/setup.tsx`**
  Standard layout with inputs for server URL and API Key. Saves credentials via SecureStore on success.
  ```typescript
  import React, { useState } from 'react';
  import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
  import * as SecureStore from 'expo-secure-store';
  import { useRouter } from 'expo-router';
  import * as Haptics from 'expo-haptics';

  export default function SetupScreen() {
    const [url, setUrl] = useState('');
    const [key, setKey] = useState('');
    const router = useRouter();

    const handleSave = async () => {
      if (!url || !key) return;
      await SecureStore.setItemAsync('dokploy_vps_url', url);
      await SecureStore.setItemAsync('dokploy_api_key', key);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    };

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Configure VPS Connection</Text>
        <TextInput style={styles.input} placeholder="https://dokploy.example.com" value={url} onChangeText={setUrl} autoCapitalize="none"/>
        <TextInput style={styles.input} placeholder="API Key" value={key} onChangeText={setKey} secureTextEntry autoCapitalize="none"/>
        <TouchableOpacity style={styles.button} onPress={handleSave}>
          <Text style={styles.buttonText}>Connect</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#000' },
    title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 24, textAlign: 'center' },
    input: { height: 50, borderWidth: 1, borderColor: '#333', backgroundColor: '#111', borderRadius: 8, color: '#fff', paddingHorizontal: 16, marginBottom: 16 },
    button: { height: 50, backgroundColor: '#fff', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginTop: 12 },
    buttonText: { color: '#000', fontWeight: 'bold', fontSize: 16 }
  });
  ```

- [ ] **Step 3: Create Tabs Layout `app/(tabs)/_layout.tsx`**
  Displays bottom tabs for Dashboard, Deployments, and Settings.
  ```typescript
  import { Tabs } from 'expo-router';

  export default function TabsLayout() {
    return (
      <Tabs screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: '#111', borderTopColor: '#222', height: 60 },
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: '#666',
      }}>
        <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
        <Tabs.Screen name="deployments" options={{ title: 'Deployments' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      </Tabs>
    );
  }
  ```

---

### Task 3: API Client & Settings Management

**Files:**
* Create: `src/services/api.ts`
* Modify: `app/(tabs)/settings.tsx`

**Interfaces:**
* Consumes: Secure storage credentials saved in Task 2.
* Produces: `DokployClient` function mapper and settings page functionality.

- [ ] **Step 1: Create `src/services/api.ts`**
  ```typescript
  import * as SecureStore from 'expo-secure-store';

  export interface Project {
    id: string;
    name: string;
    description?: string;
    applications: Array<{ id: string; name: string; status: string }>;
    databases: Array<{ id: string; name: string; status: string; type: string }>;
  }

  export async function getClientConfig() {
    const url = await SecureStore.getItemAsync('dokploy_vps_url');
    const apiKey = await SecureStore.getItemAsync('dokploy_api_key');
    return { url, apiKey };
  }

  export async function dokployFetch(endpoint: string, options: RequestInit = {}) {
    const { url, apiKey } = await getClientConfig();
    if (!url || !apiKey) throw new Error('Missing configuration credentials');

    const cleanUrl = url.endsWith('/') ? url.slice(0, -1) : url;
    const response = await fetch(`${cleanUrl}/api${endpoint}`, {
      ...options,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        ...options.headers,
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP error ${response.status}`);
    }
    return response.json();
  }

  export const api = {
    getProjects: (): Promise<Project[]> => dokployFetch('/project.all'),
    startApp: (id: string) => dokployFetch('/application.start', { method: 'POST', body: JSON.stringify({ applicationId: id }) }),
    stopApp: (id: string) => dokployFetch('/application.stop', { method: 'POST', body: JSON.stringify({ applicationId: id }) }),
    restartApp: (id: string) => dokployFetch('/application.restart', { method: 'POST', body: JSON.stringify({ applicationId: id }) }),
    deployApp: (id: string) => dokployFetch('/application.deploy', { method: 'POST', body: JSON.stringify({ applicationId: id }) }),
    getLogs: (id: string): Promise<{ logs: string }> => dokployFetch(`/application.logs?applicationId=${id}`)
  };
  ```

- [ ] **Step 2: Update Settings Page `app/(tabs)/settings.tsx`**
  ```typescript
  import React, { useEffect, useState } from 'react';
  import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
  import * as SecureStore from 'expo-secure-store';
  import { useRouter } from 'expo-router';
  import * as Haptics from 'expo-haptics';

  export default function SettingsScreen() {
    const [url, setUrl] = useState('');
    const router = useRouter();

    useEffect(() => {
      SecureStore.getItemAsync('dokploy_vps_url').then(v => setUrl(v || ''));
    }, []);

    const handleLogout = async () => {
      await SecureStore.deleteItemAsync('dokploy_vps_url');
      await SecureStore.deleteItemAsync('dokploy_api_key');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      router.replace('/setup');
    };

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Connected To:</Text>
          <Text style={styles.value}>{url || 'Not Connected'}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Disconnect Server</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000', padding: 24, paddingTop: 60 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 24 },
    card: { backgroundColor: '#111', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#222', marginBottom: 24 },
    label: { color: '#666', fontSize: 14, marginBottom: 4 },
    value: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    logoutButton: { height: 50, backgroundColor: '#ff4444', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
    logoutText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
  });
  ```

---

### Task 4: Custom Physical Bottom Sheet Component

**Files:**
* Create: `src/components/BottomSheet.tsx`

**Interfaces:**
* Consumes: Gesture events, animated spring hooks.
* Produces: A draggable, spring-snapping bottom sheet component matching Apple design guidelines.

- [ ] **Step 1: Implement `src/components/BottomSheet.tsx`**
  This leverages Reanimated's gesture handler to support swiping, spring physics snapping, and rubber-banding.
  ```typescript
  import React, { forwardRef, useImperativeHandle } from 'react';
  import { StyleSheet, View, useWindowDimensions } from 'react-native';
  import { Gesture, GestureDetector } from 'react-native-gesture-handler';
  import Animated, { useAnimatedStyle, useSharedValue, withSpring, runOnJS } from 'react-native-reanimated';

  interface BottomSheetProps {
    children: React.ReactNode;
    onClose?: () => void;
  }

  export interface BottomSheetRef {
    open: () => void;
    close: () => void;
  }

  const BottomSheet = forwardRef<BottomSheetRef, BottomSheetProps>(({ children, onClose }, ref) => {
    const { height } = useWindowDimensions();
    const translateY = useSharedValue(height);

    const open = () => {
      translateY.value = withSpring(height * 0.2, { damping: 15, stiffness: 100 });
    };

    const close = () => {
      translateY.value = withSpring(height, { damping: 15, stiffness: 100 }, (finished) => {
        if (finished && onClose) runOnJS(onClose)();
      });
    };

    useImperativeHandle(ref, () => ({ open, close }));

    const gesture = Gesture.Pan()
      .onUpdate((event) => {
        // Apply simple rubber-banding if dragging past limit (height * 0.2)
        if (event.translationY < 0) {
          translateY.value = (height * 0.2) + (event.translationY * 0.3);
        } else {
          translateY.value = (height * 0.2) + event.translationY;
        }
      })
      .onEnd((event) => {
        // If dragged down past a threshold or fast velocity flick down
        if (event.translationY > 150 || event.velocityY > 500) {
          runOnJS(close)();
        } else {
          runOnJS(open)();
        }
      });

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: translateY.value }]
    }));

    return (
      <GestureDetector gesture={gesture}>
        <Animated.View style={[styles.sheet, animatedStyle]}>
          <View style={styles.handle} />
          {children}
        </Animated.View>
      </GestureDetector>
    );
  });

  const styles = StyleSheet.create({
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      top: 0,
      backgroundColor: 'rgba(20, 20, 20, 0.95)',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      borderWidth: 1,
      borderColor: '#333',
      paddingHorizontal: 24,
      paddingTop: 12,
    },
    handle: {
      width: 40,
      height: 5,
      backgroundColor: '#555',
      borderRadius: 3,
      alignSelf: 'center',
      marginBottom: 16
    }
  });

  export default BottomSheet;
  ```

---

### Task 5: Dashboard Screen UI & App Control Integration

**Files:**
* Modify: `app/(tabs)/index.tsx`

**Interfaces:**
* Consumes: `api` client from Task 3, `BottomSheet` from Task 4.
* Produces: A completed dashboard with resource displays, project lists, and full app controls.

- [ ] **Step 1: Implement Dashboard UI inside `app/(tabs)/index.tsx`**
  Includes polling for project status, server stats gauge mockups, and launching the action detail sheets.
  ```typescript
  import React, { useEffect, useRef, useState } from 'react';
  import { ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
  import { api, Project } from '../../src/services/api';
  import BottomSheet, { BottomSheetRef } from '../../src/components/BottomSheet';
  import * as Haptics from 'expo-haptics';

  export default function DashboardScreen() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedApp, setSelectedApp] = useState<{ id: string; name: string; type: 'app' | 'db' } | null>(null);
    const [actionLoading, setActionLoading] = useState(false);
    const sheetRef = useRef<BottomSheetRef>(null);

    const loadData = () => {
      api.getProjects()
        .then(data => { setProjects(data); setLoading(false); })
        .catch(() => setLoading(false));
    };

    useEffect(() => {
      loadData();
      const interval = setInterval(loadData, 5000);
      return () => clearInterval(interval);
    }, []);

    const handleSelect = (id: string, name: string, type: 'app' | 'db') => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setSelectedApp({ id, name, type });
      sheetRef.current?.open();
    };

    const runAction = async (action: 'start' | 'stop' | 'restart' | 'deploy') => {
      if (!selectedApp) return;
      setActionLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      try {
        if (action === 'start') await api.startApp(selectedApp.id);
        if (action === 'stop') await api.stopApp(selectedApp.id);
        if (action === 'restart') await api.restartApp(selectedApp.id);
        if (action === 'deploy') await api.deployApp(selectedApp.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        loadData();
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setActionLoading(false);
      }
    };

    if (loading) {
      return <View style={styles.center}><ActivityIndicator size="large" color="#fff" /></View>;
    }

    return (
      <View style={styles.container}>
        <ScrollView style={styles.scroll}>
          <Text style={styles.title}>Dashboard</Text>

          {/* VPS health card mockup */}
          <View style={styles.statsCard}>
            <Text style={styles.cardTitle}>VPS Stats</Text>
            <View style={styles.statsRow}>
              <View><Text style={styles.statLabel}>CPU</Text><Text style={styles.statValue}>14%</Text></View>
              <View><Text style={styles.statLabel}>RAM</Text><Text style={styles.statValue}>3.2 / 8 GB</Text></View>
              <View><Text style={styles.statLabel}>Disk</Text><Text style={styles.statValue}>45%</Text></View>
            </View>
          </View>

          <Text style={styles.subtitle}>Projects</Text>
          {projects.map(proj => (
            <View key={proj.id} style={styles.projectBlock}>
              <Text style={styles.projectName}>{proj.name}</Text>
              {proj.applications.map(app => (
                <TouchableOpacity key={app.id} style={styles.appCard} onPress={() => handleSelect(app.id, app.name, 'app')}>
                  <Text style={styles.appName}>{app.name}</Text>
                  <View style={[styles.statusDot, { backgroundColor: app.status === 'running' ? '#4caf50' : '#f44336' }]} />
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>

        <BottomSheet ref={sheetRef} onClose={() => setSelectedApp(null)}>
          {selectedApp && (
            <View style={styles.sheetContent}>
              <Text style={styles.sheetTitle}>{selectedApp.name}</Text>
              {actionLoading ? <ActivityIndicator size="small" color="#fff" style={{ marginVertical: 20 }} /> : (
                <View style={styles.btnGrid}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => runAction('start')}><Text style={styles.btnText}>Start</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => runAction('stop')}><Text style={styles.btnText}>Stop</Text></TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => runAction('restart')}><Text style={styles.btnText}>Restart</Text></TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.deployBtn]} onPress={() => runAction('deploy')}><Text style={styles.btnText}>Deploy</Text></TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </BottomSheet>
      </View>
    );
  }

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    center: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
    scroll: { padding: 24, paddingTop: 60 },
    title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 20 },
    subtitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginVertical: 12 },
    statsCard: { backgroundColor: '#111', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#222', marginBottom: 20 },
    cardTitle: { color: '#666', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 12 },
    statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
    statLabel: { color: '#888', fontSize: 12, marginBottom: 2 },
    statValue: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    projectBlock: { marginBottom: 20 },
    projectName: { color: '#888', fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
    appCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111', padding: 16, borderRadius: 8, borderWidth: 1, borderColor: '#222', marginBottom: 8 },
    appName: { color: '#fff', fontSize: 15, fontWeight: '500' },
    statusDot: { width: 10, height: 10, borderRadius: 5 },
    sheetContent: { paddingVertical: 10 },
    sheetTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
    btnGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    actionBtn: { width: '48%', height: 50, backgroundColor: '#222', borderHeight: 1, borderColor: '#333', borderRadius: 8, justifyContent: 'center', alignItems: 'center', marginBottom: 16 },
    deployBtn: { backgroundColor: '#fff' },
    btnText: { color: '#fff', fontWeight: 'bold' }
  });
  ```
