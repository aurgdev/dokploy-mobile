import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import { api, dokployFetch, getClientConfig, addApiListener } from './api';
import { getCachedInstanceInfo, saveCachedInstanceInfo, getCachedCapabilities, saveCachedCapabilities } from './cache';
import { 
  DokployInstanceInfo, 
  DokployCapabilities, 
  DOKPLOY_CAPABILITY_KEYS, 
  ConnectionStatus,
  DokployCapabilityKey,
  CapabilityStatus
} from './api.types';

// Centralized QueryClient instance exported for the entire application
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 1000 * 30, // 30 seconds caching
    },
  },
});

// Helper to create a default capability map with the specified status
export function createDefaultCapabilities(status: CapabilityStatus): DokployCapabilities {
  const caps = {} as any;
  for (const key of DOKPLOY_CAPABILITY_KEYS) {
    caps[key] = status;
  }
  return caps as DokployCapabilities;
}

// Function to dynamically update individual capability state
export async function updateCapabilityStatus(profileId: string, key: DokployCapabilityKey, status: CapabilityStatus) {
  queryClient.setQueriesData<DokployCapabilities>({ queryKey: ['capabilities'] }, (old) => {
    if (!old) return old;
    if (old[key] === status) return old;
    
    const updated = { ...old, [key]: status };
    
    // Asynchronously save updated capabilities to AsyncStorage cache
    getCachedCapabilities(profileId).then(cached => {
      if (cached) {
        saveCachedCapabilities(profileId, {
          dokployVersion: cached.dokployVersion,
          releaseTag: cached.releaseTag,
          discovery: cached.discovery,
          capabilities: updated
        });
      }
    }).catch(() => {});

    return updated;
  });
}

// Helper to extract clean endpoint paths for matching (removes query strings and /api prefix)
export function cleanEndpointPath(endpoint: string): string {
  let path = endpoint.split('?')[0];
  if (path.startsWith('/api')) {
    path = path.substring(4);
  }
  return path;
}

// Add API Listener to dynamically update capability states when real endpoints are hit
addApiListener(async (endpoint, success, status) => {
  const { profileId } = await getClientConfig();
  if (!profileId) return;

  const cleanPath = cleanEndpointPath(endpoint);

  // Special case: /project.all maps to core read capabilities
  if (cleanPath === '/project.all') {
    const newStatus: CapabilityStatus = success ? 'available' : (status === 403 ? 'forbidden' : 'unknown');
    if (newStatus !== 'unknown') {
      await updateCapabilityStatus(profileId, 'readProjects', newStatus);
      await updateCapabilityStatus(profileId, 'readApplications', newStatus);
      await updateCapabilityStatus(profileId, 'readDatabases', newStatus);
      await updateCapabilityStatus(profileId, 'readCompose', newStatus);
    }
    return;
  }

  let capKey: DokployCapabilityKey | null = null;

  if (cleanPath === '/project.create') {
    capKey = 'createProjects';
  } else if (cleanPath === '/application.start' || cleanPath === '/application.stop' || cleanPath === '/application.restart') {
    capKey = 'manageApplicationLifecycle';
  } else if (cleanPath === '/application.deploy') {
    capKey = 'deployApplications';
  } else if (cleanPath === '/compose.redeploy') {
    capKey = 'deployCompose';
  } else if (cleanPath === '/compose.stop') {
    capKey = 'manageComposeLifecycle';
  } else if (cleanPath === '/database.start' || cleanPath === '/database.stop') {
    capKey = 'manageDatabaseLifecycle';
  } else if (cleanPath === '/docker.getContainers') {
    capKey = 'readContainers';
  } else if (
    cleanPath === '/settings.cleanAll' ||
    cleanPath === '/settings.cleanUnusedImages' ||
    cleanPath === '/settings.cleanUnusedVolumes' ||
    cleanPath === '/settings.cleanStoppedContainers' ||
    cleanPath === '/settings.reloadServer'
  ) {
    capKey = 'manageDocker';
  } else if (cleanPath === '/domain.byApplicationId' || cleanPath === '/domain.byComposeId') {
    capKey = 'readDomains';
  } else if (
    cleanPath === '/domain.create' ||
    cleanPath === '/domain.update' ||
    cleanPath === '/domain.delete' ||
    cleanPath === '/domain.generateDomain'
  ) {
    capKey = 'manageDomains';
  } else if (cleanPath === '/certificate.all') {
    capKey = 'manageCertificates';
  } else if (cleanPath === '/backup.one') {
    capKey = 'readBackups';
  } else if (
    cleanPath === '/backup.manualBackupPostgres' ||
    cleanPath === '/backup.manualBackupMySql' ||
    cleanPath === '/backup.manualBackupMariadb' ||
    cleanPath === '/backup.manualBackupMongo'
  ) {
    capKey = 'runBackups';
  } else if (cleanPath === '/volumeBackups.list' || cleanPath === '/volumeBackup.list') {
    capKey = 'readVolumeBackups';
  } else if (
    cleanPath === '/volumeBackups.create' ||
    cleanPath === '/volumeBackup.create' ||
    cleanPath === '/volumeBackups.update' ||
    cleanPath === '/volumeBackup.update' ||
    cleanPath === '/volumeBackups.delete' ||
    cleanPath === '/volumeBackup.delete'
  ) {
    capKey = 'manageVolumeBackups';
  } else if (cleanPath === '/volumeBackups.runManually' || cleanPath === '/volumeBackup.runManually') {
    capKey = 'runVolumeBackups';
  }

  if (capKey) {
    const newStatus: CapabilityStatus = success ? 'available' : (status === 403 ? 'forbidden' : 'unknown');
    if (newStatus !== 'unknown') {
      await updateCapabilityStatus(profileId, capKey, newStatus);
    }
  }
});

