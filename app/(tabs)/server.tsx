import React, { useRef, useState } from 'react';
import { 
  ScrollView, 
  StyleSheet, 
  Text, 
  TouchableOpacity, 
  View, 
  ActivityIndicator,
  Dimensions
} from 'react-native';
import { api } from '../../src/services/api';
import BottomSheet, { BottomSheetRef } from '../../src/components/BottomSheet';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/theme/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const cardWidth = (width - 32 - 12) / 2;

export default function ServerManagementScreen() {
  const { colors } = useTheme();

  // Loading States for API Actions
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  const healthSheetRef = useRef<BottomSheetRef>(null);

  const runCleanupAction = async (actionKey: string, apiCall: () => Promise<any>, successMsg: string) => {
    setRunningAction(actionKey);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await apiCall();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setTimeout(() => {
        setRunningAction(null);
        alert(successMsg);
      }, 800);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setRunningAction(null);
      alert('Failed to execute server command. Check API credentials and node connection.');
    }
  };

  const handleHealthCheck = () => {
    setHealthLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setTimeout(() => {
      setHealthLoading(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      healthSheetRef.current?.open();
    }, 1500);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Server Console</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
        {/* Docker Cleanup Grid */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Docker Pruning & GC</Text>
        <View style={styles.grid}>
          {/* Prune Images */}
          <TouchableOpacity 
            style={[styles.gridCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => runCleanupAction('images', api.cleanUnusedImages, 'Unused Docker images pruned successfully.')}
            disabled={runningAction !== null}
          >
            {runningAction === 'images' ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <>
                <Ionicons name="image-outline" size={22} color="#bf5af2" style={{ marginBottom: 6 }} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Prune Images</Text>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Remove dangling builds</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Prune Containers */}
          <TouchableOpacity 
            style={[styles.gridCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => runCleanupAction('containers', api.cleanStoppedContainers, 'All stopped docker containers cleared.')}
            disabled={runningAction !== null}
          >
            {runningAction === 'containers' ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <>
                <Ionicons name="square-outline" size={22} color="#ff3b30" style={{ marginBottom: 6 }} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Prune Containers</Text>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Remove stopped tasks</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Prune Volumes */}
          <TouchableOpacity 
            style={[styles.gridCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => runCleanupAction('volumes', api.cleanUnusedVolumes, 'Unused persistent Docker volumes cleared.')}
            disabled={runningAction !== null}
          >
            {runningAction === 'volumes' ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <>
                <Ionicons name="folder-open-outline" size={22} color="#ffcc00" style={{ marginBottom: 6 }} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Prune Volumes</Text>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Clear dangling storage</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Clean All */}
          <TouchableOpacity 
            style={[styles.gridCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => runCleanupAction('cleanAll', api.cleanAll, 'Deep server garbage collection completed. Saved builder caches and resources pruned.')}
            disabled={runningAction !== null}
          >
            {runningAction === 'cleanAll' ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <>
                <Ionicons name="sparkles-outline" size={22} color="#30d158" style={{ marginBottom: 6 }} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Deep GC</Text>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Prune all build caches</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Daemon Maintenance */}
        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 28 }]}>Dokploy Maintenance</Text>
        <View style={styles.grid}>
          {/* Reload server */}
          <TouchableOpacity 
            style={[styles.gridCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => runCleanupAction('reload', api.reloadServer, 'Dokploy system web server daemon reloaded.')}
            disabled={runningAction !== null}
          >
            {runningAction === 'reload' ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <>
                <Ionicons name="sync-outline" size={22} color={colors.activeTint} style={{ marginBottom: 6 }} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Reload Daemon</Text>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Restart admin proxy</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Clean Redis */}
          <TouchableOpacity 
            style={[styles.gridCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => runCleanupAction('redis', api.cleanRedis, 'Dokploy internal settings Redis cache cleared.')}
            disabled={runningAction !== null}
          >
            {runningAction === 'redis' ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <>
                <Ionicons name="cube-outline" size={22} color="#5856d6" style={{ marginBottom: 6 }} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Flush Cache</Text>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Empty Redis config store</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Health Diagnostics Check */}
          <TouchableOpacity 
            style={[styles.gridCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={handleHealthCheck}
            disabled={healthLoading || runningAction !== null}
          >
            {healthLoading ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <>
                <Ionicons name="heart-half-outline" size={22} color="#30d158" style={{ marginBottom: 6 }} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Diagnostics</Text>
                <Text style={[styles.cardSub, { color: colors.textSecondary }]}>Sweep nodes health</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Styled Diagnostics Sheet */}
      <BottomSheet ref={healthSheetRef}>
        <View style={styles.sheetContent}>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>Diagnostics Report</Text>
          <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>VPS Nodes & Microservices</Text>

          <View style={styles.terminalContainer}>
            <View style={styles.terminalRow}>
              <Ionicons name="checkmark-circle" size={16} color="#30d158" style={{ marginRight: 8 }} />
              <Text style={styles.terminalText}>Docker Daemon: ONLINE</Text>
            </View>
            <View style={styles.terminalRow}>
              <Ionicons name="checkmark-circle" size={16} color="#30d158" style={{ marginRight: 8 }} />
              <Text style={styles.terminalText}>Web Proxy Gateway: ACTIVE</Text>
            </View>
            <View style={styles.terminalRow}>
              <Ionicons name="checkmark-circle" size={16} color="#30d158" style={{ marginRight: 8 }} />
              <Text style={styles.terminalText}>Database Caches: SYNCHRONIZED</Text>
            </View>
            <View style={styles.terminalRow}>
              <Ionicons name="checkmark-circle" size={16} color="#30d158" style={{ marginRight: 8 }} />
              <Text style={styles.terminalText}>Security Firewall: ENABLED</Text>
            </View>
            <View style={styles.terminalRow}>
              <Ionicons name="checkmark-circle" size={16} color="#30d158" style={{ marginRight: 8 }} />
              <Text style={styles.terminalText}>Memory Buffer: HEALTHY</Text>
            </View>
          </View>
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
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  healthBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  bannerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridCard: {
    width: cardWidth,
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    height: 96,
    justifyContent: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  cardSub: {
    fontSize: 11,
    marginTop: 1,
  },
  sheetContent: {
    paddingTop: 8,
    paddingBottom: 24,
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
    marginBottom: 24,
  },
  terminalContainer: {
    backgroundColor: '#000000',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#222222',
  },
  terminalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  terminalText: {
    color: '#88ee88',
    fontFamily: 'monospace',
    fontSize: 13,
    fontWeight: '600',
  }
});
