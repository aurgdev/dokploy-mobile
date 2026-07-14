import React from 'react';
import { Tabs } from 'expo-router';
import { useTheme } from '../../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

export default function TabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 84,
          paddingBottom: 24,
          paddingTop: 10,
        },
        tabBarActiveTintColor: colors.activeTint,
        tabBarInactiveTintColor: colors.inactiveTint,
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
          letterSpacing: -0.2
        },
      }}
    >
      <Tabs.Screen 
        name="index" 
        options={{ 
          title: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "grid" : "grid-outline"} size={22} color={color} />
          ),
        }} 
      />
      <Tabs.Screen 
        name="deployments" 
        options={{ 
          title: 'Containers',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "cube" : "cube-outline"} size={22} color={color} />
          ),
        }} 
      />
      <Tabs.Screen 
        name="server" 
        options={{ 
          title: 'Server',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "hardware-chip" : "hardware-chip-outline"} size={22} color={color} />
          ),
        }} 
      />
      <Tabs.Screen 
        name="settings" 
        options={{ 
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "settings" : "settings-outline"} size={22} color={color} />
          ),
        }} 
      />
    </Tabs>
  );
}