export function useDokployInstanceInfo() {
  return useQuery({
    queryKey: ['instance-info'],
    queryFn: async (): Promise<DokployInstanceInfo> => {
      const { url, profileId } = await getClientConfig();
      if (!profileId || !url) {
        throw new Error('No active connection profile');
      }

      const cached = await getCachedInstanceInfo(profileId);
      
      let version: string | null = cached?.instance.version || null;
      let status: ConnectionStatus = 'checking';
      let healthy = cached?.instance.healthy ?? null;
      let lastSuccessfulConnectionAt = cached?.instance.lastSuccessfulConnectionAt || null;

      try {
        const res = await dokployFetch('/settings.getDokployVersion');
        if (res) {
          if (typeof res === 'string') {
            version = res;
          } else if (typeof res === 'object') {
            version = (res as any).version || (res as any).data?.version || version || 'unknown';
          }
        }
        status = 'connected';
        healthy = true;
        lastSuccessfulConnectionAt = new Date().toISOString();
      } catch (err: any) {
        try {
          await api.getProjects();
          status = 'connected';
          healthy = true;
          lastSuccessfulConnectionAt = new Date().toISOString();
        } catch (innerErr: any) {
          healthy = false;
          if (innerErr.status === 401) {
            status = 'authentication_failed';
          } else if (innerErr.status === 403) {
            status = 'permission_limited';
          } else if (innerErr.code === 'TIMEOUT') {
            status = 'offline';
          } else if (innerErr.code === 'SERVER_ERROR') {
            status = 'server_error';
          } else {
            status = 'offline';
          }
        }
      }

      const instance: DokployInstanceInfo = {
        baseUrl: url,
        version,
        releaseTag: version ? `v${version}` : (cached?.instance.releaseTag || null),
        connectionStatus: status,
        healthEndpointAvailable: true,
        healthy,
        connectedAt: new Date().toISOString(),
        lastSuccessfulConnectionAt,
        lastCheckedAt: new Date().toISOString(),
      };

      await saveCachedInstanceInfo(profileId, { instance });
      return instance;
    },
    staleTime: 1000 * 30,
  });
}

