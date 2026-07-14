import React, { useRef, useState } from 'react';
import { 
  ScrollView, 
  StyleSheet, 
  Text, 
  View, 
  ActivityIndicator, 
  RefreshControl,
  TextInput,
  TouchableOpacity
} from 'react-native';
import { api, Deployment } from '../../src/services/api';
import BottomSheet, { BottomSheetRef } from '../../src/components/BottomSheet';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/theme/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';

export default function DeploymentsScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | null>(null); // null = all, true = running, false = stopped
  const [activeSegment, setActiveSegment] = useState<'containers' | 'builds'>('containers');
  const [selectedContainer, setSelectedContainer] = useState<any | null>(null);
  const [selectedBuild, setSelectedBuild] = useState<any | null>(null);
  const [buildLogs, setBuildLogs] = useState('');
  const [buildLogsLoading, setBuildLogsLoading] = useState(false);

  const sheetRef = useRef<BottomSheetRef>(null);
  const buildSheetRef = useRef<BottomSheetRef>(null);
  const { colors } = useTheme();

  // Query 1: Fetch Docker containers
  const { data: containers = [], isLoading: containersLoading, refetch: refetchContainers, isRefetching: isRefetchingContainers } = useQuery({
    queryKey: ['containers'],
    queryFn: async () => {
      const containersData: any = await api.getContainers();
      const parsedContainers = Array.isArray(containersData) 
        ? containersData 
        : (containersData?.containers || containersData?.data || []);
      return parsedContainers || [];
    },
    staleTime: 1000 * 60, // 1 minute caching
    refetchInterval: 1000 * 60,
  });

  // Query 2: Fetch and merge all application deployments
  const { data: deployments = [], isLoading: deploymentsLoading, refetch: refetchDeployments, isRefetching: isRefetchingDeployments } = useQuery({
    queryKey: ['deployments'],
    queryFn: async () => {
      const data = await api.getProjects();
      
      const appIds: string[] = [];
      const appNames: Record<string, string> = {};

      (data || []).forEach((proj: any) => {
        const env = proj.environments?.[0] || {};
        (env.applications || []).forEach((app: any) => {
          if (app.applicationId) {
            appIds.push(app.applicationId);
            appNames[app.applicationId] = app.name;
          }
        });
      });

      // Query deployments in parallel for all apps
      const allFeeds = await Promise.all(
        appIds.map(async (appId) => {
          try {
            const feed = await api.getDeployments(appId);
            return (feed || []).map((build: any) => ({
              ...build,
              appName: appNames[appId] || 'Application'
            }));
          } catch {
            return [];
          }
        })
      );

      // Merge and sort chronologically (latest first)
      const sortedDeployments = allFeeds.flat().sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      return sortedDeployments;
    },
    staleTime: 1000 * 60,
    refetchInterval: 1000 * 60,
  });

  const handleRefresh = () => {
    if (activeSegment === 'containers') {
      refetchContainers();
    } else {
      refetchDeployments();
    }
  };

  const handleSelectContainer = (container: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedContainer(container);
    sheetRef.current?.open();
  };

  const handleSelectBuild = async (build: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedBuild(build);
    setBuildLogs('');
    setBuildLogsLoading(true);
    buildSheetRef.current?.open();

    try {
      const response = await api.getDeploymentLogs(build.deploymentId || build.id);
      setBuildLogs(response.logs || 'No build logs available.');
    } catch {
      setBuildLogs('Failed to retrieve deployment logs.');
    } finally {
      setBuildLogsLoading(false);
    }
  };

  // Filter & Search Logic for containers
  const filteredContainers = containers.filter((container: any) => {
    const names = Array.isArray(container.Names) 
      ? container.Names 
      : Array.isArray(container.names) 
        ? container.names 
        : typeof container.name === 'string'
          ? [container.name]
          : [];
    const name = (names && names[0]) ? names[0].toLowerCase() : '';
    const image = (container.Image || container.image || '').toLowerCase();
    const matchesSearch = name.includes(searchQuery.toLowerCase()) || image.includes(searchQuery.toLowerCase());
    
    const state = (container.State || container.state || '').toLowerCase();
    const isRunning = state === 'running';

    if (filterActive === true) return matchesSearch && isRunning;
    if (filterActive === false) return matchesSearch && !isRunning;
    return matchesSearch;
  });

  const loadingState = activeSegment === 'containers' 
    ? (containersLoading && !isRefetchingContainers)
    : (deploymentsLoading && !isRefetchingDeployments);

  if (loadingState) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

  const runningCount = containers.filter((c: any) => {
    const state = (c.State || c.state || '').toLowerCase();
    return state === 'running';
  }).length;

  const stoppedCount = containers.length - runningCount;

  // Selected container attributes parsing safely
  const selectedNames = Array.isArray(selectedContainer?.Names) 
    ? selectedContainer.Names 
    : Array.isArray(selectedContainer?.names) 
      ? selectedContainer.names 
      : typeof selectedContainer?.name === 'string'
        ? [selectedContainer.name]
        : [];

  const selectedName = (selectedNames && selectedNames[0]) 
    ? selectedNames[0].replace(/^\//, '') 
    : 'Unnamed Container';
  
  const selectedState = (selectedContainer?.State || selectedContainer?.state || '').toLowerCase();
  const isSelectedRunning = selectedState === 'running';

  // Parse ports safely
  const portsVal = selectedContainer?.Ports || selectedContainer?.ports;
  const parsedPortsList: string[] = typeof portsVal === 'string' && portsVal.trim() !== ''
    ? portsVal.split(',').map((p: string) => p.trim())
    : Array.isArray(portsVal)
      ? portsVal.map((portObj: any) => {
          const publicPort = portObj.PublicPort || portObj.publicPort ? `${portObj.PublicPort || portObj.publicPort} → ` : '';
          const privatePort = portObj.PrivatePort || portObj.privatePort || '';
          const type = portObj.Type || portObj.type || 'tcp';
          const ip = portObj.IP || portObj.ip || '0.0.0.0';
          return `${ip}:${publicPort}${privatePort}/${type}`;
        })
      : [];

  // Volumes & Networks
  const createdEpoch = selectedContainer?.Created || selectedContainer?.created;
  const createdDateStr = createdEpoch 
    ? new Date(createdEpoch * 1000).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Unknown';

  const selectedMounts = Array.isArray(selectedContainer?.Mounts)
    ? selectedContainer.Mounts
    : Array.isArray(selectedContainer?.mounts)
      ? selectedContainer.mounts
      : [];

  const networksObj = selectedContainer?.NetworkSettings?.Networks || selectedContainer?.networkSettings?.networks;
  const networkNames = networksObj ? Object.keys(networksObj) : [];

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        {/* Segmented Control Selector */}
        <View style={[styles.segmentedControl, { backgroundColor: colors.statsBg }]}>
          <TouchableOpacity 
            style={[styles.segmentBtn, activeSegment === 'containers' && { backgroundColor: colors.card }]} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveSegment('containers');
            }}
          >
            <Text style={[styles.segmentBtnText, { color: colors.text, fontWeight: activeSegment === 'containers' ? '700' : '500' }]}>
              Containers
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.segmentBtn, activeSegment === 'builds' && { backgroundColor: colors.card }]} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveSegment('builds');
            }}
          >
            <Text style={[styles.segmentBtnText, { color: colors.text, fontWeight: activeSegment === 'builds' ? '700' : '500' }]}>
              Build Feed
            </Text>
          </TouchableOpacity>
        </View>

        {/* Header Controls for Containers */}
        {activeSegment === 'containers' && (
          <>
            {/* Search Bar */}
            <View style={[styles.searchContainer, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
              <Ionicons name="search" size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={[styles.searchInput, { color: colors.inputText }]}
                placeholder="Search containers..."
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Filter Pills */}
            <View style={styles.filterRow}>
              <TouchableOpacity 
                style={[styles.filterPill, filterActive === null && { backgroundColor: colors.activeTint }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFilterActive(null);
                }}
              >
                <Text style={[styles.filterText, { color: filterActive === null ? colors.background : colors.textSecondary }]}>
                  All ({containers.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.filterPill, filterActive === true && { backgroundColor: colors.statusRunning }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFilterActive(true);
                }}
              >
                <Text style={[styles.filterText, { color: filterActive === true ? '#ffffff' : colors.textSecondary }]}>
                  Running ({runningCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.filterPill, filterActive === false && { backgroundColor: colors.statusStopped }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFilterActive(false);
                }}
              >
                <Text style={[styles.filterText, { color: filterActive === false ? '#ffffff' : colors.textSecondary }]}>
                  Stopped ({stoppedCount})
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      <ScrollView 
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl 
            refreshing={activeSegment === 'containers' ? isRefetchingContainers : isRefetchingDeployments} 
            onRefresh={handleRefresh} 
            tintColor={colors.text} 
          />
        }
      >
        {/* Segment 1: Containers List */}
        {activeSegment === 'containers' && (
          filteredContainers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No containers found matching filters.</Text>
            </View>
          ) : (
            filteredContainers.map((container: any) => {
              const names = Array.isArray(container.Names) 
                ? container.Names 
                : Array.isArray(container.names) 
                  ? container.names 
                  : typeof container.name === 'string'
                    ? [container.name]
                    : [];
              const name = (names && names[0]) 
                ? names[0].replace(/^\//, '') 
                : 'Unnamed Container';
              
              const state = (container.State || container.state || '').toLowerCase();
              const isRunning = state === 'running';

              return (
                <TouchableOpacity 
                  key={container.containerId || container.Id || container.id || name} 
                  style={[styles.buildCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => handleSelectContainer(container)}
                >
                  <View style={styles.buildInfo}>
                    <Text style={[styles.appName, { color: colors.text }]} numberOfLines={1}>
                      {container.Image || container.image}
                    </Text>
                    <Text style={[styles.buildDate, { color: colors.textSecondary }]} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={[styles.containerStatusText, { color: isRunning ? colors.statusRunning : colors.statusStopped }]}>
                      {container.Status || container.status || (isRunning ? 'Running' : 'Stopped')}
                    </Text>
                  </View>
                  <View style={styles.statusSection}>
                    <View style={[styles.statusDot, { backgroundColor: isRunning ? colors.statusRunning : colors.statusStopped }]} />
                  </View>
                </TouchableOpacity>
              );
            })
          )
        )}

        {/* Segment 2: Merged Global Build Feed */}
        {activeSegment === 'builds' && (
          deployments.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No recent builds found.</Text>
            </View>
          ) : (
            deployments.map((build: any, idx: number) => {
              const isSuccess = build.status === 'success';
              const isFailed = build.status === 'failed';
              const date = new Date(build.createdAt).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <TouchableOpacity 
                  key={build.deploymentId || build.id || idx} 
                  style={[styles.buildCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => handleSelectBuild(build)}
                >
                  <View style={styles.buildInfo}>
                    <Text style={[styles.appName, { color: colors.text }]}>{build.appName}</Text>
                    <Text style={[styles.buildDate, { color: colors.textSecondary }]}>
                      {date}
                    </Text>
                  </View>
                  <View style={styles.statusSection}>
                    <Text style={[styles.statusText, { 
                      color: isSuccess ? colors.statusRunning : 
                             isFailed ? colors.statusStopped : '#ffcc00' 
                    }]}>
                      {build.status.toUpperCase()}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )
        )}
      </ScrollView>

      {/* Container Details Bottom Sheet */}
      <BottomSheet ref={sheetRef} onClose={() => setSelectedContainer(null)}>
        {selectedContainer && (
          <View style={styles.sheetContent}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{selectedName}</Text>
            <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
              Container Diagnostics
            </Text>

            <ScrollView style={styles.detailsScroll} contentContainerStyle={styles.detailsScrollContent}>
              <View style={[styles.metaRow, { borderColor: colors.border }]}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>State</Text>
                <Text style={[styles.metaValue, { color: isSelectedRunning ? colors.statusRunning : colors.statusStopped, fontWeight: '700' }]}>
                  {selectedState.toUpperCase()}
                </Text>
              </View>

              <View style={[styles.metaRow, { borderColor: colors.border }]}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Uptime / Status</Text>
                <Text style={[styles.metaValue, { color: colors.text }]}>
                  {selectedContainer.Status || selectedContainer.status || 'Unknown'}
                </Text>
              </View>

              {createdEpoch ? (
                <View style={[styles.metaRow, { borderColor: colors.border }]}>
                  <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Created At</Text>
                  <Text style={[styles.metaValue, { color: colors.text }]}>
                    {createdDateStr}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.metaRow, { borderColor: colors.border }]}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>Docker Image</Text>
                <Text style={[styles.metaValue, { color: colors.text }]} numberOfLines={3}>
                  {selectedContainer.Image || selectedContainer.image}
                </Text>
              </View>

              {/* Network Configuration */}
              {networkNames.length > 0 ? (
                <View style={styles.metaBlock}>
                  <Text style={[styles.metaLabel, { color: colors.textSecondary, marginBottom: 6 }]}>Networks & IPs</Text>
                  {networkNames.map((netName) => {
                    const netDetails = networksObj[netName];
                    return (
                      <View key={netName} style={[styles.detailBadge, { backgroundColor: colors.statsBg, borderColor: colors.border }]}>
                        <Ionicons name="git-network" size={14} color={colors.textSecondary} style={{ marginRight: 8 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.badgeTitle, { color: colors.text }]}>{netName}</Text>
                          <Text style={[styles.badgeSub, { color: colors.textSecondary }]}>
                            IP: {netDetails.IPAddress || 'None'} • Gateway: {netDetails.Gateway || 'None'}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {/* Volume Mounts */}
              {selectedMounts.length > 0 ? (
                <View style={styles.metaBlock}>
                  <Text style={[styles.metaLabel, { color: colors.textSecondary, marginBottom: 6 }]}>Mounted Volumes</Text>
                  {selectedMounts.map((mount: any, idx: number) => {
                    const dest = mount.Destination || mount.destination || '';
                    const src = mount.Source || mount.source || '';
                    const isRW = mount.RW !== false && mount.rw !== false;
                    return (
                      <View key={idx} style={[styles.detailBadge, { backgroundColor: colors.statsBg, borderColor: colors.border }]}>
                        <Ionicons name="folder-open-outline" size={14} color={colors.textSecondary} style={{ marginRight: 8 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.badgeTitle, { color: colors.text }]}>{dest}</Text>
                          <Text style={[styles.badgeSub, { color: colors.textSecondary }]} numberOfLines={1}>
                            Host: {src}
                          </Text>
                          <Text style={[styles.badgeTag, { color: isRW ? colors.statusRunning : colors.statusStopped }]}>
                            {isRW ? 'READ-WRITE' : 'READ-ONLY'}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {/* Command Codeblock */}
              {(selectedContainer.Command || selectedContainer.command) ? (
                <View style={styles.metaBlock}>
                  <Text style={[styles.metaLabel, { color: colors.textSecondary, marginBottom: 6 }]}>Startup Command</Text>
                  <View style={styles.codeBlockWrapper}>
                    <Text style={styles.codeText}>
                      {selectedContainer.Command || selectedContainer.command}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Port Bindings */}
              {parsedPortsList.length > 0 ? (
                <View style={styles.metaBlock}>
                  <Text style={[styles.metaLabel, { color: colors.textSecondary, marginBottom: 6 }]}>Port Bindings</Text>
                  {parsedPortsList.map((portStr, idx) => (
                    <View key={idx} style={[styles.portBadge, { backgroundColor: colors.statsBg, borderColor: colors.border }]}>
                      <Ionicons name="link-outline" size={14} color={colors.textSecondary} style={{ marginRight: 6 }} />
                      <Text style={[styles.portText, { color: colors.text }]}>
                        {portStr}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          </View>
        )}
      </BottomSheet>

      {/* Build Logs Bottom Sheet */}
      <BottomSheet ref={buildSheetRef} onClose={() => setSelectedBuild(null)}>
        {selectedBuild && (
          <View style={styles.sheetContent}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Build Log</Text>
            <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
              {selectedBuild.appName} - {selectedBuild.status.toUpperCase()}
            </Text>

            {buildLogsLoading ? (
              <View style={styles.sheetLoader}>
                <ActivityIndicator size="large" color={colors.text} />
                <Text style={[styles.loaderText, { color: colors.textSecondary }]}>Fetching build logs...</Text>
              </View>
            ) : (
              <ScrollView style={styles.terminalContainer} contentContainerStyle={styles.terminalScroll}>
                <Text style={styles.terminalText}>{buildLogs || 'Empty build logs.'}</Text>
              </ScrollView>
            )}
          </View>
        )}
      </BottomSheet>
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 9,
    padding: 2,
    marginBottom: 16,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 7,
  },
  segmentBtnText: {
    fontSize: 13,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 8,
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '700',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  buildCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
  },
  buildInfo: {
    flex: 1,
  },
  appName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  buildDate: {
    fontSize: 12,
    fontWeight: '500',
  },
  containerStatusText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 4,
    textTransform: 'uppercase',
  },
  statusSection: {
    marginLeft: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusText: {
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
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
    marginBottom: 16,
  },
  detailsScroll: {
    flex: 1,
    marginBottom: 16,
  },
  detailsScrollContent: {
    paddingBottom: 32,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 14,
  },
  metaLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    maxWidth: '60%',
  },
  metaBlock: {
    marginTop: 16,
  },
  detailBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  badgeTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  badgeSub: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '500',
  },
  badgeTag: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  codeBlockWrapper: {
    backgroundColor: '#111111',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#222222',
  },
  codeText: {
    color: '#88ee88',
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 16,
  },
  portBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
  },
  portText: {
    fontSize: 13,
    fontWeight: '600',
  },
  sheetLoader: {
    alignItems: 'center',
    marginVertical: 16,
  },
  loaderText: {
    marginTop: 8,
    fontSize: 14,
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
