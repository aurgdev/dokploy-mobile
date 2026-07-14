import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../src/theme/ThemeContext';

export default function SetupScreen() {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bypassHttpWarning, setBypassHttpWarning] = useState(false);
  const router = useRouter();
  const { colors, theme } = useTheme();

  const handleSave = async () => {
    if (!url || !key) {
      setError('Please fill in all fields');
      return;
    }

    setError('');
    
    let cleanUrl = url.trim();
    while (cleanUrl.endsWith('/')) {
      cleanUrl = cleanUrl.slice(0, -1);
    }
    if (cleanUrl.endsWith('/api')) {
      cleanUrl = cleanUrl.slice(0, -4);
    }

    if (!/^https?:\/\//i.test(cleanUrl)) {
      setError('Invalid protocol: Address must start with http:// or https://');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    const hostname = cleanUrl.replace(/^https?:\/\//i, '').split(':')[0].split('/')[0];
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isPrivateIp = 
      /^(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)$/.test(hostname);

    if (/^http:\/\//i.test(cleanUrl)) {
      if (!isLocalhost && !isPrivateIp) {
        setError('Plain HTTP is blocked for remote hosts. HTTPS is required.');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        return;
      }
      if (!bypassHttpWarning) {
        setError('Warning: Using plain HTTP on local subnets can expose API keys. Tap Connect again to bypass.');
        setBypassHttpWarning(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
    }

    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      // Validate credentials by calling projects endpoint (read-only)
      const response = await fetch(`${cleanUrl}/api/project.all`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'x-api-key': key,
        },
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          throw { type: 'AUTH_FAILED', message: 'Invalid API Key' };
        }
        if (response.status === 403) {
          throw { type: 'AUTH_FAILED', message: 'Permission Limited: Insufficient permissions to access this Dokploy instance' };
        }
        throw { type: 'INVALID_RESPONSE', message: `Server returned an invalid response status: ${response.status}` };
      }

      // Check if it's a valid Dokploy response
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw { type: 'INVALID_RESPONSE', message: 'Server did not return a valid Dokploy JSON response' };
      }

      // Generate a new UUID for the connection profile
      const profileId = Crypto.randomUUID();
      const profile = {
        profileId,
        serverUrl: cleanUrl,
        apiKey: key,
        createdAt: new Date().toISOString()
      };

      // Save connection profile in SecureStore
      await SecureStore.setItemAsync('dokploy_profile', JSON.stringify(profile));
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (err: any) {
      clearTimeout(timeoutId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      
      if (err.type) {
        setError(err.message);
      } else if (err.name === 'AbortError') {
        setError('Request timed out. Please check if your VPS is running and port is open.');
      } else {
        const errMsg = err.message || '';
        if (errMsg.includes('ssl') || errMsg.includes('certificate') || errMsg.includes('handshake')) {
          setError('SSL/TLS handshake failed. Please verify your SSL certificate setup.');
        } else {
          setError('Server unreachable. Please verify server URL, network status, and firewalls.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>Dokploy Mobile</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Enter your VPS credentials to connect</Text>

      {error ? (
        <Text style={[
          styles.errorText, 
          { color: error.startsWith('Warning') ? '#ffb703' : '#ff4444' }
        ]}>
          {error}
        </Text>
      ) : null}

      <TextInput
        style={[styles.input, { 
          backgroundColor: colors.inputBg, 
          color: colors.inputText, 
          borderColor: colors.inputBorder 
        }]}
        placeholder="VPS Address (e.g. https://vps.example.com)"
        placeholderTextColor={theme === 'dark' ? '#555555' : '#aaaaaa'}
        value={url}
        onChangeText={(val) => {
          setUrl(val);
          setBypassHttpWarning(false);
        }}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />

      <TextInput
        style={[styles.input, { 
          backgroundColor: colors.inputBg, 
          color: colors.inputText, 
          borderColor: colors.inputBorder 
        }]}
        placeholder="Dokploy API Key"
        placeholderTextColor={theme === 'dark' ? '#555555' : '#aaaaaa'}
        value={key}
        onChangeText={setKey}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />

      <TouchableOpacity 
        style={[styles.button, { backgroundColor: colors.activeTint }, loading && styles.buttonDisabled]} 
        onPress={handleSave}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={theme === 'dark' ? '#000000' : '#ffffff'} />
        ) : (
          <Text style={[styles.buttonText, { color: theme === 'dark' ? '#000000' : '#ffffff' }]}>Connect Server</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    justifyContent: 'center', 
    padding: 32, 
  },
  title: { 
    fontSize: 32, 
    fontWeight: '800', 
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: -0.5
  },
  subtitle: { 
    fontSize: 15, 
    textAlign: 'center',
    marginBottom: 32
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '500',
    lineHeight: 18,
  },
  input: { 
    height: 52, 
    borderWidth: 1, 
    borderRadius: 10, 
    paddingHorizontal: 16, 
    marginBottom: 16,
    fontSize: 15
  },
  button: { 
    height: 52, 
    borderRadius: 10, 
    justifyContent: 'center', 
    alignItems: 'center', 
    marginTop: 8 
  },
  buttonDisabled: {
    opacity: 0.7
  },
  buttonText: { 
    fontWeight: '700', 
    fontSize: 16 
  }
});