export function useDokployCapabilities() {
  const { data: instanceInfo } = useDokployInstanceInfo();

  return useQuery({
    queryKey: ['capabilities', instanceInfo?.version],
    queryFn: async (): Promise<DokployCapabilities> => {
      const { profileId } = await getClientConfig();
      if (!profileId) throw new Error('No active profile');

      const cached = await getCachedCapabilities(profileId);
      
      // Cache migration / schema reset helper:
      // If capabilities are cached as 'unsupported' due to previous path check bugs, reset them to 'unknown'
      if (cached && cached.capabilities) {
        if (cached.capabilities.readDomains === 'unsupported') {
          cached.capabilities.readDomains = 'unknown';
        }
        if (cached.capabilities.manageDomains === 'unsupported') {
          cached.capabilities.manageDomains = 'unknown';
        }
      }

      let openApiAvailable = false;
      let caps: DokployCapabilities = cached?.capabilities || createDefaultCapabilities('unknown');

      try {
        const openApi = await dokployFetch('/settings.getOpenApiDocument');
        if (openApi && openApi.paths) {
          openApiAvailable = true;
          const paths = Object.keys(openApi.paths);
          
          caps = {
            readProjects: paths.includes('/project.all') ? (cached?.capabilities.readProjects === 'available' ? 'available' : 'unknown') : 'unsupported',
            createProjects: paths.includes('/project.create') ? (cached?.capabilities.createProjects || 'unknown') : 'unsupported',
            readApplications: paths.includes('/project.all') ? (cached?.capabilities.readApplications === 'available' ? 'available' : 'unknown') : 'unsupported',
            manageApplicationLifecycle: (paths.includes('/application.start') && paths.includes('/application.stop')) ? (cached?.capabilities.manageApplicationLifecycle || 'unknown') : 'unsupported',
            deployApplications: paths.includes('/application.deploy') ? (cached?.capabilities.deployApplications || 'unknown') : 'unsupported',
            readCompose: paths.includes('/compose.readLogs') ? (cached?.capabilities.readCompose === 'available' ? 'available' : 'unknown') : 'unsupported',
            manageComposeLifecycle: paths.includes('/compose.stop') ? (cached?.capabilities.manageComposeLifecycle || 'unknown') : 'unsupported',
            deployCompose: paths.includes('/compose.redeploy') ? (cached?.capabilities.deployCompose || 'unknown') : 'unsupported',
            readDatabases: paths.includes('/project.all') ? (cached?.capabilities.readDatabases === 'available' ? 'available' : 'unknown') : 'unsupported',
            manageDatabaseLifecycle: (paths.includes('/database.start') && paths.includes('/database.stop')) ? (cached?.capabilities.manageDatabaseLifecycle || 'unknown') : 'unsupported',
            readContainers: paths.includes('/docker.getContainers') ? (cached?.capabilities.readContainers || 'unknown') : 'unsupported',
            manageDocker: paths.includes('/settings.cleanUnusedImages') ? (cached?.capabilities.manageDocker || 'unknown') : 'unsupported',
            readDomains: (paths.includes('/domain.byApplicationId') || paths.includes('/domain.byComposeId'))
              ? (cached?.capabilities.readDomains === 'available' ? 'available' : 'unknown')
              : 'unsupported',
            manageDomains: paths.includes('/domain.create') ? (cached?.capabilities.manageDomains || 'unknown') : 'unsupported',
            manageCertificates: paths.includes('/certificate.all') ? (cached?.capabilities.manageCertificates || 'unknown') : 'unsupported',
            readBackups: paths.includes('/backup.one') ? (cached?.capabilities.readBackups || 'unknown') : 'unsupported',
            manageBackups: paths.includes('/backup.create') ? (cached?.capabilities.manageBackups || 'unknown') : 'unsupported',
            runBackups: (paths.includes('/backup.manualBackupPostgres') || paths.includes('/backup.manualBackupMySql') || paths.includes('/backup.manualBackupMariadb') || paths.includes('/backup.manualBackupMongo')) ? (cached?.capabilities.runBackups || 'unknown') : 'unsupported',
            readNotifications: paths.includes('/notification.all') ? (cached?.capabilities.readNotifications || 'unknown') : 'unsupported',
            manageNotifications: paths.includes('/notification.create') ? (cached?.capabilities.manageNotifications || 'unknown') : 'unsupported',
            readServers: paths.includes('/server.all') ? (cached?.capabilities.readServers || 'unknown') : 'unsupported',
            manageServers: paths.includes('/server.create') ? (cached?.capabilities.manageServers || 'unknown') : 'unsupported',
            manageTraefik: paths.includes('/settings.reloadTraefik') ? (cached?.capabilities.manageTraefik || 'unknown') : 'unsupported',
            cancelDeployments: paths.includes('/deployment.cancel') ? (cached?.capabilities.cancelDeployments || 'unknown') : 'unsupported',
            terminateBuilds: paths.includes('/deployment.terminate') ? (cached?.capabilities.terminateBuilds || 'unknown') : 'unsupported',
            rollbackDeployments: paths.includes('/application.rollback') ? (cached?.capabilities.rollbackDeployments || 'unknown') : 'unsupported',
            readVolumeBackups: (paths.includes('/volumeBackups.list') || paths.includes('/volumeBackup.list')) ? (cached?.capabilities.readVolumeBackups || 'unknown') : 'unsupported',
            manageVolumeBackups: (paths.includes('/volumeBackups.create') || paths.includes('/volumeBackup.create')) ? (cached?.capabilities.manageVolumeBackups || 'unknown') : 'unsupported',
            runVolumeBackups: (paths.includes('/volumeBackups.runManually') || paths.includes('/volumeBackup.runManually')) ? (cached?.capabilities.runVolumeBackups || 'unknown') : 'unsupported',
          };
        } else {
          caps = cached?.capabilities || createDefaultCapabilities('unknown');
        }
      } catch (err: any) {
        if (err.code === 'FORBIDDEN' || err.code === 'UNAUTHORIZED') {
          caps = createDefaultCapabilities('forbidden');
        } else if (err.code === 'NOT_FOUND') {
          openApiAvailable = false;
          caps = cached?.capabilities || createDefaultCapabilities('unknown');
        } else {
          if (cached?.capabilities) {
            caps = cached.capabilities;
            openApiAvailable = cached.discovery.openApiAvailable;
          } else {
            caps = createDefaultCapabilities('unknown');
          }
        }
      }

      await saveCachedCapabilities(profileId, {
        dokployVersion: instanceInfo?.version || null,
        releaseTag: instanceInfo?.releaseTag || null,
        discovery: {
          openApiAvailable,
          openApiFetchedAt: openApiAvailable ? new Date().toISOString() : null,
          discoverySource: openApiAvailable ? 'openapi' : 'mixed',
        },
        capabilities: caps,
      });

      return caps;
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useConnectionHealth() {
  const { data: instanceInfo } = useDokployInstanceInfo();
  return instanceInfo?.healthy ?? false;
}

export function useRefreshCapabilities() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await queryClient.refetchQueries({ queryKey: ['instance-info'] });
      await queryClient.refetchQueries({ queryKey: ['capabilities'] });
    }
  });
}
