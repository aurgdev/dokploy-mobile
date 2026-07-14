import React, { useState, useRef, useEffect } from 'react';
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
import { useTheme } from '../../src/theme/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import BottomSheet, { BottomSheetRef } from '../../src/components/BottomSheet';
import { useSafeDestinations } from '../../src/features/backups/backup.queries';
import { 
  useVolumeBackups, 
  useCreateVolumeBackup, 
  useUpdateVolumeBackup, 
  useDeleteVolumeBackup, 
  useRunVolumeBackupManually,
  useApplicationNamedMounts,
  useComposeServices,
  useComposeNamedMounts
} from '../../src/features/volume-backups/volumeBackup.queries';
import { 
  buildCreateVolumeBackupPayload, 
  buildUpdateVolumeBackupPayload 
} from '../../src/features/volume-backups/volumeBackup.payload';
import { 
  validateVolumeBackupName, 
  validateCronExpression, 
  validatePrefix, 
  validateRetention,
  getVolumeBackupFormBlockReason,
  VolumeBackupFormBlockReason
} from '../../src/features/volume-backups/volumeBackup.validation';
import { VolumeBackupPlan, SelectableNamedVolume } from '../../src/features/volume-backups/volumeBackup.types';

// Helper to get human schedule text
function getHumanSchedule(cron: string): string | null {
  const trimmed = cron.trim().replace(/\s+/g, ' ');
  if (trimmed === '0 0 * * *') return 'Every day at midnight';
  if (trimmed === '0 2 * * *') return 'Every day at 02:00';
  if (trimmed === '0 */6 * * *') return 'Every 6 hours';
  if (trimmed === '0 */12 * * *') return 'Every 12 hours';
  if (trimmed === '0 0 * * 0') return 'Every Sunday at midnight';
  return null;
}

