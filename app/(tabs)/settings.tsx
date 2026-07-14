import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, ScrollView } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDokployInstanceInfo, useDokployCapabilities, useRefreshCapabilities } from '../../src/services/queries';
import { getClientConfig } from '../../src/services/api';
import { clearCacheForProfile } from '../../src/services/cache';
import { DokployCapabilityKey } from '../../src/services/api.types';
import BottomSheet, { BottomSheetRef } from '../../src/components/BottomSheet';

export default function SettingsScreen() {
  const [url, setUrl] = useState('');
  const [biometricsEnabled, setBiometricsEnabled] = useState(true);
  const [showTechDetails, setShowTechDetails] = useState(false);
  const router = useRouter();
  const { theme, colors, toggleTheme } = useTheme();

  const capabilitiesSheetRef = useRef<BottomSheetRef>(null);

  // TanStack Queries
  const { data: instanceInfo, isLoading: instanceLoading, refetch: refetchInstance } = useDokployInstanceInfo();
  const { data: capabilities, isLoading: capsLoading, dataUpdatedAt: capsUpdatedAt } = useDokployCapabilities();
  const refreshMutation = useRefreshCapabilities();

  useEffect(() => {
    getClientConfig().then(c => setUrl(c.url || ''));
    SecureStore.getItemAsync('use_biometrics').then(v => {
      setBiometricsEnabled(v !== 'false'); // true by default
    });
  }, [instanceInfo]);

  const handleLogout = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // Clear profile namespaced cache from AsyncStorage
    try {
      const config = await getClientConfig();
      if (config.profileId) {
        await clearCacheForProfile(config.profileId);
      }
    } catch {}

    // Delete credentials profile
    await SecureStore.deleteItemAsync('dokploy_profile');
    await SecureStore.deleteItemAsync('dokploy_vps_url');
    await SecureStore.deleteItemAsync('dokploy_api_key');

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    router.replace('/setup');
  };

  const toggleBiometrics = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newValue = !biometricsEnabled;
    setBiometricsEnabled(newValue);
    await SecureStore.setItemAsync('use_biometrics', newValue ? 'true' : 'false');
  };

  const handleCheckConnection = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await refreshMutation.mutateAsync();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'connected':
        return colors.statusRunning;
      case 'checking':
        return '#ffb703';
      case 'offline':
      case 'authentication_failed':
      case 'server_error':
        return colors.statusStopped;
      default:
        return colors.textSecondary;
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'checking':
        return 'Checking...';
      case 'offline':
        return 'Offline';
      case 'authentication_failed':
        return 'Authentication Failed';
      case 'server_error':
        return 'Server Error';
      default:
        return 'Unknown';
    }
  };

  const getBadgeColor = (status: string) => {
    switch (status) {
      case 'available':
        return colors.statusRunning;
      case 'read_only':
        return '#ff9f0a';
      case 'forbidden':
        return colors.statusStopped;
      case 'unsupported':
      case 'unknown':
      default:
        return colors.inactiveTint;
    }
  };

  const getBadgeLabel = (status: string) => {
    switch (status) {
      case 'available':
        return 'Available';
      case 'read_only':
        return 'Read Only';
      case 'forbidden':
        return 'Forbidden';
      case 'unsupported':
        return 'Unsupported';
      case 'unknown':
      default:
        return 'Unknown';
    }
  };

  // Group capabilities by category
  const capabilityGroups = [
    {
      title: 'Projects & Apps',
      items: [
        { key: 'readProjects', label: 'Read Namespaces' },
        { key: 'createProjects', label: 'Create Namespaces' },
        { key: 'readApplications', label: 'Read Applications' },
        { key: 'manageApplicationLifecycle', label: 'App Lifecycle (Start/Stop)' },
        { key: 'deployApplications', label: 'Deploy Applications' },
        { key: 'cancelDeployments', label: 'Cancel Deployments' },
        { key: 'terminateBuilds', label: 'Terminate Builds' },
        { key: 'rollbackDeployments', label: 'Rollback Deployments' },
      ]
    },
    {
      title: 'Compose & Databases',
      items: [
        { key: 'readCompose', label: 'Read Compose Stacks' },
        { key: 'manageComposeLifecycle', label: 'Compose Lifecycle' },
        { key: 'deployCompose', label: 'Re-deploy Compose' },
        { key: 'readDatabases', label: 'Read Databases' },
        { key: 'manageDatabaseLifecycle', label: 'Database Lifecycle' },
      ]
    },
    {
      title: 'Docker & System',
      items: [
        { key: 'readContainers', label: 'Read Containers' },
        { key: 'manageDocker', label: 'Docker Cleanup Operations' },
        { key: 'readServers', label: 'Read Server Nodes' },
        { key: 'manageServers', label: 'Manage Server Configurations' },
        { key: 'manageTraefik', label: 'Reload Traefik Daemon' },
      ]
    },
    {
      title: 'Network & Routing',
      items: [
        { key: 'readDomains', label: 'Read Domains' },
        { key: 'manageDomains', label: 'Manage Domains' },
        { key: 'manageCertificates', label: 'Manage Certificates' },
      ]
    },
    {
      title: 'Backups & Notifications',
      items: [
        { key: 'readBackups', label: 'Read Backups' },
        { key: 'manageBackups', label: 'Manage Backup Schedules' },
        { key: 'runBackups', label: 'Run Backup Jobs' },
        { key: 'manageVolumeBackups', label: 'Manage Volume Backups' },
        { key: 'readNotifications', label: 'Read Notifications' },
        { key: 'manageNotifications', label: 'Configure Notifications' },
      ]
    }
  ];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      <Text style={[styles.headerTitle, { color: colors.text }]}>Settings</Text>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>Connection Details</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.connectionHeader}>
              <View style={styles.instanceTitleContainer}>
                <Ionicons name="server-outline" size={20} color={colors.activeTint} style={{ marginRight: 8 }} />
                <Text style={[styles.instanceName, { color: colors.text }]}>Dokploy Server</Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: getStatusColor(instanceInfo?.connectionStatus) }]} />
            </View>
            
            <Text style={[styles.label, { color: colors.textSecondary }]}>VPS Address</Text>
            <Text style={[styles.value, { color: colors.text }]} numberOfLines={1}>{url || 'Not Connected'}</Text>
            
            <View style={styles.divider} />

            <View style={styles.connectionDetailsRow}>
              <View>
                <Text style={[styles.subLabel, { color: colors.textSecondary }]}>Status</Text>
                <Text style={[styles.subValue, { color: getStatusColor(instanceInfo?.connectionStatus) }]}>
                  {getStatusLabel(instanceInfo?.connectionStatus)}
                </Text>
              </View>
              <View>
                <Text style={[styles.subLabel, { color: colors.textSecondary }]}>Version</Text>
                <Text style={[styles.subValue, { color: colors.text }]}>
                  {instanceInfo?.version || 'N/A'}
                </Text>
              </View>
            </View>

            {instanceInfo?.lastSuccessfulConnectionAt && (
              <View style={{ marginTop: 8 }}>
                <Text style={[styles.subLabel, { color: colors.textSecondary }]}>Last Successful Sync</Text>
                <Text style={[styles.subValue, { color: colors.textSecondary }]}>
                  {new Date(instanceInfo.lastSuccessfulConnectionAt).toLocaleString()}
                </Text>
              </View>
            )}

            <TouchableOpacity 
              style={[styles.checkBtn, { backgroundColor: colors.statsBg }]} 
              onPress={handleCheckConnection}
              disabled={refreshMutation.isPending}
            >
              {refreshMutation.isPending ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={16} color={colors.text} style={{ marginRight: 6 }} />
                  <Text style={[styles.checkBtnText, { color: colors.text }]}>Check Connection</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>Security & Operations</Text>
          
          {/* Server Capabilities trigger row */}
          <TouchableOpacity 
            style={[styles.card, styles.row, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 12 }]} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              capabilitiesSheetRef.current?.open();
            }}
          >
            <View style={styles.rowLabelContainer}>
              <Ionicons 
                name="shield-checkmark-outline" 
                size={20} 
                color={colors.activeTint} 
                style={{ marginRight: 10 }} 
              />
              <Text style={[styles.value, { color: colors.text }]}>
                Server Capabilities
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.card, styles.row, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 12 }]} 
            onPress={toggleBiometrics}
          >
            <View style={styles.rowLabelContainer}>
              <Ionicons 
                name={biometricsEnabled ? "finger-print" : "lock-open"} 
                size={20} 
                color={biometricsEnabled ? colors.activeTint : colors.textSecondary} 
                style={{ marginRight: 10 }} 
              />
              <Text style={[styles.value, { color: colors.text }]}>
                Biometric Lock Screen
              </Text>
            </View>
            <Text style={[styles.helperTextLink, { color: colors.activeTint }]}>
              {biometricsEnabled ? 'Enabled' : 'Disabled'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>Appearance</Text>
          <TouchableOpacity 
            style={[styles.card, styles.row, { backgroundColor: colors.card, borderColor: colors.border }]} 
            onPress={toggleTheme}
          >
            <View style={styles.rowLabelContainer}>
              <Ionicons 
                name={theme === 'dark' ? "moon" : "sunny"} 
                size={20} 
                color={theme === 'dark' ? "#ffd60a" : "#ffb703"} 
                style={{ marginRight: 10 }} 
              />
              <Text style={[styles.value, { color: colors.text }]}>
                {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
              </Text>
            </View>
            <Text style={[styles.helperTextLink, { color: colors.activeTint }]}>Toggle</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.section, { marginTop: 24 }]}>
          <TouchableOpacity style={[styles.logoutButton, { backgroundColor: colors.statusStopped }]} onPress={handleLogout}>
            <Text style={styles.logoutText}>Disconnect VPS Server</Text>
          </TouchableOpacity>
          <Text style={[styles.helperText, { color: colors.textSecondary }]}>
            Disconnecting will remove your profile configurations and AsyncStorage metadata cache.
          </Text>
        </View>
      </ScrollView>

      {/* Server Capabilities Sheet */}
      <BottomSheet ref={capabilitiesSheetRef}>
        <View style={styles.sheetHeader}>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>Server Capabilities</Text>
          <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>Active permissions and features</Text>
        </View>
        
        <ScrollView style={styles.sheetScroll} contentContainerStyle={{ paddingBottom: 140 }}>
          {capabilityGroups.map((group, idx) => (
            <View key={idx} style={styles.capabilityGroup}>
              <Text style={[styles.groupTitle, { color: colors.activeTint }]}>{group.title}</Text>
              {group.items.map((item) => {
                const status = capabilities?.[item.key as DokployCapabilityKey] || 'unknown';
                return (
                  <View key={item.key} style={[styles.capabilityRow, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.capabilityLabel, { color: colors.text }]}>{item.label}</Text>
                    <View style={[styles.badge, { backgroundColor: getBadgeColor(status) }]}>
                      <Text style={styles.badgeText}>{getBadgeLabel(status)}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}

          {/* Collapsible Technical Details */}
          <View style={styles.techDetailsContainer}>
            <TouchableOpacity 
              style={[styles.techDetailsHeader, { borderBottomColor: colors.border }]} 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShowTechDetails(!showTechDetails);
              }}
            >
              <Text style={[styles.techDetailsTitle, { color: colors.text }]}>Technical Details</Text>
              <Ionicons 
                name={showTechDetails ? "chevron-up" : "chevron-down"} 
                size={16} 
                color={colors.textSecondary} 
              />
            </TouchableOpacity>
            
            {showTechDetails && (
              <View style={[styles.techDetailsContent, { backgroundColor: colors.statsBg }]}>
                <View style={styles.techRow}>
                  <Text style={[styles.techLabel, { color: colors.textSecondary }]}>Dokploy Version</Text>
                  <Text style={[styles.techValue, { color: colors.text }]}>{instanceInfo?.version || 'Unknown'}</Text>
                </View>
                <View style={styles.techRow}>
                  <Text style={[styles.techLabel, { color: colors.textSecondary }]}>Release Tag</Text>
                  <Text style={[styles.techValue, { color: colors.text }]}>{instanceInfo?.releaseTag || 'None'}</Text>
                </View>
                <View style={styles.techRow}>
                  <Text style={[styles.techLabel, { color: colors.textSecondary }]}>OpenAPI Sync</Text>
                  <Text style={[styles.techValue, { color: colors.text }]}>
                    {capsLoading ? 'Checking...' : (capabilities ? 'Successful' : 'Failed')}
                  </Text>
                </View>
                <View style={styles.techRow}>
                  <Text style={[styles.techLabel, { color: colors.textSecondary }]}>Last Refresh</Text>
                  <Text style={[styles.techValue, { color: colors.text }]}>
                    {capsUpdatedAt ? new Date(capsUpdatedAt).toLocaleTimeString() : 'N/A'}
                  </Text>
                </View>
                <View style={styles.techRow}>
                  <Text style={[styles.techLabel, { color: colors.textSecondary }]}>Last Status Code</Text>
                  <Text style={[styles.techValue, { color: colors.text }]}>
                    {instanceInfo?.connectionStatus === 'server_error' ? '500 Server Error' : 
                     instanceInfo?.connectionStatus === 'authentication_failed' ? '401 Unauthorized' : 
                     instanceInfo?.connectionStatus === 'offline' ? 'Offline' : '200 OK'}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 24,
    letterSpacing: -0.5,
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  connectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  instanceTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  instanceName: {
    fontSize: 18,
    fontWeight: '700',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  value: {
    fontSize: 15,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(150, 150, 150, 0.1)',
    marginVertical: 12,
  },
  connectionDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '500',
  },
  subValue: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  checkBtn: {
    marginTop: 16,
    height: 40,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  helperTextLink: {
    fontWeight: '700',
    fontSize: 14,
  },
  logoutButton: {
    height: 52,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  logoutText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
  helperText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
  },
  sheetHeader: {
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150, 150, 150, 0.1)',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  sheetSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  sheetScroll: {
    flex: 1,
  },
  capabilityGroup: {
    marginBottom: 24,
  },
  groupTitle: {
    fontSize: 14,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  capabilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  capabilityLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  techDetailsContainer: {
    marginTop: 16,
    borderRadius: 8,
    overflow: 'hidden',
  },
  techDetailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  techDetailsTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  techDetailsContent: {
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  techRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  techLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  techValue: {
    fontSize: 13,
    fontWeight: '600',
  }
});
