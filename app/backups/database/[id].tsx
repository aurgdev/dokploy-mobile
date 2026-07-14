import React, { useState, useRef } from 'react';
import { 
  ScrollView, 
  StyleSheet, 
  Text, 
  TouchableOpacity, 
  View, 
  ActivityIndicator, 
  Alert,
  Switch,
  TextInput
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../../src/theme/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetRef } from '../../../src/components/BottomSheet';
import { 
  useDatabaseBackups, 
  useBackupFiles, 
  useDestinationDetails, 
  useRunDatabaseBackup,
  useSafeDestinations,
  useCreateBackup,
  useUpdateBackup
} from '../../../src/features/backups/backup.queries';
import { getBackupHealthSummary, sortBackupFiles } from '../../../src/features/backups/backup.health';
import { buildBackupFileSearch } from '../../../src/features/backups/backup.parser';
import { buildCreateBackupPayload, buildUpdateBackupPayload } from '../../../src/features/backups/backup.payload';
import { DatabaseBackupConfig, BackupFile } from '../../../src/features/backups/backup.types';

// Helper to check for conservative human-readable schedule
function getHumanSchedule(cron: string): string | null {
  const trimmed = cron.trim().replace(/\s+/g, ' ');
  if (trimmed === '0 0 * * *') return 'Every day at midnight';
  if (trimmed === '0 2 * * *') return 'Every day at 02:00';
  if (trimmed === '0 */6 * * *') return 'Every 6 hours';
  if (trimmed === '0 */12 * * *') return 'Every 12 hours';
  if (trimmed === '0 0 * * 0') return 'Every Sunday at midnight';
  return null;
}