export default function VolumeBackupsScreen() {
  const { id, type, name, projectName } = useLocalSearchParams<{
    id: string;
    type: 'application' | 'compose';
    name: string;
    projectName?: string;
  }>();

  const router = useRouter();
  const { colors } = useTheme();

  // Bottom sheets refs
  const formSheetRef = useRef<BottomSheetRef>(null);
  const runConfirmSheetRef = useRef<BottomSheetRef>(null);

  // Queries
  const { 
    data: plans, 
    isLoading: isPlansLoading, 
    error: plansError, 
    refetch: refetchPlans 
  } = useVolumeBackups(id || '', type || 'application');

  const { data: destinations, isLoading: isDestinationsLoading } = useSafeDestinations();

  // Application Mounts
  const { 
    data: appMounts, 
    isLoading: isAppMountsLoading,
    error: appMountsError,
    refetch: refetchAppMounts
  } = useApplicationNamedMounts(type === 'application' ? (id || '') : '');

  // Compose Services
  const { 
    data: composeServices, 
    isLoading: isServicesLoading 
  } = useComposeServices(type === 'compose' ? (id || '') : '');

  // Compose Service Select State (Inside Form)
  const [selectedService, setSelectedService] = useState<string>('');

  // Compose Mounts
  const { 
    data: composeMounts, 
    isLoading: isComposeMountsLoading,
    error: composeMountsError,
    refetch: refetchComposeMounts
  } = useComposeNamedMounts(
    type === 'compose' ? (id || '') : '',
    type === 'compose' ? selectedService : ''
  );

  // Mutations
  const createMutation = useCreateVolumeBackup(id || '', type || 'application');
  const updateMutation = useUpdateVolumeBackup(id || '', type || 'application');
  const deleteMutation = useDeleteVolumeBackup(id || '', type || 'application');
  const runMutation = useRunVolumeBackupManually();

  // Form State
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingPlan, setEditingPlan] = useState<VolumeBackupPlan | null>(null);

  const [formName, setFormName] = useState('');
  const [formEnabled, setFormEnabled] = useState(true);
  const [formSchedule, setFormSchedule] = useState('0 0 * * *');
  const [formPreset, setFormPreset] = useState('0 0 * * *');
  const [formDestinationId, setFormDestinationId] = useState('');
  const [formVolumeName, setFormVolumeName] = useState('');
  const [formPrefix, setFormPrefix] = useState('');
  const [formRetentionType, setFormRetentionType] = useState<'unlimited' | '3' | '5' | '7' | '14' | 'custom'>('unlimited');
  const [formCustomRetention, setFormCustomRetention] = useState('');
  const [formTurnOff, setFormTurnOff] = useState(true);

  const [formErrors, setFormErrors] = useState<{
    name?: string;
    schedule?: string;
    destination?: string;
    volume?: string;
    prefix?: string;
    retention?: string;
    service?: string;
  }>({});

  const [isSubmittingForm, setIsSubmittingForm] = useState(false);

  // Manual run confirm state
  const [runningPlan, setRunningPlan] = useState<VolumeBackupPlan | null>(null);
  const [isRunningBackup, setIsRunningBackup] = useState(false);

  // Auto select service when compose services are loaded
  useEffect(() => {
    if (type === 'compose' && composeServices && composeServices.length > 0 && !selectedService) {
      setSelectedService(composeServices[0]);
    }
  }, [composeServices]);

  const handleRefreshAll = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refetchPlans();
  };

  const openCreateSheet = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFormMode('create');
    setEditingPlan(null);
    setFormName(name ? `${name}-vol-backup` : '');
    setFormEnabled(true);
    setFormSchedule('0 0 * * *');
    setFormPreset('0 0 * * *');
    setFormDestinationId(destinations && destinations.length > 0 ? destinations[0].destinationId : '');
    setFormPrefix(name ? `${name}-vol` : '');
    setFormRetentionType('unlimited');
    setFormCustomRetention('');
    setFormTurnOff(true);
    setFormErrors({});

    if (type === 'compose') {
      if (composeServices && composeServices.length > 0) {
        setSelectedService(composeServices[0]);
      } else {
        setSelectedService('');
      }
      setFormVolumeName('');
    } else {
      setSelectedService('');
      setFormVolumeName(appMounts && appMounts.length > 0 ? appMounts[0].volumeName : '');
    }

    formSheetRef.current?.open();
  };

  const openEditSheet = (plan: VolumeBackupPlan) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFormMode('edit');
    setEditingPlan(plan);
    setFormName(plan.name);
    setFormEnabled(plan.enabled ?? true);
    setFormSchedule(plan.cronExpression);
    
    const trimmedCron = plan.cronExpression.trim().replace(/\s+/g, ' ');
    if (['0 0 * * *', '0 2 * * *', '0 */6 * * *', '0 */12 * * *', '0 0 * * 0'].includes(trimmedCron)) {
      setFormPreset(trimmedCron);
    } else {
      setFormPreset('custom');
    }
    
    setFormDestinationId(plan.destinationId);
    setFormPrefix(plan.prefix);
    setFormTurnOff(plan.turnOff);
    
    if (plan.keepLatestCount === null) {
      setFormRetentionType('unlimited');
      setFormCustomRetention('');
    } else if ([3, 5, 7, 14].includes(plan.keepLatestCount)) {
      setFormRetentionType(String(plan.keepLatestCount) as any);
      setFormCustomRetention('');
    } else {
      setFormRetentionType('custom');
      setFormCustomRetention(String(plan.keepLatestCount));
    }

    if (type === 'compose') {
      setSelectedService(plan.serviceName || '');
    }
    setFormVolumeName(plan.volumeName);
    setFormErrors({});
    formSheetRef.current?.open();
  };

  // Determine current mounts list to offer
  const activeMounts = type === 'compose' ? composeMounts : appMounts;
  const isMountsLoading = type === 'compose' ? isComposeMountsLoading : isAppMountsLoading;

  // Preserve the saved volume during edit if discovery temporarily fails
  const selectableMountsList: SelectableNamedVolume[] = [];
  if (activeMounts) {
    selectableMountsList.push(...activeMounts);
  }
  if (formMode === 'edit' && formVolumeName) {
    const exists = selectableMountsList.some(m => m.volumeName === formVolumeName);
    if (!exists) {
      selectableMountsList.push({
        volumeName: formVolumeName,
        displayName: `${formVolumeName} (Preserved)`,
        mountPath: null,
        serviceName: type === 'compose' ? selectedService : null,
        source: type === 'compose' ? 'compose_service' : 'application_mount',
      });
    }
  }

  // Blocking logic as single source of truth
  const blockReason = getVolumeBackupFormBlockReason({
    name: formName,
    destinationId: formDestinationId,
    volumeName: formVolumeName,
    schedule: formSchedule,
    prefix: formPrefix,
    retentionType: formRetentionType,
    customRetention: formCustomRetention,
    isSubmitting: isSubmittingForm,
    isMountsLoading: isMountsLoading,
    mountsError: type === 'compose' ? composeMountsError : appMountsError,
    resourceType: type || 'application',
    serviceName: type === 'compose' ? selectedService : null,
  });

  const getBlockReasonFriendlyMessage = () => {
    if (!blockReason) return null;
    
    const mountsCount = selectableMountsList.length;
    if (type === 'application' && mountsCount === 0 && !isMountsLoading && !appMountsError) {
      return 'This application has no Docker named volumes to back up.';
    }
    if (type === 'compose') {
      if (!selectedService) {
        return 'Select a Compose service first.';
      }
      if (mountsCount === 0 && !isMountsLoading && !composeMountsError) {
        return 'The selected service has no Docker named volumes.';
      }
    }

    switch (blockReason) {
      case 'submitting':
        return 'Saving plan...';
      case 'missing_name':
        return 'Please enter a plan name.';
      case 'missing_destination':
        return 'Select a backup destination.';
      case 'missing_service':
        return 'Select a Compose service first.';
      case 'missing_named_volume':
        return 'Select a Docker named volume.';
      case 'invalid_schedule':
        return 'Fix the cron schedule.';
      case 'invalid_prefix':
        return 'Fix the backup prefix.';
      case 'invalid_retention':
        return 'Fix the retention limit.';
      case 'loading_mounts':
        return 'Loading Docker named volumes...';
      case 'mount_discovery_failed':
        return 'Could not load named volumes. Retry before creating a plan.';
      default:
        return 'Please fill in all required fields.';
    }
  };

  const blockReasonFriendly = getBlockReasonFriendlyMessage();

  const handleFormSubmit = async () => {
    if (blockReason) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      
      const errors: any = {};
      if (!formName.trim()) errors.name = 'Plan name is required';
      if (!formDestinationId) errors.destination = 'Destination is required';
      if (type === 'compose' && !selectedService) errors.service = 'Service is required';
      if (!formVolumeName) errors.volume = 'Volume is required';
      
      const cronErr = validateCronExpression(formSchedule);
      if (cronErr) errors.schedule = cronErr;
      
      const prefixErr = validatePrefix(formPrefix);
      if (prefixErr) errors.prefix = prefixErr;
      
      const retentionErr = validateRetention(formRetentionType, formCustomRetention);
      if (retentionErr) errors.retention = retentionErr;
      
      setFormErrors(errors);
      return;
    }

    setFormErrors({});

    let parsedRetention: number | null = null;
    if (formRetentionType === 'unlimited') {
      parsedRetention = null;
    } else if (['3', '5', '7', '14'].includes(formRetentionType)) {
      parsedRetention = parseInt(formRetentionType, 10);
    } else if (formRetentionType === 'custom') {
      parsedRetention = parseInt(formCustomRetention, 10);
    }

    const destName = destinations?.find(d => d.destinationId === formDestinationId)?.name || formDestinationId;
    const isCreate = formMode === 'create';

    Alert.alert(
      isCreate ? 'Create Volume Backup' : 'Update Volume Backup',
      `Please confirm the plan details:\n\nName: ${formName}\nVolume: ${formVolumeName}\nDestination: ${destName}\nSchedule: ${formSchedule}\nStop Container: ${formTurnOff ? 'Yes' : 'No'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isCreate ? 'Create' : 'Save Changes',
          onPress: async () => {
            setIsSubmittingForm(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              const formPayload = {
                name: formName,
                volumeName: formVolumeName,
                prefix: formPrefix,
                appName: name || null,
                serviceName: type === 'compose' ? selectedService : null,
                turnOff: formTurnOff,
                cronExpression: formSchedule,
                keepLatestCount: parsedRetention,
                enabled: formEnabled,
                destinationId: formDestinationId,
              };

              if (isCreate) {
                const payload = buildCreateVolumeBackupPayload({
                  resourceId: id || '',
                  resourceType: type || 'application',
                  form: formPayload
                });
                await createMutation.mutateAsync(payload);
                Alert.alert('Success', 'Volume backup plan created successfully.');
              } else {
                if (!editingPlan) return;
                const payload = buildUpdateVolumeBackupPayload({
                  volumeBackupId: editingPlan.volumeBackupId,
                  resourceId: id || '',
                  resourceType: type || 'application',
                  form: formPayload,
                  originalBackup: editingPlan
                });
                await updateMutation.mutateAsync(payload);
                Alert.alert('Success', 'Volume backup plan updated successfully.');
              }
              formSheetRef.current?.close();
            } catch (err: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Error', err?.message || 'Failed to save volume backup plan.');
            } finally {
              setIsSubmittingForm(false);
            }
          }
        }
      ]
    );
  };

  const handleManualRun = (plan: VolumeBackupPlan) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRunningPlan(plan);
    runConfirmSheetRef.current?.open();
  };

  const executeManualRun = async () => {
    if (!runningPlan || isRunningBackup) return;
    setIsRunningBackup(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      await runMutation.mutateAsync(runningPlan.volumeBackupId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      runConfirmSheetRef.current?.close();
      Alert.alert('Success', 'Volume backup request accepted.');
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Backup Failed', err.message || 'An error occurred triggering the backup.');
    } finally {
      setIsRunningBackup(false);
    }
  };

  const handleDeletePlan = (plan: VolumeBackupPlan) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Delete Backup Plan',
      `Are you sure you want to delete the backup plan "${plan.name}"?\n\nFuture scheduled backups will stop. Existing backup files on S3 will not be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              await deleteMutation.mutateAsync(plan.volumeBackupId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Success', 'Volume backup plan deleted.');
            } catch (err: any) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Error', err.message || 'Failed to delete plan.');
            }
          }
        }
      ]
    );
  };

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
            {projectName || 'PROJECT'} • {type?.toUpperCase() || 'SERVICE'} VOLUMES
          </Text>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>{name}</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={handleRefreshAll}>
          <Ionicons name="refresh" size={22} color={colors.text} />
        </TouchableOpacity>
        {plans && plans.length > 0 && (
          <TouchableOpacity style={[styles.refreshBtn, { marginLeft: 8 }]} onPress={openCreateSheet}>
            <Ionicons name="add" size={24} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {isPlansLoading ? (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={colors.text} />
            <Text style={[styles.loaderText, { color: colors.textSecondary }]}>Loading volume backups...</Text>
          </View>
        ) : plansError ? (
          <View style={[styles.errorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="alert-circle" size={28} color={colors.statusStopped} style={{ marginBottom: 8 }} />
            <Text style={[styles.errorTitle, { color: colors.text }]}>Failed to load volume backups</Text>
            <Text style={[styles.errorText, { color: colors.textSecondary }]}>
              {(plansError as any).message || 'An unexpected error occurred while querying the server.'}
            </Text>
          </View>
        ) : !plans || plans.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="cloud-offline" size={32} color={colors.textSecondary} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No volume backup plans configured</Text>
            <Text style={[styles.emptyText, { color: colors.textSecondary, marginBottom: 16 }]}>
              There are no volume backup plans configured for this container storage.
            </Text>
            <TouchableOpacity 
              style={[styles.primaryActionBtn, { backgroundColor: colors.activeTint }]}
              onPress={openCreateSheet}
            >
              <Text style={styles.primaryActionBtnText}>Create Backup Plan</Text>
            </TouchableOpacity>
          </View>
        ) : (
          plans.map(plan => {
            const destName = destinations?.find(d => d.destinationId === plan.destinationId)?.name || `ID: ${plan.destinationId.substring(0, 8)}...`;
            const humanCron = getHumanSchedule(plan.cronExpression);
            
            return (
              <View key={plan.volumeBackupId} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>{plan.name}</Text>
                    <Text style={[styles.cardSubText, { color: colors.textSecondary }]}>
                      ID: {plan.volumeBackupId.substring(0, 8)}...
                    </Text>
                  </View>
                  <View style={[
                    styles.badge, 
                    { backgroundColor: plan.enabled ? 'rgba(76, 175, 80, 0.12)' : 'rgba(255, 149, 0, 0.12)' }
                  ]}>
                    <Text style={[
                      styles.badgeText, 
                      { color: plan.enabled ? colors.statusRunning : '#ff9500' }
                    ]}>
                      {plan.enabled ? 'ENABLED' : 'DISABLED'}
                    </Text>
                  </View>
                </View>

                {/* Details */}
                <View style={styles.infoRow}>
                  <Ionicons name="cube-outline" size={16} color={colors.textSecondary} style={styles.infoIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Volume</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{plan.volumeName}</Text>
                  </View>
                </View>

                {type === 'compose' && plan.serviceName && (
                  <View style={styles.infoRow}>
                    <Ionicons name="options-outline" size={16} color={colors.textSecondary} style={styles.infoIcon} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Compose Service</Text>
                      <Text style={[styles.infoValue, { color: colors.text }]}>{plan.serviceName}</Text>
                    </View>
                  </View>
                )}

                <View style={styles.infoRow}>
                  <Ionicons name="time-outline" size={16} color={colors.textSecondary} style={styles.infoIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Schedule</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{plan.cronExpression}</Text>
                    {humanCron && (
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>{humanCron}</Text>
                    )}
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <Ionicons name="cloud-upload-outline" size={16} color={colors.textSecondary} style={styles.infoIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Destination</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{destName}</Text>
                  </View>
                </View>

                <View style={styles.detailsGrid}>
                  <View style={styles.gridCol}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Prefix</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>{plan.prefix || '(None)'}</Text>
                  </View>
                  <View style={styles.gridCol}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>Retention Limit</Text>
                    <Text style={[styles.infoValue, { color: colors.text }]}>
                      {plan.keepLatestCount ? `Keep latest ${plan.keepLatestCount}` : 'Unlimited'}
                    </Text>
                  </View>
                </View>

                <View style={[styles.healthBlock, { backgroundColor: colors.background, borderColor: colors.border }]}>
                  <View style={styles.healthHeader}>
                    <View style={[styles.healthDot, { backgroundColor: plan.turnOff ? colors.statusRunning : '#ff9500' }]} />
                    <Text style={[styles.healthLabel, { color: colors.text }]}>
                      {plan.turnOff ? 'Safe Stop Active' : 'Online Hot Backup'}
                    </Text>
                  </View>
                  <Text style={[styles.healthDesc, { color: colors.textSecondary }]}>
                    {plan.turnOff 
                      ? 'Dokploy will stop container writes before saving volume data.' 
                      : 'Container remains online; writes during backup may cause inconsistency.'}
                  </Text>
                </View>

                {/* Actions */}
                <View style={styles.actionGrid}>
                  <TouchableOpacity 
                    style={[styles.actionBtn, { width: '31%', backgroundColor: colors.card, borderColor: colors.border }]} 
                    onPress={() => openEditSheet(plan)}
                  >
                    <Ionicons name="create-outline" size={16} color={colors.text} style={{ marginRight: 4 }} />
                    <Text style={[styles.actionBtnText, { color: colors.text, fontSize: 12 }]}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.actionBtn, { width: '31%', backgroundColor: colors.card, borderColor: colors.border }]} 
                    onPress={() => handleDeletePlan(plan)}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.statusStopped} style={{ marginRight: 4 }} />
                    <Text style={[styles.actionBtnText, { color: colors.statusStopped, fontSize: 12 }]}>Delete</Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={[styles.actionBtn, styles.runBtn, { width: '31%', backgroundColor: colors.activeTint, borderColor: colors.activeTint }]} 
                    onPress={() => handleManualRun(plan)}
                  >
                    <Ionicons name="play-circle-outline" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={[styles.runBtnText, { fontSize: 12 }]}>Run Now</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Form Bottom Sheet */}
      <BottomSheet ref={formSheetRef}>
        <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContainer}>
          <Text style={[styles.formTitle, { color: colors.text }]}>
            {formMode === 'create' ? 'Create Volume Backup' : 'Edit Volume Backup'}
          </Text>

          {/* Enabled Toggle */}
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.switchTitle, { color: colors.text }]}>Enabled</Text>
              <Text style={[styles.switchDesc, { color: colors.textSecondary }]}>
                Toggle execution status of this backup plan.
              </Text>
            </View>
            <Switch
              value={formEnabled}
              onValueChange={setFormEnabled}
              trackColor={{ false: colors.border, true: colors.activeTint }}
              thumbColor={formEnabled ? '#ffffff' : '#f4f3f4'}
            />
          </View>

          {/* Name Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Plan Name</Text>
            <TextInput
              style={[
                styles.textInput,
                { color: colors.text, borderColor: formErrors.name ? colors.statusStopped : colors.border }
              ]}
              value={formName}
              onChangeText={setFormName}
              placeholder="e.g. storage-backup"
              placeholderTextColor={colors.textSecondary}
            />
            {formErrors.name && <Text style={styles.fieldError}>{formErrors.name}</Text>}
          </View>

          {/* Stop Container Toggle */}
          <View style={styles.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={[styles.switchTitle, { color: colors.text }]}>Stop container during backup</Text>
              <Text style={[styles.switchDesc, { color: colors.textSecondary }]}>
                {formTurnOff 
                  ? 'Dokploy will temporarily stop the container to reduce the risk of inconsistent data.' 
                  : 'The service remains online, but active writes may result in an inconsistent backup.'}
              </Text>
            </View>
            <Switch
              value={formTurnOff}
              onValueChange={setFormTurnOff}
              trackColor={{ false: colors.border, true: colors.activeTint }}
              thumbColor={formTurnOff ? '#ffffff' : '#f4f3f4'}
            />
          </View>

          {/* Compose Service Selection */}
          {type === 'compose' && (
            <View style={styles.inputGroup}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Compose Service</Text>
              {isServicesLoading ? (
                <ActivityIndicator size="small" color={colors.text} style={{ marginVertical: 12 }} />
              ) : !composeServices || composeServices.length === 0 ? (
                <Text style={{ color: colors.statusStopped, marginTop: 8 }}>No services found in docker-compose file.</Text>
              ) : (
                <View style={styles.presetsContainer}>
                  {composeServices.map(srv => {
                    const isSelected = selectedService === srv;
                    return (
                      <TouchableOpacity
                        key={srv}
                        style={[
                          styles.presetBadge,
                          { borderColor: isSelected ? colors.activeTint : colors.border },
                          isSelected && { backgroundColor: colors.activeTint }
                        ]}
                        onPress={() => {
                          setSelectedService(srv);
                          setFormVolumeName('');
                        }}
                      >
                        <Text style={[
                          styles.presetBadgeText,
                          { color: isSelected ? '#ffffff' : colors.text }
                        ]}>
                          {srv}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              {formErrors.service && <Text style={styles.fieldError}>{formErrors.service}</Text>}
            </View>
          )}

          {/* Docker Named Volume Selector */}
          <View style={styles.inputGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Docker Named Volume</Text>
            <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4, marginBottom: 8 }}>
              Volume Backups work only with Docker named volumes. Bind-mounted folders cannot be selected.
            </Text>

            {/* Specific retry UI on failure */}
            {((type === 'application' && appMountsError) || (type === 'compose' && composeMountsError)) && (
              <View style={[styles.warningBlock, { borderColor: colors.statusStopped, backgroundColor: 'rgba(255,59,48,0.08)' }]}>
                <Ionicons name="alert-circle-outline" size={18} color={colors.statusStopped} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 13, color: colors.text, flex: 1 }}>
                  Could not load named volumes.
                </Text>
                <TouchableOpacity 
                  style={[styles.retryBtn, { borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderRadius: 6 }]} 
                  onPress={() => {
                    if (type === 'application') refetchAppMounts();
                    else refetchComposeMounts();
                  }}
                >
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 12 }}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {isMountsLoading ? (
              <ActivityIndicator size="small" color={colors.text} style={{ marginVertical: 12 }} />
            ) : !selectableMountsList || selectableMountsList.length === 0 ? (
              <View style={[styles.warningBlock, { backgroundColor: 'rgba(255, 149, 0, 0.12)', borderColor: 'rgba(255, 149, 0, 0.3)' }]}>
                <Ionicons name="warning-outline" size={18} color="#ff9500" style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 13, color: colors.text, flex: 1 }}>
                  {type === 'compose' 
                    ? (selectedService ? 'The selected service has no Docker named volumes.' : 'Select a Compose service first.')
                    : 'This application has no Docker named volumes to back up.'}
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled>
                {selectableMountsList.map(m => {
                  const isSelected = formVolumeName === m.volumeName;
                  return (
                    <TouchableOpacity
                      key={m.volumeName}
                      style={[
                        styles.volumeRow,
                        { borderColor: isSelected ? colors.activeTint : colors.border }
                      ]}
                      onPress={() => setFormVolumeName(m.volumeName)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.volumeRowName, { color: colors.text }]}>{m.displayName}</Text>
                        {m.mountPath && (
                          <Text style={{ fontSize: 11, color: colors.textSecondary }}>Path: {m.mountPath}</Text>
                        )}
                      </View>
                      <Ionicons 
                        name={isSelected ? "checkbox" : "square-outline"} 
                        size={20} 
                        color={isSelected ? colors.activeTint : colors.textSecondary} 
                      />
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            {formErrors.volume && <Text style={styles.fieldError}>{formErrors.volume}</Text>}
          </View>

          {/* Schedule Presets */}
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

          {/* Destination */}
          <View style={styles.inputGroup}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Destination</Text>
            {isDestinationsLoading ? (
              <ActivityIndicator size="small" color={colors.text} style={{ marginVertical: 12 }} />
            ) : !destinations || destinations.length === 0 ? (
              <Text style={{ color: colors.statusStopped, marginTop: 8 }}>
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
              placeholder="e.g. prefix-vol"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {formErrors.prefix && <Text style={styles.fieldError}>{formErrors.prefix}</Text>}
            <Text style={[styles.prefixPreview, { color: colors.textSecondary }]}>
              Storage path preview: {name}/{formPrefix ? `${formPrefix.trim()}/` : ''}
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

          {/* Read-Only Resource Context */}
          <View style={[styles.confirmCard, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 12 }]}>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 8 }]}>Resource Target Context</Text>
            <View style={styles.confirmRow}>
              <Text style={[styles.confirmLabel, { color: colors.textSecondary }]}>Container Stack</Text>
              <Text style={[styles.confirmValue, { color: colors.text }]}>{name}</Text>
            </View>
            <View style={styles.confirmRow}>
              <Text style={[styles.confirmLabel, { color: colors.textSecondary }]}>Type</Text>
              <Text style={[styles.confirmValue, { color: colors.text }]}>{type?.toUpperCase()}</Text>
            </View>
          </View>

          {/* Block Reason Display */}
          {blockReasonFriendly && (
            <View style={{ marginTop: 20, alignItems: 'center' }}>
              <Text style={{ color: colors.statusStopped, fontSize: 13, fontWeight: '600', textAlign: 'center' }}>
                {blockReasonFriendly}
              </Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.formActions}>
            <TouchableOpacity 
              style={[styles.formBtn, { borderWidth: 1, borderColor: colors.border }]} 
              onPress={() => formSheetRef.current?.close()}
              disabled={isSubmittingForm}
            >
              <Text style={{ color: colors.text, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.formBtn, 
                { 
                  backgroundColor: blockReason ? colors.border : colors.activeTint, 
                  opacity: blockReason ? 0.6 : 1 
                }
              ]} 
              onPress={handleFormSubmit}
            >
              {isSubmittingForm ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={{ color: blockReason ? colors.textSecondary : '#ffffff', fontWeight: '700' }}>
                  {formMode === 'create' ? 'Create Plan' : 'Save Changes'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </BottomSheet>

      {/* Manual Run Confirmation Bottom Sheet */}
      <BottomSheet ref={runConfirmSheetRef}>
        {runningPlan && (
          <View style={[styles.confirmSheetContent, { paddingBottom: 24 }]}>
            <Text style={[styles.confirmSheetTitle, { color: colors.text }]}>Confirm Manual Backup</Text>
            
            <View style={[styles.confirmCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View style={styles.confirmRow}>
                <Text style={[styles.confirmLabel, { color: colors.textSecondary }]}>Plan Name</Text>
                <Text style={[styles.confirmValue, { color: colors.text }]}>{runningPlan.name}</Text>
              </View>
              <View style={styles.confirmRow}>
                <Text style={[styles.confirmLabel, { color: colors.textSecondary }]}>Volume</Text>
                <Text style={[styles.confirmValue, { color: colors.text }]}>{runningPlan.volumeName}</Text>
              </View>
              {type === 'compose' && runningPlan.serviceName && (
                <View style={styles.confirmRow}>
                  <Text style={[styles.confirmLabel, { color: colors.textSecondary }]}>Compose Service</Text>
                  <Text style={[styles.confirmValue, { color: colors.text }]}>{runningPlan.serviceName}</Text>
                </View>
              )}
              <View style={styles.confirmRow}>
                <Text style={[styles.confirmLabel, { color: colors.textSecondary }]}>Stop Container</Text>
                <Text style={[styles.confirmValue, { color: colors.text }]}>{runningPlan.turnOff ? 'Yes' : 'No'}</Text>
              </View>
            </View>

            {runningPlan.turnOff && (
              <View style={[styles.warningBlock, { backgroundColor: 'rgba(255, 149, 0, 0.12)', borderColor: 'rgba(255, 149, 0, 0.3)' }]}>
                <Ionicons name="warning-outline" size={18} color="#ff9500" style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 13, color: colors.text, flex: 1, lineHeight: 18 }}>
                  Warning: The container will experience brief downtime because Stop container is enabled.
                </Text>
              </View>
            )}

            {isRunningBackup && (
              <View style={styles.progressContainer}>
                <ActivityIndicator size="small" color={colors.activeTint} style={{ marginRight: 8 }} />
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>Submitting backup request...</Text>
              </View>
            )}

            <View style={styles.confirmActions}>
              <TouchableOpacity 
                style={[styles.confirmBtn, styles.cancelBtn, { borderColor: colors.border }]} 
                onPress={() => runConfirmSheetRef.current?.close()}
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
                onPress={executeManualRun}
                disabled={isRunningBackup}
              >
                <Text style={styles.executeBtnText}>Run Backup</Text>
              </TouchableOpacity>
            </View>
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
  },
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
  detailsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingLeft: 26,
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
  // Form Styles
  formScroll: {
    maxHeight: 520,
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
  warningBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    marginBottom: 8,
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  volumeRowName: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  // Confirm run styles
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
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
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
    // Dynamic background
  },
  executeBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  retryBtn: {
    backgroundColor: 'transparent',
  }
});
