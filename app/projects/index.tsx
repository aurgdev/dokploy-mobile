import React, { useRef, useState } from 'react';
import { 
  ScrollView, 
  StyleSheet, 
  Text, 
  TouchableOpacity, 
  View, 
  ActivityIndicator, 
  RefreshControl,
  TextInput
} from 'react-native';
import { api } from '../../src/services/api';
import BottomSheet, { BottomSheetRef } from '../../src/components/BottomSheet';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/theme/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

export default function ProjectsListScreen() {
  const { colors, theme } = useTheme();
  const router = useRouter();
  
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const createProjectSheetRef = useRef<BottomSheetRef>(null);

  // Fetch Projects list via TanStack Query
  const { data: projects = [], isLoading: loading, refetch, isRefetching } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const data = await api.getProjects();
      
      return (data || []).map((proj: any) => {
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
    },
    staleTime: 1000 * 60,
  });

  const handleRefresh = () => {
    refetch();
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

  const handleCreateProject = async () => {
    if (!projectName.trim()) return;
    setCreateLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.createProject(projectName, projectDesc);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      createProjectSheetRef.current?.close();
      setProjectName('');
      setProjectDesc('');
      refetch();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setCreateLoading(false);
    }
  };

  if (loading && !isRefetching) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.text} />
      </View>
    );
  }

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
        <Text style={[styles.headerTitle, { color: colors.text }]}>Projects</Text>
        
        {/* Create Project Button */}
        <TouchableOpacity 
          style={[styles.createBtn, { backgroundColor: colors.card, borderColor: colors.border }]} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            createProjectSheetRef.current?.open();
          }}
        >
          <Ionicons name="add" size={24} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Projects List */}
      <ScrollView 
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={handleRefresh} tintColor={colors.text} />
        }
      >
        {projects.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No namespaces found on this server.</Text>
          </View>
        ) : (
          projects.map((project: any) => {
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
                style={[styles.projectCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleProjectPress(project)}
              >
                <View style={styles.projectCardInfo}>
                  <Text style={[styles.projectName, { color: colors.text }]}>{project.name}</Text>
                  {project.description ? (
                    <Text style={[styles.projectDesc, { color: colors.textSecondary }]} numberOfLines={1}>
                      {project.description}
                    </Text>
                  ) : null}
                  <Text style={[styles.projectSummary, { color: colors.activeTint }]}>
                    {summaryString}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Project Creation Sheet Form */}
      <BottomSheet ref={createProjectSheetRef} onClose={() => {
        setProjectName('');
        setProjectDesc('');
      }}>
        <View style={styles.modalContent}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Create Project</Text>
          <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>Add a new project namespace to Dokploy</Text>

          <TextInput
            style={[styles.modalInput, { backgroundColor: colors.inputBg, color: colors.inputText, borderColor: colors.inputBorder }]}
            placeholder="Project Name"
            placeholderTextColor={colors.textSecondary}
            value={projectName}
            onChangeText={setProjectName}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={[
              styles.modalInput, 
              { 
                backgroundColor: colors.inputBg, 
                color: colors.inputText, 
                borderColor: colors.inputBorder,
                height: 80,
                textAlignVertical: 'top',
                paddingTop: 12
              }
            ]}
            placeholder="Description (optional)"
            placeholderTextColor={colors.textSecondary}
            value={projectDesc}
            onChangeText={setProjectDesc}
            multiline
            autoCapitalize="sentences"
          />

          <TouchableOpacity 
            style={[styles.modalSubmitBtn, { backgroundColor: colors.activeTint }, createLoading && styles.disabledBtn]}
            onPress={handleCreateProject}
            disabled={createLoading}
          >
            {createLoading ? (
              <ActivityIndicator size="small" color={theme === 'dark' ? '#000000' : '#ffffff'} />
            ) : (
              <Text style={[styles.modalSubmitText, { color: theme === 'dark' ? '#000000' : '#ffffff' }]}>Create Namespace</Text>
            )}
          </TouchableOpacity>
        </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backBtn: {
    marginRight: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    flex: 1,
  },
  createBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  projectCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  projectCardInfo: {
    flex: 1,
    marginRight: 16,
  },
  projectName: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  projectDesc: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  projectSummary: {
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
  modalContent: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 24,
  },
  modalInput: {
    height: 52,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontSize: 15,
  },
  modalSubmitBtn: {
    height: 52,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  modalSubmitText: {
    fontWeight: '700',
    fontSize: 16,
  },
  disabledBtn: {
    opacity: 0.7,
  }
});
