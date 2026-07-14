import React, { useState, useRef } from 'react';
import { 
  ScrollView, 
  StyleSheet, 
  Text, 
  View, 
  TouchableOpacity, 
  RefreshControl, 
  ActivityIndicator, 
  Dimensions,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/theme/ThemeContext';
import { 
  useIncidents, 
  useAcknowledgeIncident, 
  useDeploymentLogs 
} from '../../src/features/incidents/incident.queries';
import { Incident } from '../../src/features/incidents/incident.types';
import BottomSheet, { BottomSheetRef } from '../../src/components/BottomSheet';

const { height } = Dimensions.get('window');

export default function IncidentCenterScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  
  // Queries
  const { data, isLoading, isRefetching, refetch, error } = useIncidents();
  const acknowledgeMutation = useAcknowledgeIncident();

  // Filters & Tabs state
  const [activeTab, setActiveTab] = useState<'active' | 'acknowledged' | 'all'>('active');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Selected deployment for logs BottomSheet
  const [selectedDeploymentId, setSelectedDeploymentId] = useState<string | null>(null);
  const bottomSheetRef = useRef<BottomSheetRef>(null);

  // Trigger Haptic Feedback
  const triggerHaptic = (type: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
    Haptics.impactAsync(type).catch(() => {});
  };

  const handleBack = () => {
    triggerHaptic();
    router.back();
  };

  const handleAcknowledge = (incidentId: string, isCurrentlyAcked: boolean) => {
    triggerHaptic(Haptics.ImpactFeedbackStyle.Medium);
    acknowledgeMutation.mutate({ 
      incidentId, 
      acknowledge: !isCurrentlyAcked 
    });
  };

  const handleViewLogs = (deploymentId: string | null) => {
    if (!deploymentId) return;
    triggerHaptic();
    setSelectedDeploymentId(deploymentId);
    setTimeout(() => {
      bottomSheetRef.current?.open();
    }, 100);
  };

  const handleOpenResource = (resourceType: string, resourceId: string | null) => {
    if (!resourceId) return;
    triggerHaptic();
    // Navigate based on resourceType
    if (resourceType === 'application') {
      router.push(`/application/${resourceId}`);
    } else if (resourceType === 'database') {
      router.push(`/database/${resourceId}`);
    } else if (resourceType === 'compose') {
      router.push(`/compose/${resourceId}`);
    } else if (resourceType === 'backup') {
      router.push(`/backups`);
    } else if (resourceType === 'volumeBackup') {
      router.push(`/volume-backups`);
    }
  };

  // Helper colors for severity
  const getSeverityColors = (severity: string) => {
    switch (severity) {
      case 'critical':
      case 'error':
        return { bg: '#ff4444', text: '#ffffff', indicator: '#ff4444' };
      case 'warning':
        return { bg: '#ffbb00', text: '#000000', indicator: '#ffbb00' };
      default:
        return { bg: '#555555', text: '#ffffff', indicator: '#8e8e93' };
    }
  };

  // Parse incidents to display
  const incidents = data?.incidents || [];
  const sourceState = data?.sourceState;
  const refreshedAt = data?.refreshedAt;

  // Filter list
  const filteredIncidents = incidents.filter(inc => {
    // 1. Tab filter
    if (activeTab === 'active' && inc.isAcknowledged) return false;
    if (activeTab === 'acknowledged' && !inc.isAcknowledged) return false;

    // 2. Category Chip filter
    if (selectedCategory) {
      if (selectedCategory === 'Deployments' && !['deployment_failed', 'deployment_stuck', 'queue_stuck'].includes(inc.category)) return false;
      if (selectedCategory === 'Services' && inc.category !== 'service_unhealthy') return false;
      if (selectedCategory === 'Backups' && !['backup_failed', 'volume_backup_failed'].includes(inc.category)) return false;
    }

    return true;
  });

  // Calculate counts for header summary
  const activeCount = incidents.filter(inc => !inc.isAcknowledged).length;
  const criticalErrorCount = incidents.filter(inc => !inc.isAcknowledged && (inc.severity === 'critical' || inc.severity === 'error')).length;
  const warningCount = incidents.filter(inc => !inc.isAcknowledged && inc.severity === 'warning').length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* Header bar */}
      <View style={[styles.header, { borderColor: colors.border }]}>
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={handleBack}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Incident Center</Text>
        <TouchableOpacity 
          style={styles.refreshBtn} 
          onPress={() => { triggerHaptic(); refetch(); }}
          disabled={isLoading || isRefetching}
          accessibilityRole="button"
          accessibilityLabel="Refresh incidents"
        >
          {isRefetching ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <Ionicons name="refresh" size={22} color={colors.text} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={isRefetching} 
            onRefresh={() => { triggerHaptic(); refetch(); }} 
            tintColor={colors.text}
          />
        }
      >
        {/* Summary Area */}
        <View style={styles.summaryContainer}>
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{activeCount}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Active</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.summaryValue, { color: '#ff4444' }]}>{criticalErrorCount}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Error/Crit</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.summaryValue, { color: '#ffbb00' }]}>{warningCount}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>Warning</Text>
          </View>
        </View>

        {/* Source State Warning Alerts */}
        {sourceState && (
          <View style={styles.sourceStateContainer}>
            {Object.entries(sourceState).map(([source, state]) => {
              if (state === 'error' || state === 'forbidden') {
                return (
                  <View key={source} style={[styles.sourceStateAlert, { backgroundColor: colors.card, borderColor: colors.border }]}>
                    <Ionicons name="warning" size={16} color={state === 'forbidden' ? '#8e8e93' : '#ff4444'} style={styles.alertIcon} />
                    <Text style={[styles.sourceStateText, { color: colors.textSecondary }]}>
                      {source.charAt(0).toUpperCase() + source.slice(1)} status: {state === 'forbidden' ? 'Permission Denied' : 'Load Failure'}
                    </Text>
                  </View>
                );
              }
              return null;
            })}
          </View>
        )}

        {/* Segmented control for tabs */}
        <View style={[styles.tabBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {(['active', 'acknowledged', 'all'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabItem,
                activeTab === tab && [styles.tabActiveItem, { backgroundColor: colors.background }]
              ]}
              onPress={() => { triggerHaptic(); setActiveTab(tab); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === tab }}
            >
              <Text 
                style={[
                  styles.tabText, 
                  { color: activeTab === tab ? colors.text : colors.textSecondary }
                ]}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Quick category chips */}
        <View style={styles.chipsContainer}>
          {['Deployments', 'Services', 'Backups'].map(cat => {
            const isSelected = selectedCategory === cat;
            return (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.chip,
                  { backgroundColor: colors.card, borderColor: colors.border },
                  isSelected && [styles.chipSelected, { backgroundColor: colors.text, borderColor: colors.text }]
                ]}
                onPress={() => { triggerHaptic(); setSelectedCategory(isSelected ? null : cat); }}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <Text 
                  style={[
                    styles.chipText, 
                    { color: isSelected ? colors.background : colors.textSecondary }
                  ]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Incidents List */}
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.text} style={styles.loader} />
        ) : filteredIncidents.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle-outline" size={48} color="#44bb44" />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>All Clear</Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              No active incidents found matching these filters.
            </Text>
          </View>
        ) : (
          filteredIncidents.map(inc => {
            const sevColors = getSeverityColors(inc.severity);
            const formattedTime = new Date(inc.createdAt).toLocaleString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });

            return (
              <View 
                key={inc.incidentId}
                style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              >
                {/* Severity Badge / Top bar */}
                <View style={styles.cardHeader}>
                  <View style={[styles.severityIndicator, { backgroundColor: sevColors.indicator }]} />
                  <Text style={[styles.severityText, { color: sevColors.indicator }]}>
                    {inc.severity.toUpperCase()}
                  </Text>
                  <Text style={[styles.cardTime, { color: colors.textSecondary }]}>
                    {formattedTime}
                  </Text>
                </View>

                {/* Title and details */}
                <Text style={[styles.cardTitle, { color: colors.text }]}>{inc.title}</Text>
                {inc.projectName && (
                  <Text style={[styles.projectName, { color: colors.textSecondary }]}>
                    Project: {inc.projectName}
                  </Text>
                )}
                <Text style={[styles.cardSummary, { color: colors.textSecondary }]}>
                  {inc.summary}
                </Text>

                {/* Action buttons */}
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: colors.border }]}
                    onPress={() => handleAcknowledge(inc.incidentId, inc.isAcknowledged)}
                    accessibilityRole="button"
                    accessibilityLabel={inc.isAcknowledged ? "Unacknowledge incident" : "Acknowledge incident"}
                  >
                    <Ionicons 
                      name={inc.isAcknowledged ? "eye-off-outline" : "eye-outline"} 
                      size={16} 
                      color={colors.textSecondary} 
                    />
                    <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>
                      {inc.isAcknowledged ? 'Unack' : 'Ack'}
                    </Text>
                  </TouchableOpacity>

                  {inc.canViewLogs && inc.deploymentId && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: colors.border }]}
                      onPress={() => handleViewLogs(inc.deploymentId)}
                      accessibilityRole="button"
                      accessibilityLabel="View deployment logs"
                    >
                      <Ionicons name="document-text-outline" size={16} color={colors.textSecondary} />
                      <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>Logs</Text>
                    </TouchableOpacity>
                  )}

                  {inc.canOpenResource && inc.resourceId && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: colors.border }]}
                      onPress={() => handleOpenResource(inc.resourceType, inc.resourceId)}
                      accessibilityRole="button"
                      accessibilityLabel="Open resource dashboard"
                    >
                      <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
                      <Text style={[styles.actionBtnText, { color: colors.textSecondary }]}>Open</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}

        {refreshedAt && (
          <Text style={[styles.lastRefreshed, { color: colors.textSecondary }]}>
            Last updated: {new Date(refreshedAt).toLocaleTimeString()}
          </Text>
        )}
      </ScrollView>

      {/* Logs BottomSheet */}
      <BottomSheet ref={bottomSheetRef} onClose={() => setSelectedDeploymentId(null)}>
        <DeploymentLogsViewer deploymentId={selectedDeploymentId} colors={colors} />
      </BottomSheet>
    </SafeAreaView>
  );
}

