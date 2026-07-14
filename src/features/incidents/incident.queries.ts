import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useActiveProfileId } from '../domains/domain.queries';
import { incidentApi, CentralizedDeployment, QueueJob } from './incident.api';
import { api } from '../../services/api';
import { 
  Incident, 
  IncidentSourceState, 
  IncidentAcknowledgement 
} from './incident.types';
import { 
  parseDeployments, 
  parseQueueJobs, 
  parseServiceHealth, 
  deduplicateIncidents, 
  sortIncidents 
} from './incident.rules';
import { 
  getAcknowledgements, 
  saveAcknowledgement, 
  removeAcknowledgement, 
  pruneAcknowledgements 
} from './incident.storage';
import { useDokployCapabilities, updateCapabilityStatus } from '../../services/queries';

export interface IncidentQueryResult {
  incidents: (Incident & { isAcknowledged: boolean; acknowledgedAt?: string })[];
  sourceState: IncidentSourceState;
  refreshedAt: string;
}

/**
 * Main query hook to fetch and normalize all incidents.
 * Query key: ['dokploy', profileId, 'incidents']
 */
export function useIncidents() {
  const { data: profileId } = useActiveProfileId();
  const { data: caps } = useDokployCapabilities();
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'incidents'] as const,
    queryFn: async (): Promise<IncidentQueryResult> => {
      if (!profileId) throw new Error('No active connection profile');

      const sourceState: IncidentSourceState = {
        deployments: 'loading',
        queue: 'loading',
        services: 'loading',
        backups: 'success', // We parse backups from deployments history
      };

      let rawDeployments: CentralizedDeployment[] = [];
      let rawQueue: QueueJob[] = [];
      let rawContainers: any[] = [];

      // 1. Fetch Centralized Deployments
      const depCap = caps?.readCentralDeployments || 'unknown';
      if (depCap === 'forbidden') {
        sourceState.deployments = 'forbidden';
      } else if (depCap === 'unsupported') {
        sourceState.deployments = 'unsupported';
      } else {
        try {
          rawDeployments = await incidentApi.getCentralDeployments();
          sourceState.deployments = 'success';
        } catch (err: any) {
          if (err.status === 403) {
            sourceState.deployments = 'forbidden';
            await updateCapabilityStatus(profileId, 'readCentralDeployments', 'forbidden');
          } else if (err.status === 404) {
            sourceState.deployments = 'unsupported';
            await updateCapabilityStatus(profileId, 'readCentralDeployments', 'unsupported');
          } else {
            sourceState.deployments = 'error';
          }
        }
      }

      // 2. Fetch Queue List
      const queueCap = caps?.readDeploymentQueue || 'unknown';
      if (queueCap === 'forbidden') {
        sourceState.queue = 'forbidden';
      } else if (queueCap === 'unsupported') {
        sourceState.queue = 'unsupported';
      } else {
        try {
          rawQueue = await incidentApi.getQueueList();
          sourceState.queue = 'success';
        } catch (err: any) {
          if (err.status === 403) {
            sourceState.queue = 'forbidden';
            await updateCapabilityStatus(profileId, 'readDeploymentQueue', 'forbidden');
          } else if (err.status === 404) {
            sourceState.queue = 'unsupported';
            await updateCapabilityStatus(profileId, 'readDeploymentQueue', 'unsupported');
          } else {
            sourceState.queue = 'error';
          }
        }
      }

      // 3. Fetch Service/Container Status
      const containerCap = caps?.readContainers || 'unknown';
      if (containerCap === 'forbidden') {
        sourceState.services = 'forbidden';
      } else if (containerCap === 'unsupported') {
        sourceState.services = 'unsupported';
      } else {
        try {
          rawContainers = await api.getContainers();
          sourceState.services = 'success';
        } catch (err: any) {
          if (err.status === 403) {
            sourceState.services = 'forbidden';
            await updateCapabilityStatus(profileId, 'readContainers', 'forbidden');
          } else if (err.status === 404) {
            sourceState.services = 'unsupported';
            await updateCapabilityStatus(profileId, 'readContainers', 'unsupported');
          } else {
            sourceState.services = 'error';
          }
        }
      }

      // 4. Parse raw data into normalized Incidents
      const parsedDeployments = parseDeployments(rawDeployments);
      const parsedQueue = parseQueueJobs(rawQueue);
      const parsedServices = parseServiceHealth(rawContainers);

      // We combine all parsed incidents
      const combined = [...parsedDeployments, ...parsedQueue, ...parsedServices];

      // 5. Deduplicate incidents
      const deduped = deduplicateIncidents(combined);

      // 6. Sort by severity (Critical -> Error -> Warning -> Info) and then newest first
      const sorted = sortIncidents(deduped);

      // 7. Load local acknowledgements
      const acknowledgements = await getAcknowledgements(profileId);
      const ackMap = new Map<string, IncidentAcknowledgement>();
      acknowledgements.forEach(ack => ackMap.set(ack.incidentId, ack));

      // Map acknowledged state
      const incidentsWithAck = sorted.map(inc => {
        const ack = ackMap.get(inc.incidentId);
        return {
          ...inc,
          isAcknowledged: !!ack,
          acknowledgedAt: ack?.acknowledgedAt,
        };
      });

      // 8. Prune expired or inactive acknowledgements in the background
      const activeIds = sorted.map(inc => inc.incidentId);
      pruneAcknowledgements(profileId, activeIds).catch(() => {});

      return {
        incidents: incidentsWithAck,
        sourceState,
        refreshedAt: new Date().toISOString(),
      };
    },
    enabled: !!profileId && !!caps,
    staleTime: 1000 * 30, // 30 seconds
    refetchInterval: (query) => {
      // Automatic refresh every 30 seconds while screen is active
      return 1000 * 30;
    },
  });
}

/**
 * Mutation to acknowledge (or un-acknowledge) an incident.
 */
export function useAcknowledgeIncident() {
  const queryClient = useQueryClient();
  const { data: profileId } = useActiveProfileId();

  return useMutation({
    mutationFn: async ({ incidentId, acknowledge }: { incidentId: string; acknowledge: boolean }) => {
      if (!profileId) throw new Error('No active connections profile');
      if (acknowledge) {
        return saveAcknowledgement(profileId, incidentId);
      } else {
        return removeAcknowledgement(profileId, incidentId);
      }
    },
    onSuccess: () => {
      if (profileId) {
        queryClient.invalidateQueries({
          queryKey: ['dokploy', profileId, 'incidents'],
        });
      }
    },
  });
}

/**
 * Query hook to fetch deployment logs.
 * Query key: ['dokploy', profileId, 'deployment-logs', deploymentId, tail]
 */
export function useDeploymentLogs(deploymentId: string | null, tail: number = 200) {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'deployment-logs', deploymentId, tail] as const,
    queryFn: () => {
      if (!deploymentId) throw new Error('No deployment ID provided');
      return incidentApi.getDeploymentLogs(deploymentId, tail);
    },
    enabled: !!deploymentId && !!profileId,
    staleTime: 1000 * 10, // 10 seconds stale
  });
}
