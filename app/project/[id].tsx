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
import { api, Application, Database } from '../../src/services/api';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/theme/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function ProjectDetailsScreen() {
  const { id, name, description, apps, dbs, composes } = useLocalSearchParams<{
    id: string;
    name: string;
    description: string;
    apps: string;
    dbs: string;
    composes: string;
  }>();

  const router = useRouter();
  const { colors } = useTheme();
  
  const parsedApps: Application[] = apps ? JSON.parse(apps) : [];
  const parsedDbs: Database[] = dbs ? JSON.parse(dbs) : [];
  const parsedComposes: any[] = composes ? JSON.parse(composes) : [];

  const handleComposePress = (comp: any) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: `/compose/${comp.id}`,
      params: {
        name: comp.name,
        status: comp.status,
        projectId: id,
        projectName: name
      }
    });
  };

  const handleAppPress = (app: Application) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: `/application/${app.id}`,
      params: {
        name: app.name,
        status: app.status,
        projectId: id,
        projectName: name
      }
    });
  };

  const handleDbPress = (db: Database) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: `/database/${db.id}`,
      params: {
        name: db.name,
        status: db.status,
        dbType: db.type,
        projectId: id,
        projectName: name
      }
    });
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.back();
        }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{name}</Text>
      </View>

      <ScrollView style={styles.scroll}>
        {description ? (
          <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.descLabel, { color: colors.textSecondary }]}>Description</Text>
            <Text style={[styles.descText, { color: colors.text }]}>{description}</Text>
          </View>
        ) : null}

        {/* Applications */}
        {parsedApps.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Applications</Text>
            {parsedApps.map((app) => (
              <TouchableOpacity 
                key={app.id} 
                style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleAppPress(app)}
              >
                <View style={styles.itemCardInfo}>
                  <Text style={[styles.itemName, { color: colors.text }]}>{app.name}</Text>
                  <Text style={[styles.itemSub, { color: colors.textSecondary }]}>Application</Text>
                </View>
                <View style={[styles.statusDot, { backgroundColor: app.status === 'running' ? colors.statusRunning : colors.statusStopped }]} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Compose Stacks */}
        {parsedComposes.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: parsedApps.length > 0 ? 24 : 0 }]}>Compose Stacks</Text>
            {parsedComposes.map((comp) => (
              <TouchableOpacity 
                key={comp.id} 
                style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleComposePress(comp)}
              >
                <View style={styles.itemCardInfo}>
                  <Text style={[styles.itemName, { color: colors.text }]}>{comp.name}</Text>
                  <Text style={[styles.itemSub, { color: colors.textSecondary }]}>Docker Compose</Text>
                </View>
                <View style={[styles.statusDot, { backgroundColor: comp.status === 'running' ? colors.statusRunning : colors.statusStopped }]} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {/* Databases */}
        {parsedDbs.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text, marginTop: 24 }]}>Databases</Text>
            {parsedDbs.map((db) => (
              <TouchableOpacity 
                key={db.id} 
                style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => handleDbPress(db)}
              >
                <View style={styles.itemCardInfo}>
                  <Text style={[styles.itemName, { color: colors.text }]}>{db.name}</Text>
                  <Text style={[styles.itemSub, { color: colors.textSecondary }]}>
                    {db.type ? db.type.toUpperCase() : 'MANAGED'} Database
                  </Text>
                </View>
                <View style={[styles.statusDot, { backgroundColor: db.status === 'running' ? colors.statusRunning : colors.statusStopped }]} />
              </TouchableOpacity>
            ))}
          </>
        )}

        {parsedApps.length === 0 && parsedComposes.length === 0 && parsedDbs.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No resources found in this project.</Text>
          </View>
        )}
      </ScrollView>
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
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  descCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 24,
  },
  descLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  descText: {
    fontSize: 15,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  itemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
  },
  itemCardInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  itemSub: {
    fontSize: 12,
    fontWeight: '500',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
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
    marginBottom: 24,
  },
  sheetLoader: {
    alignItems: 'center',
    marginVertical: 16,
  },
  loaderText: {
    marginTop: 8,
    fontSize: 14,
  },
  controlGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  controlBtn: {
    width: '48%',
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  deployBtn: {},
  btnText: {
    fontWeight: '700',
    fontSize: 15,
  },
  logsHeader: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
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
  },
});