// Format bytes helper
function formatBytes(bytes: number | null): string {
  if (bytes === null || isNaN(bytes)) return 'Unknown size';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Relative time helper
function getRelativeAge(dateStr: string | null): string {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// Format file date cleanly
function formatFileDate(file: BackupFile): string {
  if (!file.lastModifiedAt) {
    return 'Timestamp unavailable';
  }
  const relative = getRelativeAge(file.lastModifiedAt);
  const local = new Date(file.lastModifiedAt).toLocaleDateString();
  return `${relative} (${local})`;
}

// Form field validators
function validateCronExpression(cron: string): string | null {
  const trimmed = cron.trim();
  if (!trimmed) {
    return 'Schedule is required';
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length !== 5) {
    return 'Cron expression must have exactly 5 fields (e.g. * * * * *)';
  }
  if (/[^0-9a-zA-Z,\-\*\/\s]/g.test(trimmed)) {
    return 'Cron expression contains invalid characters';
  }
  return null;
}

function validatePrefix(prefix: string): string | null {
  const trimmed = prefix.trim();
  if (!trimmed) {
    return 'Prefix is required';
  }
  if (trimmed.includes('..')) {
    return 'Path traversal (..) is not allowed';
  }
  if (/@/.test(trimmed) || (/:/.test(trimmed) && trimmed.includes('@'))) {
    return 'Embedded credentials are not allowed';
  }
  if (/[\x00-\x1F\x7F]/.test(trimmed)) {
    return 'Prefix contains control characters';
  }
  return null;
}

export default function DatabaseBackupsScreen() {
  const { id, dbType, name, projectName } = useLocalSearchParams<{
    id: string;
    dbType: string;
    name: string;
    projectName: string;
  }>();

  const router = useRouter();
  const { colors } = useTheme();
  
  // Refetch key state to force a query update manually
  const [manualRefreshTrigger, setManualRefreshTrigger] = useState(0);

  // Form Bottom Sheet Ref
  const formSheetRef = useRef<BottomSheetRef>(null);

  // Queries
  const isBackupSupported = dbType === 'postgres' || dbType === 'mysql' || dbType === 'mariadb' || dbType === 'mongo';
  
  const { 
    data: backups, 
    isLoading: isBackupsLoading, 
    error: backupsError,
    refetch: refetchBackups
  } = useDatabaseBackups(
    id || '',
    isBackupSupported ? (dbType || '') : ''
  );

  const { data: destinations, isLoading: isDestinationsLoading } = useSafeDestinations();

  const createMutation = useCreateBackup(id || '', dbType || '');
  const updateMutation = useUpdateBackup(id || '', dbType || '');

  // Form State
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingConfig, setEditingConfig] = useState<DatabaseBackupConfig | null>(null);

  const [formEnabled, setFormEnabled] = useState(true);
  const [formSchedule, setFormSchedule] = useState('0 0 * * *');
  const [formPreset, setFormPreset] = useState('0 0 * * *');
  const [formDestinationId, setFormDestinationId] = useState('');
  const [formPrefix, setFormPrefix] = useState('');
  const [formRetentionType, setFormRetentionType] = useState<'unlimited' | '3' | '5' | '7' | '14' | 'custom'>('unlimited');
  const [formCustomRetention, setFormCustomRetention] = useState('');

  const [formErrors, setFormErrors] = useState<{
    schedule?: string;
    destination?: string;
    prefix?: string;
    retention?: string;
  }>({});

  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  const handleRefreshAll = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refetchBackups();
    setManualRefreshTrigger(prev => prev + 1);
  };

  const openCreateSheet = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFormMode('create');
    setEditingConfig(null);
    setFormEnabled(true);
    setFormSchedule('0 0 * * *');
    setFormPreset('0 0 * * *');
    setFormDestinationId(destinations && destinations.length > 0 ? destinations[0].destinationId : '');
    setFormPrefix(name ? `${name}-backup` : '');
    setFormRetentionType('unlimited');
    setFormCustomRetention('');
    setFormErrors({});
    formSheetRef.current?.open();
  };

  const openEditSheet = (config: DatabaseBackupConfig) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFormMode('edit');
    setEditingConfig(config);
    setFormEnabled(config.enabled ?? true);
    setFormSchedule(config.schedule);
    
    const trimmedCron = config.schedule.trim().replace(/\s+/g, ' ');
    if (['0 0 * * *', '0 2 * * *', '0 */6 * * *', '0 */12 * * *', '0 0 * * 0'].includes(trimmedCron)) {
      setFormPreset(trimmedCron);
    } else {
      setFormPreset('custom');
    }
    
    setFormDestinationId(config.destinationId);
    setFormPrefix(config.prefix);
    
    if (config.keepLatestCount === null) {
      setFormRetentionType('unlimited');
      setFormCustomRetention('');
    } else if ([3, 5, 7, 14].includes(config.keepLatestCount)) {
      setFormRetentionType(String(config.keepLatestCount) as any);
      setFormCustomRetention('');
    } else {
      setFormRetentionType('custom');
      setFormCustomRetention(String(config.keepLatestCount));
    }
    
    setFormErrors({});
    formSheetRef.current?.open();
  };

  const handleFormSubmit = async () => {
    if (isSubmittingForm) return;

    // 1. Validate Form
    const errors: any = {};
    const cronErr = validateCronExpression(formSchedule);
    if (cronErr) errors.schedule = cronErr;

    const prefixErr = validatePrefix(formPrefix);
    if (prefixErr) errors.prefix = prefixErr;

    if (!formDestinationId) {
      errors.destination = 'Destination is required';
    }

    let parsedRetention: number | null = null;
    if (formRetentionType === 'unlimited') {
      parsedRetention = null;
    } else if (['3', '5', '7', '14'].includes(formRetentionType)) {
      parsedRetention = parseInt(formRetentionType, 10);
    } else if (formRetentionType === 'custom') {
      const val = parseInt(formCustomRetention, 10);
      if (isNaN(val) || val <= 0 || val > 1000) {
        errors.retention = 'Retention limit must be between 1 and 1000';
      } else {
        parsedRetention = val;
      }
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    setFormErrors({});

    const destName = destinations?.find(d => d.destinationId === formDestinationId)?.name || formDestinationId;
    const isCreate = formMode === 'create';

    Alert.alert(
      isCreate ? 'Create Backup Plan' : 'Update Backup Plan',
      `Please confirm the plan details:\n\nSchedule: ${formSchedule}\nDestination: ${destName}\nPrefix: ${formPrefix}\nRetention: ${parsedRetention !== null ? parsedRetention : 'Unlimited'}\nStatus: ${formEnabled ? 'Enabled' : 'Disabled'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isCreate ? 'Create' : 'Save Changes',
          onPress: async () => {
            setIsSubmittingForm(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              if (isCreate) {
                const payload = buildCreateBackupPayload({
                  databaseId: id || '',
                  databaseType: dbType as any,
                  databaseName: name || '',
                  form: {
                    schedule: formSchedule,
                    enabled: formEnabled,
                    prefix: formPrefix,
                    destinationId: formDestinationId,
                    keepLatestCount: parsedRetention,
                  }
                });
                await createMutation.mutateAsync(payload);
                Alert.alert('Success', 'Backup plan created successfully.');
              } else {
                if (!editingConfig) return;
                const payload = buildUpdateBackupPayload({
                  backup: editingConfig,
                  form: {
                    schedule: formSchedule,
                    enabled: formEnabled,
                    prefix: formPrefix,
                    destinationId: formDestinationId,
                    keepLatestCount: parsedRetention,
                  }
                });
                await updateMutation.mutateAsync(payload);
                Alert.alert('Success', 'Backup plan updated successfully.');
              }
              formSheetRef.current?.close();
            } catch (err: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Error', err?.message || 'Failed to save backup plan.');
            } finally {
              setIsSubmittingForm(false);
            }
          }
        }
      ]
    );
  };

  if (dbType === 'redis') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerSubTitle, { color: colors.textSecondary }]}>
              {projectName} • Redis
            </Text>
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
              {name}
            </Text>
          </View>
        </View>

        <View style={styles.redisCardContainer}>
          <View style={[styles.redisWarningCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="warning" size={32} color={colors.statusStopped} style={{ marginBottom: 12 }} />
            <Text style={[styles.redisWarningTitle, { color: colors.text }]}>Redis Backups Unsupported</Text>
            <Text style={[styles.redisWarningText, { color: colors.textSecondary }]}>
              Native database backups are not available for Redis through this Dokploy API. Use a Docker volume backup when the data is stored in a named volume.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const appName = backups?.[0]?.appName || name || 'database';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.back();
        }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerSubTitle, { color: colors.textSecondary }]}>
            {projectName} • {dbType?.toUpperCase() || 'DB'} BACKUPS
          </Text>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{name}</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={handleRefreshAll}>
          <Ionicons name="refresh" size={22} color={colors.text} />
        </TouchableOpacity>
        {backups && backups.length > 0 && (
          <TouchableOpacity style={[styles.refreshBtn, { marginLeft: 8 }]} onPress={openCreateSheet}>
            <Ionicons name="add" size={24} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {isBackupsLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={colors.text} />
            <Text style={[styles.loaderText, { color: colors.textSecondary }]}>Loading backup plans...</Text>
          </View>
        ) : backupsError ? (
          <View style={[styles.errorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="alert-circle" size={28} color={colors.statusStopped} style={{ marginBottom: 8 }} />
            <Text style={[styles.errorTitle, { color: colors.text }]}>Failed to load backups</Text>
            <Text style={[styles.errorText, { color: colors.textSecondary }]}>
              {(backupsError as any).message || 'An unexpected error occurred while querying the server.'}
            </Text>
          </View>
        ) : !backups || backups.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="cloud-offline" size={32} color={colors.textSecondary} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No backup plan configured</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary, marginBottom: 16 }]}>
              There are no backup plans configured for this database.
            </Text>
            <TouchableOpacity 
              style={[styles.primaryActionBtn, { backgroundColor: colors.activeTint }]}
              onPress={openCreateSheet}
            >
              <Text style={styles.primaryActionBtnText}>Create Backup Plan</Text>
            </TouchableOpacity>
          </View>
        ) : (
          backups.map(config => (
            <BackupConfigCard 
              key={config.backupId}
              config={config} 
              dbName={name || ''}
              dbType={dbType || ''}
              manualRefreshTrigger={manualRefreshTrigger}
              onEdit={openEditSheet}
            />
          ))
        )}
      </ScrollView>

      {/* Create / Edit Form Bottom Sheet */}
      <BottomSheet ref={formSheetRef}>
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContainer}>
          <Text style={[styles.formTitle, { color: colors.text }]}>
            {formMode === 'create' ? 'Create Backup Plan' : 'Edit Backup Plan'}
          </Text>

          {/* Enabled Toggle */}
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.switchTitle, { color: colors.text }]}>Enabled</Text>
              <Text style={[styles.switchDesc, { color: colors.textSecondary }]}>
                {formEnabled 
                  ? 'Scheduled backups will run according to this cron schedule.' 
                  : 'The plan remains configured, but scheduled backups will not run.'}
              </Text>
            </View>
            <Switch
              value={formEnabled}
              onValueChange={setFormEnabled}
              trackColor={{ false: colors.border, true: colors.activeTint }}
              thumbColor={formEnabled ? '#ffffff' : '#f4f3f4'}
            />
          </View>

          {/* Schedule Preset Pickers */}
          <View style={styles.inputGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Schedule Presets</Text>
            <View style={styles.presetsContainer}>
              {[
                { label: 'Midnight', cron: '0 0 * * *' },
                { label: '02:00 AM', cron: '0 2 * * *' },
                { label: 'Every 6h', cron: '0 */6 * * *' },
                { label: 'Every 12h', cron: '0 */12 * * *' },
                { label: 'Weekly Sun', cron: '0 0 * * 0' },
                { label: 'Custom', cron: 'custom' },
              ].map(item => {
                const isSelected = formPreset === item.cron;
                return (
                  <TouchableOpacity
                    key={item.cron}
                    style={[
                      styles.presetBadge,
                      { borderColor: isSelected ? colors.activeTint : colors.border },
                      isSelected && { backgroundColor: colors.activeTint }
                    ]}
                    onPress={() => {
                      setFormPreset(item.cron);
                      if (item.cron !== 'custom') {
                        setFormSchedule(item.cron);
                      }
                    }}
                  >
                    <Text style={[
                      styles.presetBadgeText,
                      { color: isSelected ? '#ffffff' : colors.text }
                    ]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Custom Cron Input */}
          {formPreset === 'custom' && (
            <View style={styles.inputGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Cron Expression (5 fields)</Text>
              <TextInput
                style={[
                  styles.textInput,
                  { color: colors.text, borderColor: formErrors.schedule ? colors.statusStopped : colors.border }
                ]}
                value={formSchedule}
                onChangeText={setFormSchedule}
                placeholder="e.g. 0 0 * * *"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {formErrors.schedule && <Text style={styles.fieldError}>{formErrors.schedule}</Text>}
            </View>
          )}

          {/* Safe Destinations list */}
          <View style={styles.inputGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Destination</Text>
            {isDestinationsLoading ? (
              <ActivityIndicator size="small" color={colors.text} style={{ marginVertical: 12 }} />
            ) : !destinations || destinations.length === 0 ? (
              <Text style={[styles.emptyDestText, { color: colors.statusStopped }]}>
                No backup destinations configured. Add one from the Dokploy web dashboard.
              </Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                {destinations.map(d => {
                  const isSelected = formDestinationId === d.destinationId;
                  return (
                    <TouchableOpacity
                      key={d.destinationId}
                      style={[
                        styles.destCard,
                        { borderColor: isSelected ? colors.activeTint : colors.border, backgroundColor: colors.card }
                      ]}
                      onPress={() => setFormDestinationId(d.destinationId)}
                    >
                      <Ionicons name="cloud-upload" size={16} color={isSelected ? colors.activeTint : colors.textSecondary} />
                      <Text style={[styles.destCardName, { color: colors.text }]} numberOfLines={1}>
                        {d.name || 'Unnamed'}
                      </Text>
                      <Text style={[styles.destCardDetails, { color: colors.textSecondary }]} numberOfLines={1}>
                        {d.provider || 'S3'} • {d.bucket || 'N/A'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            {formErrors.destination && <Text style={styles.fieldError}>{formErrors.destination}</Text>}
          </View>

          {/* Prefix Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Prefix</Text>
            <TextInput
              style={[
                styles.textInput,
                { color: colors.text, borderColor: formErrors.prefix ? colors.statusStopped : colors.border }
              ]}
              value={formPrefix}
              onChangeText={setFormPrefix}
              placeholder="e.g. backup-prefix"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {formErrors.prefix && <Text style={styles.fieldError}>{formErrors.prefix}</Text>}
            <Text style={[styles.prefixPreview, { color: colors.textSecondary }]}>
              Storage path preview: {appName}/{formPrefix ? `${formPrefix.trim()}/` : ''}
            </Text>
          </View>

          {/* Retention Options */}
          <View style={styles.inputGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Retention Policy</Text>
            <View style={styles.presetsContainer}>
              {[
                { label: 'Unlimited', value: 'unlimited' },
                { label: 'Keep 3', value: '3' },
                { label: 'Keep 5', value: '5' },
                { label: 'Keep 7', value: '7' },
                { label: 'Keep 14', value: '14' },
                { label: 'Custom', value: 'custom' },
              ].map(item => {
                const isSelected = formRetentionType === item.value;
                return (
                  <TouchableOpacity
                    key={item.value}
                    style={[
                      styles.presetBadge,
                      { borderColor: isSelected ? colors.activeTint : colors.border },
                      isSelected && { backgroundColor: colors.activeTint }
                    ]}
                    onPress={() => setFormRetentionType(item.value as any)}
                  >
                    <Text style={[
                      styles.presetBadgeText,
                      { color: isSelected ? '#ffffff' : colors.text }
                    ]}>
                      {item.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 8 }}>
              Retention removes older files beyond the selected count.
            </Text>
          </View>

          {formRetentionType === 'custom' && (
            <View style={styles.inputGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Custom Retention Count</Text>
              <TextInput
                style={[
                  styles.textInput,
                  { color: colors.text, borderColor: formErrors.retention ? colors.statusStopped : colors.border }
                ]}
                value={formCustomRetention}
                onChangeText={setFormCustomRetention}
                placeholder="e.g. 10"
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
              />
              {formErrors.retention && <Text style={styles.fieldError}>{formErrors.retention}</Text>}
            </View>
          )}

          {/* Read-Only Database Info Context */}
          <View style={[styles.confirmCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 8 }]}>Database Target Context</Text>
            <View style={styles.confirmRow}>
              <Text style={[styles.confirmLabel, { color: colors.textSecondary }]}>Database Name</Text>
              <Text style={[styles.confirmValue, { color: colors.text }]}>{name}</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={[styles.confirmLabel, { color: colors.textSecondary }]}>Database Type</Text>
              <Text style={[styles.confirmValue, { color: colors.text }]}>{dbType?.toUpperCase()}</Text>
            </View>
          </View>

          {/* Form Action Buttons */}
          <View style={styles.formActions}>
            <TouchableOpacity 
              style={[styles.formBtn, { borderWidth: 1, borderColor: colors.border }]} 
              onPress={() => formSheetRef.current?.close()}
              disabled={isSubmittingForm}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.formBtn, { backgroundColor: colors.activeTint }]} 
              onPress={handleFormSubmit}
              disabled={isSubmittingForm || (destinations && destinations.length === 0)}
            >
              {isSubmittingForm ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={{ color: '#ffffff', fontWeight: '700' }}>
                  {formMode === 'create' ? 'Create Plan' : 'Save Changes'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </BottomSheet>
    </SafeAreaView>
  );
}

// Configured Backup Card Component
function BackupConfigCard({ 
  config, 
  dbName, 
  dbType,
  manualRefreshTrigger,
  onEdit
}: { 
  config: DatabaseBackupConfig;
  dbName: string;
  dbType: string;
  manualRefreshTrigger: number;
  onEdit: (config: DatabaseBackupConfig) => void;
}) {
  const { colors } = useTheme();
  
  // Destination details
  const { 
    data: destination, 
    error: destError 
  } = useDestinationDetails(config.destinationId);

  // Build the correct S3 search prefix
  const searchPrefix = buildBackupFileSearch(config);

  // Backup files list
  const { 
    data: files, 
    isLoading: isFilesLoading, 
    error: filesError,
    refetch: refetchFiles
  } = useBackupFiles(
    config.backupId,
    config.destinationId,
    searchPrefix,
    config.serverId
  );

  // Manual Backup Mutation
  const runBackupMutation = useRunDatabaseBackup(dbType, config.destinationId, searchPrefix);

  const [isRunningBackup, setIsRunningBackup] = useState(false);
  const [selectedBackupFiles, setSelectedBackupFiles] = useState<BackupFile[] | null>(null);
  const sheetRef = useRef<BottomSheetRef>(null);
  const confirmSheetRef = useRef<BottomSheetRef>(null);

  // Refresh files list if manual trigger is updated
  React.useEffect(() => {
    refetchFiles();
  }, [manualRefreshTrigger]);

  const destinationName = destination 
    ? destination.name || 'Destination configured'
    : `ID: ${config.destinationId.substring(0, 8)}...`;

  const health = getBackupHealthSummary(config, files, isFilesLoading, filesError, destination, destError);

  const handleRunBackup = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    confirmSheetRef.current?.open();
  };

  const executeBackup = async () => {
    if (isRunningBackup) return;
    setIsRunningBackup(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const response = await runBackupMutation.mutateAsync({ backupId: config.backupId });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      const isCompleted = response && (response.status === 'completed' || response.success === true);
      
      confirmSheetRef.current?.close();

      Alert.alert(
        'Backup Status',
        isCompleted ? 'Backup completed successfully.' : 'Backup request accepted.'
      );
      
      setTimeout(() => {
        refetchFiles();
      }, 3000);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Backup Failed', err.message || 'An error occurred triggering the backup.');
    } finally {
      setIsRunningBackup(false);
    }
  };

  const openFilesDrawer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedBackupFiles(files || []);
    sheetRef.current?.open();
  };

  const humanSchedule = getHumanSchedule(config.schedule);

  // Sort files for finding latest, matching rules
  const latestFile = files && files.length > 0 
    ? sortBackupFiles(files)[0] 
    : null;

  // Map severity string to color safely
  let severityColor = colors.inactiveTint;
  if (health.severity === 'success') {
    severityColor = colors.statusRunning;
  } else if (health.severity === 'warning') {
    severityColor = '#ff9500'; // Orange
  } else if (health.severity === 'error') {
    severityColor = colors.statusStopped;
  }

  // Format retention count text exactly
  let retentionText = 'Unlimited';
  if (config.keepLatestCount === 0) {
    retentionText = 'Retention: 0';
  } else if (config.keepLatestCount !== null && config.keepLatestCount > 0) {
    retentionText = `Keep latest ${config.keepLatestCount}`;
  }

  // Map files listing errors to specific user-friendly statements
  let filesErrorMessage = 'Failed to list backup files.';
  if (filesError) {
    const code = (filesError as any).code;
    const status = (filesError as any).status;
    if (code === 'TIMEOUT') {
      filesErrorMessage = 'The destination took too long to respond.';
    } else if (code === 'OFFLINE') {
      filesErrorMessage = 'You are offline.';
    } else if (code === 'INVALID_RESPONSE') {
      filesErrorMessage = 'Dokploy returned an unsupported file-list format.';
    } else if (status === 400) {
      filesErrorMessage = 'The file search request was rejected. Check the backup prefix.';
    } else if (status === 401) {
      filesErrorMessage = 'Invalid API key.';
    } else if (status === 403) {
      filesErrorMessage = 'You do not have permission to list backup files.';
    } else if (status === 404) {
      filesErrorMessage = 'The destination or backup location was not found.';
    } else if (status >= 500) {
      filesErrorMessage = 'Dokploy could not list files from this destination.';
    }
  }

  const sortedFilesForDrawer = selectedBackupFiles ? sortBackupFiles(selectedBackupFiles) : [];

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header Info */}
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Backup Plan</Text>
          <Text style={[styles.cardSubText, { color: colors.textSecondary }]}>
            ID: {config.backupId.substring(0, 8)}...
          </Text>
        </View>
        <View style={[
          styles.badge, 
          { backgroundColor: config.enabled ? 'rgba(76, 175, 80, 0.12)' : 'rgba(255, 149, 0, 0.12)' }
        ]}>
          <Text style={[
            styles.badgeText, 
            { color: config.enabled ? colors.statusRunning : '#ff9500' }
          ]}>
            {config.enabled ? 'ENABLED' : 'DISABLED'}
          </Text>
        </View>
      </View>

      {/* Schedule Info */}
      <View style={styles.infoRow}>
        <Ionicons name="time-outline" size={18} color={colors.textSecondary} style={styles.infoIcon} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Schedule</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>{config.schedule}</Text>
          {humanSchedule && (
            <Text style={[styles.infoSubText, { color: colors.textSecondary }]}>{humanSchedule}</Text>
          )}
        </View>
      </View>

      {/* Destination Info */}
      <View style={styles.infoRow}>
        <Ionicons name="cloud-upload-outline" size={18} color={colors.textSecondary} style={styles.infoIcon} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Destination</Text>
          <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={1}>
            {destinationName}
          </Text>
          {destError ? (
            <Text style={[styles.infoSubText, { color: colors.textSecondary }]}>
              Destination configured
            </Text>
          ) : destination ? (
            <Text style={[styles.infoSubText, { color: colors.textSecondary }]}>
              Bucket: {destination.bucket || 'N/A'} • Provider: {destination.provider || 'N/A'}
            </Text>
          ) : (
            <Text style={[styles.infoSubText, { color: colors.textSecondary }]}>Loading destination details...</Text>
          )}
        </View>
      </View>

      {/* Prefix / Retention Info */}
      <View style={styles.detailsGrid}>
        <View style={styles.gridCol}>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Prefix</Text>
          <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={1}>
            {config.prefix || '(None)'}
          </Text>
        </View>
        <View style={styles.gridCol}>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Retention Limit</Text>
          <Text style={[styles.infoValue, { color: colors.text }]}>
            {retentionText}
          </Text>
        </View>
      </View>

      {/* Health Status Block */}
      <View style={[styles.healthBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
        <View style={styles.healthHeader}>
          <View style={[styles.healthDot, { backgroundColor: severityColor }]} />
          <Text style={[styles.healthLabel, { color: colors.text }]}>{health.label}</Text>
        </View>
        <Text style={[styles.healthDesc, { color: colors.textSecondary }]}>{health.description}</Text>
      </View>

      {/* Latest backup file details */}
      {latestFile && (
        <View style={styles.latestFileBlock}>
          <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Latest Backup File</Text>
          <Text style={[styles.latestFileName, { color: colors.text }]} numberOfLines={1}>
            {latestFile.name}
          </Text>
          <Text style={[styles.latestFileDetails, { color: colors.textSecondary }]}>
            Size: {formatBytes(latestFile.sizeBytes)} • Age: {latestFile.lastModifiedAt ? getRelativeAge(latestFile.lastModifiedAt) : 'Timestamp unavailable'}
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionGrid}>
        <TouchableOpacity 
          style={[styles.actionBtn, { width: '31%', backgroundColor: colors.card, borderColor: colors.border }]} 
          onPress={() => onEdit(config)}
        >
          <Ionicons name="create-outline" size={16} color={colors.text} style={{ marginRight: 4 }} />
          <Text style={[styles.actionBtnText, { color: colors.text, fontSize: 12 }]}>Edit Plan</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionBtn, { width: '31%', backgroundColor: colors.card, borderColor: colors.border }]} 
          onPress={openFilesDrawer}
        >
          <Ionicons name="list" size={16} color={colors.text} style={{ marginRight: 4 }} />
          <Text style={[styles.actionBtnText, { color: colors.text, fontSize: 12 }]}>Recent</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[
            styles.actionBtn, 
            styles.runBtn, 
            { 
              width: '31%',
              backgroundColor: colors.activeTint, 
              borderColor: colors.activeTint,
              opacity: isRunningBackup ? 0.6 : 1 
            }
          ]} 
          onPress={handleRunBackup}
          disabled={isRunningBackup}
        >
          {isRunningBackup ? (
            <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 4 }} />
          ) : (
            <Ionicons name="play-circle-outline" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
          )}
          <Text style={[styles.runBtnText, { fontSize: 12 }]}>Run</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Files Drawer Bottom Sheet */}
      <BottomSheet ref={sheetRef}>
        <View style={styles.sheetContent}>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>Recent Backups</Text>
          <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
            {destinationName} • Prefix: {config.prefix}
          </Text>
          
          {isFilesLoading ? (
            <View style={styles.sheetLoader}>
              <ActivityIndicator size="large" color={colors.text} />
              <Text style={[styles.loaderText, { color: colors.textSecondary }]}>Fetching files list...</Text>
            </View>
          ) : filesError ? (
            <View style={styles.sheetError}>
              <Ionicons name="alert-circle" size={24} color={colors.statusStopped} style={{ marginBottom: 6 }} />
              <Text style={[styles.errorText, { color: colors.textSecondary, marginBottom: 12 }]}>
                {filesErrorMessage}
              </Text>
              <TouchableOpacity 
                style={[styles.retryBtn, { borderColor: colors.border }]} 
                onPress={() => refetchFiles()}
              >
                <Text style={[styles.retryText, { color: colors.text }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : !selectedBackupFiles || selectedBackupFiles.length === 0 ? (
            <View style={styles.sheetEmpty}>
              <Ionicons name="folder-open" size={28} color={colors.textSecondary} style={{ marginBottom: 6 }} />
              <Text style={[styles.errorText, { color: colors.textSecondary }]}>
                No backup files found.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.filesScroll}>
              {sortedFilesForDrawer.slice(0, 10).map((file, idx) => (
                <View 
                  key={file.key || file.name || idx} 
                  style={[styles.fileRow, { borderBottomColor: colors.border }]}
                >
                  <Ionicons name="document-outline" size={18} color={colors.textSecondary} style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                      {file.name}
                    </Text>
                    <Text style={[styles.fileMetadata, { color: colors.textSecondary }]}>
                      Size: {formatBytes(file.sizeBytes)} • {formatFileDate(file)}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </BottomSheet>

      {/* Run Backup Confirmation Bottom Sheet */}
      <BottomSheet ref={confirmSheetRef}>
        <View style={[styles.confirmSheetContent, { paddingBottom: 24 }]}>
          <Text style={[styles.confirmSheetTitle, { color: colors.text }]}>Confirm Backup</Text>
          
          <View style={[styles.confirmCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.confirmRow}>
              <Text style={[styles.confirmLabel, { color: colors.textSecondary }]}>Database</Text>
              <Text style={[styles.confirmValue, { color: colors.text }]}>{dbName}</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={[styles.confirmLabel, { color: colors.textSecondary }]}>Type</Text>
              <Text style={[styles.confirmValue, { color: colors.text }]}>{dbType.toUpperCase()}</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={[styles.confirmLabel, { color: colors.textSecondary }]}>Destination</Text>
              <Text style={[styles.confirmValue, { color: colors.text }]} numberOfLines={1}>{destinationName}</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={[styles.confirmLabel, { color: colors.textSecondary }]}>Prefix</Text>
              <Text style={[styles.confirmValue, { color: colors.text }]} numberOfLines={1}>{config.prefix || '(None)'}</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={[styles.confirmLabel, { color: colors.textSecondary }]}>Schedule</Text>
              <Text style={[styles.confirmValue, { color: colors.text }]}>{config.schedule}</Text>
            </View>
          </View>

          <View style={[styles.warningBlock, { backgroundColor: 'rgba(255, 149, 0, 0.12)', borderColor: 'rgba(255, 149, 0, 0.3)' }]}>
            <Ionicons name="warning-outline" size={18} color="#ff9500" style={{ marginRight: 8 }} />
            <Text style={[styles.warningText, { color: colors.text }]}>
              This may temporarily use CPU, disk, and network resources.
            </Text>
          </View>

          {isRunningBackup && (
            <View style={styles.progressContainer}>
              <ActivityIndicator size="small" color={colors.activeTint} style={{ marginRight: 8 }} />
              <Text style={[styles.progressText, { color: colors.textSecondary }]}>Submitting backup request...</Text>
            </View>
          )}

          <View style={styles.confirmActions}>
            <TouchableOpacity 
              style={[styles.confirmBtn, styles.cancelBtn, { borderColor: colors.border }]} 
              onPress={() => confirmSheetRef.current?.close()}
              disabled={isRunningBackup}
            >
              <Text style={[styles.cancelBtnText, { color: colors.text }]}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[
                styles.confirmBtn, 
                styles.executeBtn, 
                { 
                  backgroundColor: colors.activeTint, 
                  opacity: isRunningBackup ? 0.6 : 1 
                }
              ]} 
              onPress={executeBackup}
              disabled={isRunningBackup}
            >
              <Text style={styles.executeBtnText}>Run Backup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheet>
    </View>
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
  refreshBtn: {
    padding: 8,
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
    flex: 1,
    paddingHorizontal: 16,
  },
  scrollContent: {
    paddingTop: 16,
    paddingBottom: 40,
  },
  loaderContainer: {
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 12,
    fontSize: 13,
  },
  errorCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    marginTop: 20,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  errorText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 30,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  redisCardContainer: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  redisWarningCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 24,
    alignItems: 'center',
  },
  redisWarningTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8,
  },
  redisWarningText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  // Card styles
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
    paddingBottom: 10,
  },
  cardTitleBlock: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardSubText: {
    fontSize: 11,
    marginTop: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  infoSubText: {
    fontSize: 12,
    marginTop: 1,
  },
  detailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingLeft: 28,
  },
  gridCol: {
    width: '48%',
  },
  healthBlock: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  healthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  healthLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  healthDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  latestFileBlock: {
    paddingLeft: 28,
    marginBottom: 16,
  },
  latestFileName: {
    fontSize: 13,
    fontWeight: '600',
  },
  latestFileDetails: {
    fontSize: 11,
    marginTop: 1,
  },
  actionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  actionBtn: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnText: {
    fontWeight: '700',
  },
  runBtn: {
    borderWidth: 0,
  },
  runBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  // Sheet
  sheetContent: {
    flex: 1,
    paddingTop: 8,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 16,
  },
  sheetLoader: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetError: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  retryBtn: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: 13,
    fontWeight: '700',
  },
  sheetEmpty: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  filesScroll: {
    flex: 1,
    maxHeight: 400,
    marginBottom: 20,
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  fileName: {
    fontSize: 13,
    fontWeight: '700',
  },
  fileMetadata: {
    fontSize: 11,
    marginTop: 2,
  },
  // Confirmation Sheet Styling
  confirmSheetContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  confirmSheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  confirmCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  confirmLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  confirmValue: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    flex: 1,
    paddingLeft: 20,
  },
  warningBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  warningText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  confirmBtn: {
    width: '48%',
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    borderWidth: 1,
  },
  cancelBtnText: {
    fontWeight: '700',
    fontSize: 14,
  },
  executeBtn: {
    // Background color dynamically applied
  },
  executeBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  // Form Styles
  formScroll: {
    maxHeight: 550,
  },
  formContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  formTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 24,
  },
  presetsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    marginBottom: 4,
  },
  presetBadge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
  },
  presetBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 8,
    height: 48,
    paddingHorizontal: 12,
    marginTop: 8,
    fontSize: 14,
  },
  fieldError: {
    fontSize: 11,
    color: '#ff3b30',
    marginTop: 4,
    fontWeight: '600',
  },
  prefixPreview: {
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128,128,128,0.2)',
  },
  switchTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  switchDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  emptyDestText: {
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
  destCard: {
    width: 140,
    borderWidth: 2,
    borderRadius: 10,
    padding: 12,
    marginRight: 10,
  },
  destCardName: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  destCardDetails: {
    fontSize: 11,
    marginTop: 2,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  formBtn: {
    width: '48%',
    height: 48,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryActionBtn: {
    borderRadius: 8,
    height: 44,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryActionBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  }
});
