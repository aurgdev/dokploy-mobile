import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../../src/theme/ThemeContext';
import BottomSheet, { BottomSheetRef } from '../../src/components/BottomSheet';
import { CapabilityGate } from '../../src/components/CapabilityGate';
import { useDokployCapabilities } from '../../src/services/queries';
import { dokployFetch } from '../../src/services/api';
import { useQuery } from '@tanstack/react-query';
import {
  useActiveProfileId,
  useAppDomains,
  useComposeDomains,
  useCreateDomain,
  useUpdateDomain,
  useDeleteDomain,
  useComposeServices,
  useDomainValidation,
  useApplicationDetails,
  useComposeDetails,
  useCanGenerateTraefikMe,
  useGenerateDomain,
  useRedeployCompose,
} from '../../src/features/domains/domain.queries';
import { CertificateType, Domain, DomainMutationResult } from '../../src/features/domains/domain.types';
import {
  validateDomainForm,
  mapValidationState,
  DomainValidationState,
  DomainValidationErrors,
} from '../../src/features/domains/domain.validation';
import {
  buildCreatePayload,
  buildUpdatePayload,
} from '../../src/features/domains/domain.payload';
import { buildPublicUrl } from '../../src/features/domains/domain.url';
import {
  parseCanGenerateResponse,
  parseGenerateDomainResponse,
} from '../../src/features/domains/domain.parser';

type ScreenType = 'application' | 'compose';

// ─── Sub-Component for Domain Card (Localizes validation state queries) ─────
interface DomainCardProps {
  domain: Domain;
  onSelectActions: (domain: Domain) => void;
  deletingId: string | null;
  onDelete: (domainId: string, host: string) => void;
}

