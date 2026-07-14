import React, { useRef, useState } from 'react';
import { 
  ScrollView, 
  StyleSheet, 
  Text, 
  TouchableOpacity, 
  View, 
  ActivityIndicator 
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { api } from '../../src/services/api';
import BottomSheet, { BottomSheetRef } from '../../src/components/BottomSheet';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/theme/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function ApplicationDetailsScreen() {
  const { id, name, status, projectName } = useLocalSearchParams<{
    id: string;
    name: string;
    status: string;
    projectName: string;
  }>();

  const router = useRouter();
  const { colors, theme } = useTheme();
  const [currentStatus, setCurrentStatus] = useState(status || 'idle');
  const [actionLoading, setActionLoading] = useState(false);
  
  // Logs Drawer State
  const [logs, setLogs] = useState('');
  const sheetRef = useRef<BottomSheetRef>(null);
  const logIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchLogs = async () => {
    try {
      const response = await api.getAppLogs(id);
      setLogs(response.logs || 'No container logs available.');
    } catch {
      setLogs('Failed to retrieve application container logs.');
    }
  };

  const openLogsDrawer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLogs('Connecting to container logs...');
    sheetRef.current?.open();
    fetchLogs();
    
    if (logIntervalRef.current) clearInterval(logIntervalRef.current);
    logIntervalRef.current = setInterval(fetchLogs, 3000);
  };

  const closeLogsDrawer = () => {
    if (logIntervalRef.current) {
      clearInterval(logIntervalRef.current);
      logIntervalRef.current = null;
    }
  };

  const handleAction = async (action: 'start' | 'stop' | 'restart' | 'deploy') => {
    setActionLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (action === 'start') {
        await api.startApp(id);
        setCurrentStatus('running');
      } else if (action === 'stop') {
        await api.stopApp(id);
        setCurrentStatus('idle');
      } else if (action === 'restart') {
        await api.restartApp(id);
        setCurrentStatus('running');
      } else if (action === 'deploy') {
        await api.deployApp(id);
        setCurrentStatus('running');
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setActionLoading(false);
    }
  };

  const isRunning = currentStatus === 'running' || currentStatus === 'done';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.back();
        }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerSubTitle, { color: colors.textSecondary }]}>{projectName}</Text>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{name}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll}>
        {/* Status Card */}
        <View style={[styles.card, styles.statusCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Lifecycle State</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusDot, { backgroundColor: isRunning ? colors.statusRunning : colors.statusStopped }]} />
            <Text style={[styles.statusText, { color: colors.text }]}>
              {isRunning ? 'RUNNING' : 'STOPPED'}
            </Text>
          </View>
        </View>

        {/* Action Controls */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Controls</Text>
        {actionLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={colors.text} />
            <Text style={[styles.loaderText, { color: colors.textSecondary }]}>Executing lifecycle event...</Text>
          </View>
        ) : (
          <View style={styles.controlGrid}>
            <TouchableOpacity style={[styles.controlBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => handleAction('start')}>
              <Ionicons name="play" size={18} color={colors.statusRunning} style={{ marginRight: 6 }} />
              <Text style={[styles.btnText, { color: colors.text }]}>Start</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.controlBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => handleAction('stop')}>
              <Ionicons name="stop" size={18} color={colors.statusStopped} style={{ marginRight: 6 }} />
              <Text style={[styles.btnText, { color: colors.text }]}>Stop</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.controlBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => handleAction('restart')}>
              <Ionicons name="refresh" size={18} color={colors.activeTint} style={{ marginRight: 6 }} />
              <Text style={[styles.btnText, { color: colors.text }]}>Restart</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.controlBtn, styles.deployBtn, { backgroundColor: colors.activeTint, borderColor: colors.activeTint }]} onPress={() => handleAction('deploy')}>
              <Ionicons name="cloud-upload" size={18} color={theme === 'dark' ? '#000000' : '#ffffff'} style={{ marginRight: 6 }} />
              <Text style={[styles.btnText, { color: theme === 'dark' ? '#000000' : '#ffffff' }]}>Deploy</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Diagnostics & Logs */}
        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>Diagnostics</Text>
        <TouchableOpacity 
          style={[styles.card, styles.logsRow, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={openLogsDrawer}
        >
          <View style={styles.logsRowLeft}>
            <Ionicons name="terminal-outline" size={22} color={colors.activeTint} style={{ marginRight: 12 }} />
            <View>
              <Text style={[styles.logsTitle, { color: colors.text }]}>View Container Logs</Text>
              <Text style={[styles.logsSubtitle, { color: colors.textSecondary }]}>Inspect standard stdout/stderr logs</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Domains & HTTPS */}
        <TouchableOpacity 
          id="open-domains-button"
          style={[styles.card, styles.logsRow, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push({ 
              pathname: '/domains/[id]', 
              params: { id, type: 'application', name, projectName }
            });
          }}
        >
          <View style={styles.logsRowLeft}>
            <Ionicons name="globe-outline" size={22} color={colors.activeTint} style={{ marginRight: 12 }} />
            <View>
              <Text style={[styles.logsTitle, { color: colors.text }]}>Domains & HTTPS</Text>
              <Text style={[styles.logsSubtitle, { color: colors.textSecondary }]}>Manage custom domains and SSL certificates</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>

        {/* Volume Backups */}
        <TouchableOpacity 
          style={[styles.card, styles.logsRow, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push({ 
              pathname: '/volume-backups/[id]', 
              params: { id, type: 'application', name, projectName }
            });
          }}
        >
          <View style={styles.logsRowLeft}>
            <Ionicons name="cube-outline" size={22} color={colors.activeTint} style={{ marginRight: 12 }} />
            <View>
              <Text style={[styles.logsTitle, { color: colors.text }]}>Volume Backups</Text>
              <Text style={[styles.logsSubtitle, { color: colors.textSecondary }]}>
                Configure S3 Docker volume backups
              </Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </ScrollView>

      {/* Logs Bottom Sheet Drawer */}
      <BottomSheet ref={sheetRef} onClose={closeLogsDrawer}>
        <View style={styles.sheetContent}>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>{name}</Text>
          <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>Application stdout logs</Text>
          
          <ScrollView style={styles.terminalContainer} contentContainerStyle={styles.terminalScroll}>
            <Text style={styles.terminalText}>{logs}</Text>
          </ScrollView>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backBtn: {
    marginRight: 16,
  },
  headerSubTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 8,
  },
  statusCard: {
    paddingVertical: 18,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  loaderContainer: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 10,
    fontSize: 13,
  },
  controlGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  controlBtn: {
    width: '48%',
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  deployBtn: {},
  btnText: {
    fontWeight: '700',
    fontSize: 15,
  },
  logsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logsRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logsTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  logsSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  sheetContent: {
    flex: 1,
    paddingTop: 8,
  },
  sheetTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 20,
  },
  terminalContainer: {
    flex: 1,
    backgroundColor: '#000000',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#222222',
    padding: 12,
    marginBottom: 24,
  },
  terminalScroll: {
    paddingBottom: 20,
  },
  terminalText: {
    color: '#88ee88',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 16,
  }
});