// Inner helper component to render logs inside the BottomSheet without re-fetching
function DeploymentLogsViewer({ deploymentId, colors }: { deploymentId: string | null; colors: any }) {
  const { data, isLoading, error } = useDeploymentLogs(deploymentId, 200);

  return (
    <View style={styles.sheetContent}>
      <Text style={[styles.sheetTitle, { color: colors.text }]}>Deployment Logs</Text>
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.text} style={styles.sheetLoader} />
      ) : error ? (
        <Text style={[styles.sheetError, { color: '#ff4444' }]}>
          Failed to load deployment logs.
        </Text>
      ) : (
        <ScrollView style={[styles.logScroll, { backgroundColor: '#111' }]} nestedScrollEnabled={true}>
          <Text style={styles.logText}>
            {data?.logs || 'No logs returned from server.'}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  backButton: {
    padding: 4,
  },
  refreshBtn: {
    padding: 4,
  },
  scrollContent: {
    padding: 16,
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  summaryLabel: {
    fontSize: 11,
    marginTop: 4,
  },
  sourceStateContainer: {
    marginBottom: 12,
  },
  sourceStateAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 6,
  },
  alertIcon: {
    marginRight: 8,
  },
  sourceStateText: {
    fontSize: 12,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    padding: 2,
    marginBottom: 16,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabActiveItem: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
  },
  chipsContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
  },
  chipSelected: {},
  chipText: {
    fontSize: 12,
    fontWeight: '500',
  },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  severityIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  severityText: {
    fontSize: 10,
    fontWeight: '700',
    marginRight: 'auto',
  },
  cardTime: {
    fontSize: 11,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  projectName: {
    fontSize: 12,
    marginBottom: 6,
  },
  cardSummary: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  cardActions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    paddingTop: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 8,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 4,
  },
  loader: {
    marginTop: 40,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  lastRefreshed: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  sheetContent: {
    padding: 16,
    height: height * 0.7,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  sheetLoader: {
    marginTop: 60,
  },
  sheetError: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 20,
  },
  logScroll: {
    flex: 1,
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  logText: {
    color: '#00ff00',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace' }),
    fontSize: 11,
    lineHeight: 15,
  }
});