function DomainCard({ domain, onSelectActions, deletingId, onDelete }: DomainCardProps) {
  const { colors, theme } = useTheme();
  const isDark = theme === 'dark';

  // Validation hook (memory-only cache, disabled by default)
  const validationQuery = useDomainValidation(domain.domainId, domain.host);
  const validationState = mapValidationState(validationQuery.data, validationQuery.error);
  const validationTime = validationQuery.isSuccess || validationQuery.isError
    ? (validationQuery.dataUpdatedAt || validationQuery.errorUpdatedAt)
    : null;
  const validationExplanation = validationQuery.data?.message || validationQuery.error?.message || null;

  const handleValidate = () => {
    if (validationQuery.isFetching) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    validationQuery.refetch();
  };

  const getValidationColor = (state: DomainValidationState): string => {
    switch (state) {
      case 'valid':
        return colors.statusRunning;
      case 'invalid':
      case 'forbidden':
      case 'server_error':
        return colors.statusStopped;
      case 'unable_to_validate':
      case 'offline':
      default:
        return colors.textSecondary;
    }
  };

  const getValidationLabel = (state: DomainValidationState): string => {
    switch (state) {
      case 'valid':
        return 'Valid DNS Routing';
      case 'invalid':
        return 'Invalid (DNS Mismatch)';
      case 'forbidden':
        return 'Permission Denied';
      case 'server_error':
        return 'Server Validation Error';
      case 'offline':
        return 'Network Offline / Timeout';
      case 'unable_to_validate':
      default:
        return 'DNS Check Failed';
    }
  };

  return (
    <View
      style={[
        styles.domainCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      {/* Top Row: host + three dot actions menu */}
      <View style={styles.domainCardTop}>
        <View style={styles.domainHostRow}>
          <Ionicons
            name="globe-outline"
            size={16}
            color={colors.activeTint}
            style={{ marginRight: 6 }}
          />
          <Text
            style={[styles.domainHost, { color: colors.text }]}
            numberOfLines={1}
          >
            {domain.host}
          </Text>
        </View>
        
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            id={`domain-actions-${domain.domainId}`}
            style={styles.moreBtn}
            onPress={() => onSelectActions(domain)}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Badges Row */}
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: colors.statsBg }]}>
          <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
            :{domain.port ?? 3000}
          </Text>
        </View>

        {domain.path && domain.path !== '/' && (
          <View style={[styles.badge, { backgroundColor: colors.statsBg }]}>
            <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
              {domain.path}
            </Text>
          </View>
        )}

        <View
          style={[
            styles.badge,
            {
              backgroundColor: domain.https
                ? (isDark ? '#1a3a1a' : '#e6f4ea')
                : colors.statsBg,
            },
          ]}
        >
          <Ionicons
            name={domain.https ? 'shield-checkmark-outline' : 'shield-outline'}
            size={12}
            color={domain.https ? colors.statusRunning : colors.textSecondary}
            style={{ marginRight: 3 }}
          />
          <Text
            style={[
              styles.badgeText,
              {
                color: domain.https
                  ? colors.statusRunning
                  : colors.textSecondary,
              },
            ]}
          >
            {domain.https ? 'HTTPS' : 'HTTP'}
          </Text>
        </View>

        {domain.https && domain.certificateType && domain.certificateType !== 'none' && (
          <View style={[styles.badge, { backgroundColor: colors.statsBg }]}>
            <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
              {domain.certificateType}
            </Text>
          </View>
        )}

        {domain.serviceName && (
          <View style={[styles.badge, { backgroundColor: colors.statsBg }]}>
            <Ionicons name="apps-outline" size={10} color={colors.textSecondary} style={{ marginRight: 3 }} />
            <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
              {domain.serviceName}
            </Text>
          </View>
        )}
      </View>

      {/* Validation Status Block */}
      <View style={[styles.validationBlock, { backgroundColor: colors.statsBg, borderColor: colors.border }]}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={[styles.validationTitle, { color: colors.textSecondary }]}>DNS Routing & SSL</Text>
          {validationQuery.isFetching ? (
            <Text style={{ fontSize: 13, color: colors.textSecondary, fontWeight: '600', marginTop: 2 }}>
              Verifying...
            </Text>
          ) : validationTime ? (
            <View>
              <Text style={{ fontSize: 13, color: getValidationColor(validationState), fontWeight: '600', marginTop: 2 }}>
                {getValidationLabel(validationState)}
              </Text>
              <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 2 }}>
                Last checked: {new Date(validationTime).toLocaleTimeString()}
              </Text>
              {validationExplanation && (
                <Text style={{ fontSize: 11, color: colors.statusStopped, marginTop: 4 }} numberOfLines={2}>
                  {validationExplanation}
                </Text>
              )}
            </View>
          ) : (
            <Text style={{ fontSize: 13, color: colors.textSecondary, fontWeight: '600', marginTop: 2 }}>
              Unverified
            </Text>
          )}
        </View>
        <TouchableOpacity
          id={`validate-domain-${domain.domainId}`}
          style={[styles.validateBtn, { borderColor: colors.border }]}
          onPress={handleValidate}
          disabled={validationQuery.isFetching}
        >
          {validationQuery.isFetching ? (
            <ActivityIndicator size="small" color={colors.activeTint} />
          ) : (
            <Ionicons name="refresh-outline" size={16} color={colors.activeTint} />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Domains Screen ──────────────────────────────────────────────────────
export default function DomainsScreen() {
  const { id, type, name, projectName } = useLocalSearchParams<{
    id: string;
    type: ScreenType;
    name: string;
    projectName: string;
  }>();

  const router = useRouter();
  const { colors, theme } = useTheme();
  
  // Sheet Refs
  const addSheetRef = useRef<BottomSheetRef>(null);
  const actionsSheetRef = useRef<BottomSheetRef>(null);
  const redeploySheetRef = useRef<BottomSheetRef>(null);

  // ─── Form State ─────────────────────────────────────────────────────────────
  const [formHost, setFormHost] = useState('');
  const [formPort, setFormPort] = useState('3000');
  const [formPath, setFormPath] = useState('/');
  const [formHttps, setFormHttps] = useState(false);
  const [formCertType, setFormCertType] = useState<CertificateType>('letsencrypt');
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<DomainValidationErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Edit / Action / Redeploy state
  const [editingDomain, setEditingDomain] = useState<Domain | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [mutationResult, setMutationResult] = useState<DomainMutationResult | null>(null);

  // ─── Data queries ───────────────────────────────────────────────────────────
  const isApplication = type === 'application';

  const appDomainsQuery = useAppDomains(isApplication ? id : '');
  const composeDomainsQuery = useComposeDomains(!isApplication ? id : '');

  const { data: domains, isLoading, isError, refetch } = isApplication
    ? appDomainsQuery
    : composeDomainsQuery;

  // Resolve serverId reactively (fetches details of selected resource)
  const appDetailsQuery = useApplicationDetails(isApplication ? id : '');
  const composeDetailsQuery = useComposeDetails(!isApplication ? id : '');

  const rawDetails = isApplication ? appDetailsQuery.data : composeDetailsQuery.data;

  // Custom extractor to handle any direct/nested response wrapper
  const extractServerId = (raw: any): string | null => {
    if (!raw) return null;
    if (typeof raw === 'string') return raw;
    if (typeof raw === 'object') {
      if (typeof raw.serverId === 'string' && raw.serverId) return raw.serverId;
      if (raw.data && typeof raw.data.serverId === 'string' && raw.data.serverId) return raw.data.serverId;
      if (raw.result && typeof raw.result.serverId === 'string' && raw.result.serverId) return raw.result.serverId;
      if (raw.result && raw.result.data && typeof raw.result.data.serverId === 'string' && raw.result.data.serverId) {
        return raw.result.data.serverId;
      }
      if (raw.application && typeof raw.application.serverId === 'string' && raw.application.serverId) {
        return raw.application.serverId;
      }
      if (raw.compose && typeof raw.compose.serverId === 'string' && raw.compose.serverId) {
        return raw.compose.serverId;
      }
    }
    return null;
  };

  const rawServerId = extractServerId(rawDetails);
  
  type DomainServerTarget =
    | { kind: "remote"; serverId: string }
    | { kind: "local" };

  let target: DomainServerTarget | undefined = undefined;
  if (rawDetails !== undefined) {
    if (typeof rawServerId === 'string' && rawServerId.trim().length > 0) {
      target = { kind: "remote", serverId: rawServerId };
    } else {
      target = { kind: "local" };
    }
  }

  const queryServerId = target 
    ? (target.kind === "remote" ? target.serverId : "") 
    : undefined;

  // Determine if domain reads are forbidden
  const capabilitiesQuery = useDokployCapabilities();
  const readDomainsCapability = capabilitiesQuery.data?.readDomains || 'unknown';
  const isReadDomainsForbidden = readDomainsCapability === 'forbidden';

  // Generated Domain Availability Query
  const canGenerateQuery = useCanGenerateTraefikMe(queryServerId, !isReadDomainsForbidden);


  type TraefikMeUIState =
    | "checking"
    | "available"
    | "not_configured"
    | "permission_denied"
    | "offline"
    | "server_error"
    | "invalid_response";

  const getTraefikMeUIState = (): TraefikMeUIState => {
    if (!target || canGenerateQuery.isPending) {
      return "checking";
    }
    if (canGenerateQuery.isError) {
      const error: any = canGenerateQuery.error;
      if (error.status === 403 || error.code === 'FORBIDDEN' || error.code === 'UNAUTHORIZED') {
        return "permission_denied";
      }
      if (error.code === 'OFFLINE' || error.code === 'TIMEOUT') {
        return "offline";
      }
      return "server_error";
    }
    if (canGenerateQuery.isSuccess) {
      try {
        const hasIp = parseCanGenerateResponse(canGenerateQuery.data);
        return hasIp ? "available" : "not_configured";
      } catch (err: any) {
        return "invalid_response";
      }
    }
    return "checking";
  };

  const traefikMeUIState = getTraefikMeUIState();

  // Compose Services list (fetched from loadServices endpoint)
  const composeServicesQuery = useComposeServices(!isApplication ? id : '');
  const composeServicesList = composeServicesQuery.data || [];

  const getComposeServicesErrorText = (): string | null => {
    if (isApplication) return null;
    const error: any = composeServicesQuery.error;
    if (!error) return null;

    if (error.status === 403) {
      return 'You do not have permission to load Compose services';
    }
    if (error.status === 404 || error.code === 'NOT_FOUND') {
      return 'Compose service listing is not supported by your Dokploy server version';
    }
    if (error.status === 401 || error.code === 'UNAUTHORIZED') {
      return 'Invalid API key';
    }
    if (error.message === 'INVALID_RESPONSE' || error.code === 'INVALID_RESPONSE') {
      return 'Invalid API response';
    }
    if (error.code === 'OFFLINE' || error.code === 'TIMEOUT') {
      return 'Network offline / Timeout';
    }
    if (error.status >= 500 || error.code === 'SERVER_ERROR') {
      return 'Server error loading services';
    }
    return 'Compose source unavailable';
  };

  const composeServicesErrorText = getComposeServicesErrorText();
  const composeServicesLoading = !isApplication && composeServicesQuery.isLoading;

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const createDomain = useCreateDomain();
  const updateDomain = useUpdateDomain(
    isApplication ? id : undefined,
    !isApplication ? id : undefined
  );
  const deleteDomain = useDeleteDomain(
    isApplication ? id : undefined,
    !isApplication ? id : undefined,
  );
  const generateDomainMutation = useGenerateDomain();
  const redeployComposeMutation = useRedeployCompose();

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const openAddSheet = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingDomain(null);
    setFormHost('');
    setFormPort('3000');
    setFormPath('/');
    setFormHttps(false);
    setFormCertType('letsencrypt');
    setSelectedService(null);
    setFormErrors({});
    setFormError(null);
    addSheetRef.current?.open();
  };

  const handleEditPress = () => {
    if (!selectedDomain) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    actionsSheetRef.current?.close();

    // Preload all fields
    setEditingDomain(selectedDomain);
    setFormHost(selectedDomain.host);
    setFormPort(String(selectedDomain.port));
    setFormPath(selectedDomain.path || '/');
    setFormHttps(selectedDomain.https);
    setFormCertType(selectedDomain.certificateType);
    setSelectedService(selectedDomain.serviceName || null);
    setFormErrors({});
    setFormError(null);

    // Short timeout to let actions sheet close before edit sheet opens
    setTimeout(() => {
      addSheetRef.current?.open();
    }, 250);
  };

  const handleSave = async () => {
    const isEditing = !!editingDomain;
    
    // 1. Run local form validation
    const { isValid, errors } = validateDomainForm(
      {
        host: formHost,
        port: formPort,
        path: formPath,
        https: formHttps,
        certificateType: formCertType,
        serviceName: selectedService,
      },
      !isApplication,
      composeServicesList
    );

    setFormErrors(errors);
    if (!isValid) {
      setFormError('Please resolve all validation errors.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setFormError(null);

    try {
      if (isEditing && editingDomain) {
        // Build Update Payload
        const payload = buildUpdatePayload(editingDomain.domainId, {
          host: formHost,
          port: formPort,
          path: formPath,
          https: formHttps,
          certificateType: formCertType,
          serviceName: selectedService,
        }, !isApplication);

        await updateDomain.mutateAsync(payload);
        
        if (!isApplication) {
          setMutationResult({
            resourceType: 'compose',
            resourceId: id,
            operation: 'update',
            requiresRedeploy: true,
          });
          setTimeout(() => {
            redeploySheetRef.current?.open();
          }, 400);
        }
      } else {
        // Build Create Payload
        const payload = buildCreatePayload({
          host: formHost,
          port: formPort,
          path: formPath,
          https: formHttps,
          certificateType: formCertType,
          serviceName: selectedService,
        }, !isApplication, id);

        await createDomain.mutateAsync(payload);

        if (!isApplication) {
          setMutationResult({
            resourceType: 'compose',
            resourceId: id,
            operation: 'create',
            requiresRedeploy: true,
          });
          setTimeout(() => {
            redeploySheetRef.current?.open();
          }, 400);
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      addSheetRef.current?.close();
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save domain configuration.');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleDeletePress = () => {
    if (!selectedDomain) return;
    actionsSheetRef.current?.close();
    const domainId = selectedDomain.domainId;
    const host = selectedDomain.host;

    setTimeout(() => {
      handleDelete(domainId, host);
    }, 250);
  };

  const handleDelete = async (domainId: string, host: string) => {
    if (deletingId) return;

    Alert.alert(
      'Delete Domain',
      `Are you sure you want to delete "${host}"?\n\nThis route will stop working immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(domainId);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            try {
              await deleteDomain.mutateAsync(domainId);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

              if (!isApplication) {
                setMutationResult({
                  resourceType: 'compose',
                  resourceId: id,
                  operation: 'delete',
                  requiresRedeploy: true,
                });
                setTimeout(() => {
                  redeploySheetRef.current?.open();
                }, 400);
              }
            } catch {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            } finally {
              setDeletingId(null);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const handleGenerateTraefikDomain = async () => {
    if (generateDomainMutation.isPending || !isApplication || !target) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    const payload: { appName: string; serverId?: string } = {
      appName: name,
    };
    if (target.kind === "remote") {
      payload.serverId = target.serverId;
    }
    
    try {
      const response = await generateDomainMutation.mutateAsync(payload);
      const generatedHost = parseGenerateDomainResponse(response);
      
      setFormHost(generatedHost);
      setFormPath('/');
      setFormHttps(false);
      setFormCertType('none');
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert('Generation Failed', err?.message || 'Unable to generate test domain from server.');
    }
  };

  const handleOpenInBrowser = async () => {
    if (!selectedDomain) return;
    actionsSheetRef.current?.close();

    const publicUrl = buildPublicUrl(selectedDomain);
    try {
      const supported = await Linking.canOpenURL(publicUrl);
      if (supported) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await Linking.openURL(publicUrl);
      } else {
        Alert.alert('Cannot Open Link', `Device is unable to open: ${publicUrl}`);
      }
    } catch {
      Alert.alert('Error', 'An error occurred while trying to launch browser.');
    }
  };

  const handleCopyUrl = async () => {
    if (!selectedDomain) return;
    actionsSheetRef.current?.close();

    const publicUrl = buildPublicUrl(selectedDomain);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await Clipboard.setStringAsync(publicUrl);
      Alert.alert('Copied', 'Domain URL copied to clipboard.');
    } catch {
      Alert.alert('Error', 'Failed to copy URL to clipboard.');
    }
  };

  const openActionsMenu = (domain: Domain) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDomain(domain);
    actionsSheetRef.current?.open();
  };

  const handleRedeployNow = () => {
    redeploySheetRef.current?.close();

    setTimeout(() => {
      Alert.alert(
        'Redeploy Stack',
        `Are you sure you want to redeploy the Compose stack "${name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Redeploy',
            onPress: async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              try {
                await redeployComposeMutation.mutateAsync(id);
                
                Alert.alert(
                  'Redeployment Accepted',
                  'The redeployment request has been queued on the server.',
                  [
                    { text: 'Later', style: 'cancel' },
                    {
                      text: 'View Logs',
                      onPress: () => {
                        router.push({
                          pathname: `/compose/${id}`,
                          params: { name, projectId: '', projectName: '' }
                        });
                      }
                    }
                  ]
                );
              } catch (err: any) {
                Alert.alert('Redeploy Failed', err?.message || 'Could not queue redeployment request.');
              }
            }
          }
        ]
      );
    }, 250);
  };

  // ─── Render ──────────────────────────────────────────────────────────────────
  const isDark = theme === 'dark';
  const accentFg = isDark ? '#000000' : '#ffffff';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerSubTitle, { color: colors.textSecondary }]}>
            {projectName}
          </Text>
          <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
            Domains & HTTPS
          </Text>
        </View>
        <CapabilityGate capability="manageDomains" access="write" fallback={null}>
          <TouchableOpacity
            id="add-domain-button"
            style={[styles.addBtn, { backgroundColor: colors.activeTint }]}
            onPress={openAddSheet}
          >
            <Ionicons name="add" size={22} color={accentFg} />
          </TouchableOpacity>
        </CapabilityGate>
      </View>

      {/* Content: gated behind readDomains */}
      <CapabilityGate capability="readDomains" access="read">
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {name}
          </Text>

          {/* Loading */}
          {isLoading && (
            <View style={styles.centeredState}>
              <ActivityIndicator size="large" color={colors.activeTint} />
              <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                Loading domains...
              </Text>
            </View>
          )}

          {/* Error */}
          {isError && !isLoading && (
            <View style={styles.centeredState}>
              <Ionicons name="warning-outline" size={40} color={colors.statusStopped} />
              <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                Failed to load domains
              </Text>
              <TouchableOpacity
                style={[styles.retryBtn, { borderColor: colors.border }]}
                onPress={() => refetch()}
              >
                <Text style={[styles.retryText, { color: colors.text }]}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Empty state */}
          {!isLoading && !isError && (!domains || domains.length === 0) && (
            <View style={styles.centeredState}>
              <Ionicons name="globe-outline" size={48} color={colors.textSecondary} />
              <Text style={[styles.stateTitle, { color: colors.text }]}>No Domains</Text>
              <Text style={[styles.stateText, { color: colors.textSecondary }]}>
                Tap + to add your first custom domain
              </Text>
            </View>
          )}

          {/* Domain list */}
          {!isLoading && domains && domains.length > 0 && (
            <View style={styles.domainList}>
              {domains.map((domain) => (
                <DomainCard
                  key={domain.domainId}
                  domain={domain}
                  onSelectActions={openActionsMenu}
                  deletingId={deletingId}
                  onDelete={handleDelete}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </CapabilityGate>

      {/* Add / Edit Domain Bottom Sheet */}
      <BottomSheet ref={addSheetRef} onClose={() => setEditingDomain(null)}>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text style={[styles.sheetTitle, { color: colors.text }]}>
            {editingDomain ? 'Edit Domain' : 'Add Domain'}
          </Text>
          <Text style={[styles.sheetSubtitle, { color: colors.textSecondary }]}>
            {editingDomain ? `Configure details for ${editingDomain.host}` : `Configure routing for ${name}`}
          </Text>

          {/* Host Field Label */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Hostname</Text>
          
          {/* Host Input Container */}
          <View style={styles.hostInputContainer}>
            <TextInput
              id="domain-host-input"
              style={[
                styles.input,
                {
                  flex: 1,
                  backgroundColor: colors.inputBg,
                  color: colors.inputText,
                  borderColor: formErrors.host ? colors.statusStopped : colors.inputBorder,
                },
              ]}
              value={formHost}
              onChangeText={setFormHost}
              placeholder="api.example.com"
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            {/* dice/wand icon for test domain generation (Applications only, when supported) */}
            {isApplication && traefikMeUIState === 'available' && !editingDomain && (
              <TouchableOpacity
                id="generate-test-domain-button"
                style={[styles.generateBtn, { backgroundColor: colors.statsBg, borderColor: colors.border }]}
                onPress={handleGenerateTraefikDomain}
                disabled={generateDomainMutation.isPending}
              >
                {generateDomainMutation.isPending ? (
                  <ActivityIndicator size="small" color={colors.activeTint} />
                ) : (
                  <Ionicons name="color-wand-outline" size={20} color={colors.activeTint} />
                )}
              </TouchableOpacity>
            )}
          </View>
          {formErrors.host && (
            <Text style={{ fontSize: 12, color: colors.statusStopped, marginTop: 4 }}>
              {formErrors.host}
            </Text>
          )}
          {isApplication && !editingDomain && (
            <View style={{ marginTop: 4 }}>
              {traefikMeUIState === 'checking' && (
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                  Checking test domain generation support...
                </Text>
              )}
              {traefikMeUIState === 'not_configured' && (
                <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                  Test domain generation requires a public server IP configured in Dokploy.
                </Text>
              )}
              {traefikMeUIState === 'permission_denied' && (
                <Text style={{ fontSize: 11, color: colors.statusStopped }}>
                  You do not have permission to generate test domains.
                </Text>
              )}
              {traefikMeUIState === 'offline' && (
                <Text style={{ fontSize: 11, color: colors.statusStopped }}>
                  Server is unreachable. Please check your internet connection.
                </Text>
              )}
              {traefikMeUIState === 'server_error' && (
                <Text style={{ fontSize: 11, color: colors.statusStopped }}>
                  Server error verifying test domain support.
                </Text>
              )}
              {traefikMeUIState === 'invalid_response' && (
                <Text style={{ fontSize: 11, color: colors.statusStopped }}>
                  Unsupported response format.
                </Text>
              )}
            </View>
          )}
          {formHost.includes('traefik.me') && (
            <Text style={{ fontSize: 11, color: colors.textSecondary, marginTop: 4, fontStyle: 'italic' }}>
              Generated test domains use HTTP and are intended for development or temporary access.
            </Text>
          )}

          {/* Service Selector (Compose Only) */}
          {!isApplication && (
            <View style={{ marginTop: 12 }}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 4 }]}>Compose Service</Text>
              {composeServicesLoading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}>
                  <ActivityIndicator size="small" color={colors.activeTint} style={{ marginRight: 8 }} />
                  <Text style={{ color: colors.textSecondary }}>Fetching services...</Text>
                </View>
              ) : composeServicesErrorText ? (
                editingDomain && editingDomain.serviceName ? (
                  <View>
                    <View style={[styles.serviceErrorCard, { backgroundColor: colors.statsBg, borderColor: colors.border, marginBottom: 8 }]}>
                      <Ionicons name="information-circle-outline" size={16} color={colors.textSecondary} style={{ marginRight: 6 }} />
                      <Text style={[styles.serviceErrorText, { color: colors.textSecondary, fontSize: 12 }]}>
                        {composeServicesErrorText}. Changing the service is disabled, but you can save other changes.
                      </Text>
                    </View>
                    <View style={styles.servicesGrid}>
                      <TouchableOpacity
                        style={[
                          styles.serviceBtn,
                          {
                            backgroundColor: colors.activeTint,
                            borderColor: colors.activeTint,
                            opacity: 0.7,
                          },
                        ]}
                        disabled={true}
                      >
                        <Text style={[styles.serviceBtnText, { color: accentFg, fontWeight: '700' }]}>
                          {editingDomain.serviceName}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={[styles.serviceErrorCard, { backgroundColor: colors.statsBg, borderColor: colors.statusStopped }]}>
                    <Ionicons name="alert-circle-outline" size={16} color={colors.statusStopped} style={{ marginRight: 6 }} />
                    <Text style={[styles.serviceErrorText, { color: colors.statusStopped }]}>
                      {composeServicesErrorText}. Domain creation is disabled.
                    </Text>
                  </View>
                )
              ) : !composeServicesLoading && composeServicesList.length === 0 ? (
                <View style={[styles.serviceErrorCard, { backgroundColor: colors.statsBg, borderColor: colors.statusStopped }]}>
                  <Ionicons name="alert-circle-outline" size={16} color={colors.statusStopped} style={{ marginRight: 6 }} />
                  <Text style={[styles.serviceErrorText, { color: colors.statusStopped }]}>
                    No services defined. Domain creation is disabled.
                  </Text>
                </View>
              ) : (
                <View style={styles.servicesGrid}>
                  {composeServicesList.map((service) => {
                    const isSelected = selectedService === service;
                    return (
                      <TouchableOpacity
                        key={service}
                        id={`compose-service-${service}`}
                        style={[
                          styles.serviceBtn,
                          {
                            backgroundColor: isSelected ? colors.activeTint : colors.statsBg,
                            borderColor: isSelected ? colors.activeTint : colors.border,
                          },
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setSelectedService(service);
                        }}
                      >
                        <Text
                          style={[
                            styles.serviceBtnText,
                            {
                              color: isSelected ? accentFg : colors.textSecondary,
                              fontWeight: isSelected ? '700' : '500',
                            },
                          ]}
                        >
                          {service}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              {formErrors.serviceName && (
                <Text style={{ fontSize: 12, color: colors.statusStopped, marginTop: 4 }}>
                  {formErrors.serviceName}
                </Text>
              )}
            </View>
          )}

          {/* Port */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Port</Text>
          <TextInput
            id="domain-port-input"
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                color: colors.inputText,
                borderColor: formErrors.port ? colors.statusStopped : colors.inputBorder,
              },
            ]}
            value={formPort}
            onChangeText={setFormPort}
            placeholder="3000"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
          />
          {formErrors.port && (
            <Text style={{ fontSize: 12, color: colors.statusStopped, marginTop: 4 }}>
              {formErrors.port}
            </Text>
          )}

          {/* Path */}
          <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Path prefix</Text>
          <TextInput
            id="domain-path-input"
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBg,
                color: colors.inputText,
                borderColor: formErrors.path ? colors.statusStopped : colors.inputBorder,
              },
            ]}
            value={formPath}
            onChangeText={setFormPath}
            placeholder="/"
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {formErrors.path && (
            <Text style={{ fontSize: 12, color: colors.statusStopped, marginTop: 4 }}>
              {formErrors.path}
            </Text>
          )}

          {/* HTTPS toggle */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, marginRight: 16 }}>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginBottom: 2, marginTop: 16 }]}>
                Enable HTTPS
              </Text>
              <Text style={[styles.toggleHint, { color: colors.textSecondary }]}>
                SSL via Traefik
              </Text>
            </View>
            <Switch
              value={formHttps}
              onValueChange={(val) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setFormHttps(val);
                if (!val) setFormCertType('none');
                else setFormCertType('letsencrypt');
              }}
              trackColor={{ false: colors.border, true: colors.statusRunning }}
              thumbColor={formHttps ? colors.activeTint : colors.textSecondary}
            />
          </View>

          {/* Certificate type selector (only shown when HTTPS is enabled) */}
          {formHttps && (
            <>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Certificate</Text>
              <View style={styles.certRow}>
                {(['letsencrypt', 'none', 'custom'] as CertificateType[]).map((ct) => (
                  <TouchableOpacity
                    key={ct}
                    id={`cert-type-${ct}`}
                    style={[
                      styles.certBtn,
                      {
                        backgroundColor:
                          formCertType === ct ? colors.activeTint : colors.statsBg,
                        borderColor:
                          formCertType === ct ? colors.activeTint : colors.border,
                      },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setFormCertType(ct);
                    }}
                  >
                    <Text
                      style={[
                        styles.certBtnText,
                        {
                          color: formCertType === ct ? accentFg : colors.textSecondary,
                          fontWeight: formCertType === ct ? '700' : '500',
                        },
                      ]}
                    >
                      {ct}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Error message */}
          {formError && (
            <Text style={[styles.errorText, { color: colors.statusStopped }]}>
              {formError}
            </Text>
          )}

          {/* Submit — gated behind manageDomains */}
          <CapabilityGate capability="manageDomains" access="write">
            <TouchableOpacity
              id="submit-domain-button"
              style={[
                styles.submitBtn,
                { backgroundColor: colors.activeTint },
                (createDomain.isPending || updateDomain.isPending) && { opacity: 0.6 },
              ]}
              onPress={handleSave}
              disabled={
                !!(createDomain.isPending || 
                updateDomain.isPending || 
                (!isApplication && !editingDomain && (composeServicesList.length === 0 || !!composeServicesErrorText)) ||
                (!isApplication && !!editingDomain && !editingDomain.serviceName && (composeServicesList.length === 0 || !!composeServicesErrorText)))
              }
            >
              {createDomain.isPending || updateDomain.isPending ? (
                <ActivityIndicator size="small" color={accentFg} />
              ) : (
                <Text style={[styles.submitBtnText, { color: accentFg }]}>
                  {editingDomain ? 'Update Domain' : 'Add Domain'}
                </Text>
              )}
            </TouchableOpacity>
          </CapabilityGate>

          <View style={{ height: 32 }} />
        </ScrollView>
      </BottomSheet>

      {/* Domain Actions Menu Bottom Sheet */}
      <BottomSheet ref={actionsSheetRef} onClose={() => setSelectedDomain(null)}>
        {selectedDomain && (
          <View style={styles.actionsSheetContent}>
            <Text style={[styles.actionsSheetTitle, { color: colors.text }]}>{selectedDomain.host}</Text>
            <Text style={[styles.actionsSheetSubtitle, { color: colors.textSecondary }]}>Domain Actions</Text>

            <TouchableOpacity
              id="domain-action-browser"
              style={[styles.actionRow, { borderBottomColor: colors.border }]}
              onPress={handleOpenInBrowser}
            >
              <Ionicons name="open-outline" size={20} color={colors.activeTint} style={{ marginRight: 12 }} />
              <Text style={[styles.actionText, { color: colors.text }]}>Open in Browser</Text>
            </TouchableOpacity>

            <TouchableOpacity
              id="domain-action-copy"
              style={[styles.actionRow, { borderBottomColor: colors.border }]}
              onPress={handleCopyUrl}
            >
              <Ionicons name="copy-outline" size={20} color={colors.activeTint} style={{ marginRight: 12 }} />
              <Text style={[styles.actionText, { color: colors.text }]}>Copy URL</Text>
            </TouchableOpacity>

            <TouchableOpacity
              id="domain-action-edit"
              style={[styles.actionRow, { borderBottomColor: colors.border }]}
              onPress={handleEditPress}
            >
              <Ionicons name="create-outline" size={20} color={colors.activeTint} style={{ marginRight: 12 }} />
              <Text style={[styles.actionText, { color: colors.text }]}>Edit Domain</Text>
            </TouchableOpacity>

            <TouchableOpacity
              id="domain-action-delete"
              style={styles.actionRow}
              onPress={handleDeletePress}
            >
              <Ionicons name="trash-outline" size={20} color={colors.statusStopped} style={{ marginRight: 12 }} />
              <Text style={[styles.actionText, { color: colors.statusStopped }]}>Delete Domain</Text>
            </TouchableOpacity>
          </View>
        )}
      </BottomSheet>

      {/* Compose Redeployment Prompt Bottom Sheet */}
      <BottomSheet ref={redeploySheetRef} onClose={() => setMutationResult(null)}>
        <View style={styles.actionsSheetContent}>
          <Text style={[styles.actionsSheetTitle, { color: colors.text }]}>{name}</Text>
          <Text style={[styles.actionsSheetSubtitle, { color: colors.textSecondary }]}>Redeployment Required</Text>
          
          <Text style={{ color: colors.text, textAlign: 'center', marginVertical: 16, fontSize: 14, lineHeight: 20 }}>
            Compose domain changes require redeployment before they take effect.
          </Text>

          <TouchableOpacity
            id="redeploy-now-button"
            style={[styles.submitBtn, { backgroundColor: colors.activeTint, marginTop: 12 }]}
            onPress={handleRedeployNow}
          >
            <Text style={[styles.submitBtnText, { color: accentFg }]}>Redeploy Now</Text>
          </TouchableOpacity>

          <TouchableOpacity
            id="redeploy-later-button"
            style={[styles.submitBtn, { backgroundColor: colors.statsBg, borderColor: colors.border, borderWidth: 1, marginTop: 12 }]}
            onPress={() => redeploySheetRef.current?.close()}
          >
            <Text style={[styles.submitBtnText, { color: colors.text }]}>Later</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  backBtn: { marginRight: 16 },
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
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    paddingTop: 8,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 20,
    marginTop: 4,
  },
  centeredState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 12,
  },
  stateTitle: { fontSize: 18, fontWeight: '700' },
  stateText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  retryBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginTop: 4,
  },
  retryText: { fontSize: 14, fontWeight: '600' },
  domainList: { gap: 12 },
  domainCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  domainCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  domainHostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  domainHost: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  moreBtn: { padding: 4 },
  deleteBtn: { padding: 4 },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  validationBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 12,
  },
  validationTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  validationStatusText: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  validateBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    fontWeight: '500',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
    marginTop: 16,
  },
  hostInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  generateBtn: {
    width: 48,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  toggleHint: {
    fontSize: 11,
    marginTop: 2,
  },
  certRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  certBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  certBtnText: { fontSize: 12 },
  errorText: {
    fontSize: 13,
    marginTop: 10,
    textAlign: 'center',
    fontWeight: '600',
  },
  submitBtn: {
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
  serviceErrorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
  },
  serviceErrorText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  servicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  serviceBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    minWidth: 80,
    alignItems: 'center',
  },
  serviceBtnText: {
    fontSize: 14,
  },
  actionsSheetContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  actionsSheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  actionsSheetSubtitle: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
