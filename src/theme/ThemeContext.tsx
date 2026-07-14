import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';

export type ThemeType = 'light' | 'dark';

export interface ThemeColors {
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  activeTint: string;
  inactiveTint: string;
  statusRunning: string;
  statusStopped: string;
  sheetHandle: string;
  inputBg: string;
  inputText: string;
  inputBorder: string;
  statsBg: string;
  statValue: string;
}

export const lightColors: ThemeColors = {
  background: '#f2f2f7',
  card: '#ffffff',
  text: '#000000',
  textSecondary: '#636366',
  border: '#e5e5ea',
  activeTint: '#007aff',
  inactiveTint: '#8e8e93',
  statusRunning: '#34c759',
  statusStopped: '#ff3b30',
  sheetHandle: '#d1d1d6',
  inputBg: '#ffffff',
  inputText: '#000000',
  inputBorder: '#c7c7cc',
  statsBg: '#e5e5ea',
  statValue: '#007aff',
};

export const darkColors: ThemeColors = {
  background: '#000000',
  card: '#0a0a0a',
  text: '#ffffff',
  textSecondary: '#888888',
  border: '#1a1a1a',
  activeTint: '#ffffff',
  inactiveTint: '#555555',
  statusRunning: '#44bb44',
  statusStopped: '#ff4444',
  sheetHandle: '#2c2c2e',
  inputBg: '#0a0a0a',
  inputText: '#ffffff',
  inputBorder: '#1a1a1a',
  statsBg: '#1a1a1a',
  statValue: '#ffffff',
};

interface ThemeContextType {
  theme: ThemeType;
  colors: ThemeColors;
  toggleTheme: () => void;
  setTheme: (theme: ThemeType) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  colors: darkColors,
  toggleTheme: () => {},
  setTheme: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeType>('dark');

  useEffect(() => {
    // Load persisted theme on mount
    SecureStore.getItemAsync('app_theme').then((savedTheme) => {
      if (savedTheme === 'light' || savedTheme === 'dark') {
        setThemeState(savedTheme);
      }
    });
  }, []);

  const setTheme = async (newTheme: ThemeType) => {
    setThemeState(newTheme);
    await SecureStore.setItemAsync('app_theme', newTheme);
  };

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const colors = theme === 'light' ? lightColors : darkColors;

  return (
    <ThemeContext.Provider value={{ theme, colors, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
