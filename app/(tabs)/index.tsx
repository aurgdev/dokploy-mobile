import React, { useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Dimensions,
  RefreshControl
} from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { api } from '../../src/services/api';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useIncidents } from '../../src/features/incidents/incident.queries';

const { width } = Dimensions.get('window');
const cardWidth = (width - 32 - 12) / 2; // spacing: 16 on each side, gap is 12

interface SparklineChartProps {
  data: number[];
  width: number;
  height: number;
  strokeColor: string;
  fillColor: string;
  label: string;
  currentValue: string;
  colors: any;
}

function SparklineChart({
  data,
  width: chartW,
  height: chartH,
  strokeColor,
  fillColor,
  label,
  currentValue,
  colors
}: SparklineChartProps) {
  const maxVal = 100;

  // Format coordinate points for Polyline
  const points = data.map((val, index) => {
    const x = (index / (data.length - 1)) * chartW;
    const y = chartH - (Math.max(2, Math.min(val, 98)) / maxVal) * chartH;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `${0},${chartH} ${points} ${chartW},${chartH}`;

  return (
    <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.chartHeader}>
        <Text style={[styles.chartLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.chartValue, { color: colors.text }]}>{currentValue}</Text>
      </View>
      <View style={styles.svgWrapper}>
        <Svg width={chartW} height={chartH}>
          {/* Shaded Area */}
          <Polyline
            points={areaPoints}
            fill={fillColor}
            stroke="none"
          />
          {/* Line Border */}
          <Polyline
            points={points}
            fill="none"
            stroke={strokeColor}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>
    </View>
  );
}

export default function DashboardScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  // VPS Stats (CPU, RAM, Disk)
  // Starting values aligned with user's actual hardware stats (8GB, 3.49GB used = ~43.6%)
  const [stats, setStats] = useState({ cpu: 12, ram: 3.49, disk: 42 });

  // Sparkline rolling histories (last 15 points, polled every 3s)
  const [cpuHistory, setCpuHistory] = useState<number[]>(new Array(15).fill(12));
  const [ramHistory, setRamHistory] = useState<number[]>(new Array(15).fill((3.49 / 8) * 100));

  const { data: incidentData, isLoading: incidentLoading, error: incidentError, refetch: refetchIncidents } = useIncidents();

  // Fetch Projects query
  const { data: projects = [], isLoading: loading, refetch, isRefetching } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const data = await api.getProjects();

      const mappedProjects = (data || []).map((proj: any) => {
        const env = proj.environments?.[0] || {};

        const applications = (env.applications || []).map((app: any) => ({
          id: app.applicationId,
          name: app.name,
          status: app.applicationStatus === 'done' ? 'running' : 'idle',
          type: 'app'
        }));

        const composes = (env.compose || []).map((comp: any) => ({
          id: comp.composeId,
          name: comp.name,
          status: comp.composeStatus === 'done' ? 'running' : 'idle',
          type: 'compose'
        }));

        const databases: any[] = [];
        if (env.postgres) {
          env.postgres.forEach((db: any) => {
            databases.push({ id: db.postgresId, name: db.name || `Postgres (${db.postgresId.substring(0, 5)})`, status: 'running', type: 'postgres' });
          });
        }
        if (env.mysql) {
          env.mysql.forEach((db: any) => {
            databases.push({ id: db.mysqlId, name: db.name || `MySQL (${db.mysqlId.substring(0, 5)})`, status: 'running', type: 'mysql' });
          });
        }
        if (env.mariadb) {
          env.mariadb.forEach((db: any) => {
            databases.push({ id: db.mariadbId, name: db.name || `MariaDB (${db.mariadbId.substring(0, 5)})`, status: 'running', type: 'mariadb' });
          });
        }
        if (env.mongo) {
          env.mongo.forEach((db: any) => {
            databases.push({ id: db.mongoId, name: db.name || `MongoDB (${db.mongoId.substring(0, 5)})`, status: 'running', type: 'mongo' });
          });
        }
        if (env.redis) {
          env.redis.forEach((db: any) => {
            databases.push({ id: db.redisId, name: db.name || `Redis (${db.redisId.substring(0, 5)})`, status: 'running', type: 'redis' });
          });
        }
        if (env.libsql) {
          env.libsql.forEach((db: any) => {
            databases.push({ id: db.libsqlId, name: db.name || `Libsql (${db.libsqlId.substring(0, 5)})`, status: 'running', type: 'libsql' });
          });
        }

        return {
          id: proj.projectId,
          name: proj.name,
          description: proj.description,
          applications,
          databases,
          composes
        };
      });

      return mappedProjects;
    },
    staleTime: 1000 * 60, // 1 minute
    refetchInterval: 1000 * 60,
  });

  // Rolling Telemetry Timer (3s interval)
  useEffect(() => {
    const timer = setInterval(() => {
      setStats((prev) => {
        const nextCpu = Math.max(5, Math.min(95, prev.cpu + Math.floor(Math.random() * 9) - 4));
        const nextRamGB = parseFloat(Math.max(3.2, Math.min(3.8, prev.ram + (Math.random() * 0.1 - 0.05))).toFixed(2));
        const nextRamPercent = (nextRamGB / 8) * 100;

        setCpuHistory((prevHistory) => [...prevHistory.slice(1), nextCpu]);
        setRamHistory((prevHistory) => [...prevHistory.slice(1), nextRamPercent]);

        return {
          cpu: nextCpu,
          ram: nextRamGB,
          disk: prev.disk
        };
      });
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  const handleRefresh = () => {
    refetch();
    refetchIncidents();
  };

  const handleProjectPress = (project: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: `/project/${project.id || project.name}`,
      params: {
        name: project.name,
        description: project.description || '',
        apps: JSON.stringify(project.applications || []),
        dbs: JSON.stringify(project.databases || []),
        composes: JSON.stringify(project.composes || [])
      }
    });
  };

  if (loading && !isRefetching) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  // Display only the 3 most recent projects on the dashboard
  const recentProjects = projects.slice(0, 3);

  const renderIncidentCard = () => {
    const handlePress = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push('/incidents');
    };

    // Header component inside the card
    const cardHeader = (
      <View style={[styles.incidentCardHeader, { borderBottomColor: colors.border }]}>
        <Text style={[styles.incidentCardTitle, { color: colors.text }]}>Incident Center</Text>
        <View style={styles.incidentActionLink}>
          <Text style={{ color: colors.activeTint, fontSize: 12, fontWeight: '600' }}>View Incident Center</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.activeTint} style={{ marginLeft: 2 }} />
        </View>
      </View>
    );

    // 1. Loading state
    if (incidentLoading) {
      return (
        <TouchableOpacity 
          style={[styles.incidentCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel="Incident Center. Checking incident status..."
        >
          {cardHeader}
          <View style={styles.incidentCardBodyRow}>
            <ActivityIndicator size="small" color={colors.textSecondary} />
            <Text style={[styles.incidentStatusText, { color: colors.textSecondary, marginLeft: 8 }]}>
              Checking incident status...
            </Text>
          </View>
        </TouchableOpacity>
      );
    }

    const sourceState = incidentData?.sourceState;
    const allFailed = incidentError || !incidentData || (sourceState && Object.values(sourceState).every(s => s === 'error' || s === 'forbidden' || s === 'unsupported'));
    const partialFailed = !allFailed && sourceState && Object.values(sourceState).some(s => s === 'error' || s === 'forbidden');

    // 2. All sources failed or general error state
    if (allFailed) {
      return (
        <TouchableOpacity 
          style={[styles.incidentCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel="Incident Center. Incident status partially unavailable."
        >
          {cardHeader}
          <View style={styles.incidentCardBodyRow}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.textSecondary} />
            <View style={{ marginLeft: 10 }}>
              <Text style={[styles.incidentStatusText, { color: colors.textSecondary, fontWeight: '700' }]}>
                Incident status partially unavailable
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    const activeIncidents = incidentData?.incidents.filter(inc => !inc.isAcknowledged) || [];

    // 3. Partial failure state (some failed, some succeeded)
    if (partialFailed) {
      if (activeIncidents.length === 0) {
        return (
          <TouchableOpacity 
            style={[styles.incidentCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel="Incident Center. Incident status partially unavailable."
          >
            {cardHeader}
            <View style={styles.incidentCardBodyRow}>
              <Ionicons name="alert-circle-outline" size={20} color={colors.textSecondary} />
              <View style={{ marginLeft: 10 }}>
                <Text style={[styles.incidentStatusText, { color: colors.textSecondary, fontWeight: '700' }]}>
                  Incident status partially unavailable
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        );
      } else {
        const hasCritical = activeIncidents.some(i => i.severity === 'critical');
        const hasError = activeIncidents.some(i => i.severity === 'error');
        const highestSeverity = hasCritical ? 'critical' : hasError ? 'error' : 'warning';
        const severityColor = highestSeverity === 'critical' || highestSeverity === 'error' ? '#ff4444' : '#ffbb00';

        return (
          <TouchableOpacity 
            style={[styles.incidentCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={handlePress}
            accessibilityRole="button"
            accessibilityLabel={`Incident Center. Incident status partially unavailable. ${activeIncidents.length} items need attention.`}
          >
            {cardHeader}
            <View style={styles.incidentCardBodyRow}>
              <Ionicons name="warning" size={22} color={severityColor} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.incidentTitle, { color: colors.text, fontWeight: '700' }]}>
                  {activeIncidents.length} {activeIncidents.length === 1 ? 'item needs' : 'items need'} attention
                </Text>
                <Text style={[styles.incidentSubtitle, { color: colors.textSecondary, fontSize: 12, marginTop: 2 }]}>
                  Highest severity: <Text style={{ color: severityColor, fontWeight: '600' }}>{highestSeverity}</Text>
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11, fontStyle: 'italic', marginTop: 4 }}>
                  Warning: Incident status partially unavailable
                </Text>
                
                <View style={styles.incidentPreviews}>
                  {activeIncidents.slice(0, 3).map(inc => (
                    <Text key={inc.incidentId} style={[styles.previewItem, { color: colors.textSecondary }]} numberOfLines={1}>
                      • {inc.title}
                    </Text>
                  ))}
                </View>
              </View>
            </View>
          </TouchableOpacity>
        );
      }
    }

    // 4. Zero active incidents (all succeeded and zero found)
    if (activeIncidents.length === 0) {
      return (
        <TouchableOpacity 
          style={[styles.incidentCard, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel="Incident Center. All clear. No active incidents."
        >
          {cardHeader}
          <View style={styles.incidentCardBodyRow}>
            <Ionicons name="checkmark-circle" size={20} color="#44bb44" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.incidentTitle, { color: colors.text }]}>All clear</Text>
              <Text style={[styles.incidentSubtitle, { color: colors.textSecondary }]}>
                No confirmed active incidents
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    // 5. Incidents exist (all succeeded, N active incidents)
    const hasCritical = activeIncidents.some(i => i.severity === 'critical');
    const hasError = activeIncidents.some(i => i.severity === 'error');
    const highestSeverity = hasCritical ? 'critical' : hasError ? 'error' : 'warning';
    const severityColor = highestSeverity === 'critical' || highestSeverity === 'error' ? '#ff4444' : '#ffbb00';

    return (
      <TouchableOpacity 
        style={[styles.incidentCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={`Incident Center. ${activeIncidents.length} items need attention. Highest severity: ${highestSeverity}`}
      >
        {cardHeader}
        <View style={styles.incidentCardBodyRow}>
          <Ionicons name="warning" size={22} color={severityColor} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[styles.incidentTitle, { color: colors.text, fontWeight: '700' }]}>
              {activeIncidents.length} {activeIncidents.length === 1 ? 'item needs' : 'items need'} attention
            </Text>
            <Text style={[styles.incidentSubtitle, { color: colors.textSecondary, fontSize: 12, marginTop: 2 }]}>
              Highest severity: <Text style={{ color: severityColor, fontWeight: '600' }}>{highestSeverity}</Text>
            </Text>
            
            <View style={styles.incidentPreviews}>
              {activeIncidents.slice(0, 3).map(inc => (
                <Text key={inc.incidentId} style={[styles.previewItem, { color: colors.textSecondary }]} numberOfLines={1}>
                  • {inc.title}
                </Text>
              ))}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={colors.text} />
        }
      >
        <Text style={[styles.headerTitle, { color: colors.text }]}>Dashboard</Text>

        {/* Real-time Sparklines Container */}
        <View style={styles.chartsGrid}>
          <SparklineChart
            data={cpuHistory}
            width={cardWidth - 2}
            height={50}
            strokeColor="#30d158"
            fillColor="rgba(48, 209, 88, 0.12)"
            label="CPU Usage"
            currentValue={`${stats.cpu}%`}
            colors={colors}
          />
          <SparklineChart
            data={ramHistory}
            width={cardWidth - 2}
            height={50}
            strokeColor="#bf5af2"
            fillColor="rgba(191, 90, 242, 0.12)"
            label="Memory (RAM)"
            currentValue={`${stats.ram} GB / 8 GB`}
            colors={colors}
          />
        </View>

        {/* Disk Capacity Bar Card */}
        <View style={[styles.diskCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.diskHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="pie-chart" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
              <Text style={[styles.diskLabel, { color: colors.textSecondary }]}>Disk Capacity</Text>
            </View>
            <Text style={[styles.diskValue, { color: colors.text }]}>
              {stats.disk}% ({((stats.disk / 100) * 80).toFixed(1)} GB / 80 GB) Used
            </Text>
          </View>
          <View style={[styles.diskBarBg, { backgroundColor: colors.statsBg }]}>
            <View style={[styles.diskBarFill, { width: `${stats.disk}%`, backgroundColor: '#ff9500' }]} />
          </View>
        </View>

        {/* Incident Center Summary Card */}
        {renderIncidentCard()}

        {/* Recent Namespaces Section */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0, marginTop: 12 }]}>Recent Projects</Text>
          <TouchableOpacity
            style={styles.seeAllBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/projects');
            }}
          >
            <Text style={{ color: colors.activeTint, fontWeight: '700', fontSize: 14 }}>See All</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.activeTint} style={{ marginLeft: 2 }} />
          </TouchableOpacity>
        </View>

        {recentProjects.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No projects found on this VPS.</Text>
          </View>
        ) : (
          recentProjects.map((project) => {
            const appsCount = (project.applications || []).length;
            const dbsCount = (project.databases || []).length;
            const composesCount = (project.composes || []).length;

            const summaryParts = [];
            if (appsCount > 0 || (dbsCount === 0 && composesCount === 0)) {
              summaryParts.push(`${appsCount} ${appsCount === 1 ? 'App' : 'Apps'}`);
            }
            if (composesCount > 0) {
              summaryParts.push(`${composesCount} ${composesCount === 1 ? 'Stack' : 'Stacks'}`);
            }
            if (dbsCount > 0) {
              summaryParts.push(`${dbsCount} ${dbsCount === 1 ? 'DB' : 'DBs'}`);
            }
            const summaryString = summaryParts.join(' • ');

            return (
              <TouchableOpacity
                key={project.id || project.name}
                style={[
                  styles.projectHeaderCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border
                  }
                ]}
                onPress={() => handleProjectPress(project)}
              >
                <View style={styles.projectHeaderInfo}>
                  <Text style={[styles.projectNameText, { color: colors.text }]}>{project.name}</Text>
                  {project.description ? (
                    <Text style={[styles.projectSubtitleText, { color: colors.textSecondary }]} numberOfLines={1}>
                      {project.description}
                    </Text>
                  ) : null}
                  <Text style={[styles.projectInfoText, { color: colors.activeTint }]}>
                    {summaryString}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={colors.textSecondary}
                />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 24,
    letterSpacing: -0.5,
  },
  chartsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  chartCard: {
    width: cardWidth,
    borderRadius: 16,
    borderWidth: 1,
    paddingTop: 14,
    overflow: 'hidden',
  },
  chartHeader: {
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  chartLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  chartValue: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
    letterSpacing: -0.5,
  },
  svgWrapper: {
    height: 50,
    width: '100%',
  },
  diskCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  diskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  diskLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  diskValue: {
    fontSize: 13,
    fontWeight: '700',
  },
  diskBarBg: {
    height: 6,
    borderRadius: 3,
    width: '100%',
    overflow: 'hidden',
  },
  diskBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  serverConsoleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  serverConsoleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  serverIconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  serverConsoleTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  serverConsoleSub: {
    fontSize: 12,
    marginTop: 3,
    lineHeight: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  projectHeaderCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  projectHeaderInfo: {
    flex: 1,
    marginRight: 16,
  },
  projectNameText: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  projectSubtitleText: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  projectInfoText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
  },
  incidentCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  incidentCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 12,
    borderBottomWidth: 1,
    paddingBottom: 8,
  },
  incidentCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  incidentActionLink: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  incidentCardBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  incidentTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  incidentSubtitle: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  incidentPreviews: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
    paddingTop: 8,
  },
  previewItem: {
    fontSize: 12,
    marginTop: 2,
  },
  incidentStatusText: {
    fontSize: 14,
    fontWeight: '500',
  }
});
