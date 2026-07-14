import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { domainApi } from './domain.api';
import { api } from '../../services/api';
import { CreateDomainInput, UpdateDomainInput } from './domain.types';
import { getProfile } from '../../services/profileStore';

// Helper hook to resolve active profile ID reactively in queries
export function useActiveProfileId() {
  return useQuery({
    queryKey: ['active-profile-id'] as const,
    queryFn: async () => {
      const profile = await getProfile();
      return profile?.profileId || null;
    },
    staleTime: Infinity,
  });
}

// ─── Read Hooks ───────────────────────────────────────────────────────────────

/**
 * List domains for an Application.
 * Includes active profileId in every query key.
 */
export function useAppDomains(applicationId: string) {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'domains', 'application', applicationId] as const,
    queryFn: () => domainApi.getByApplicationId(applicationId),
    enabled: !!applicationId && !!profileId,
    staleTime: 1000 * 30,
  });
}

/**
 * List domains for a Compose stack.
 * Includes active profileId in every query key.
 */
export function useComposeDomains(composeId: string) {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'domains', 'compose', composeId] as const,
    queryFn: () => domainApi.getByComposeId(composeId),
    enabled: !!composeId && !!profileId,
    staleTime: 1000 * 30,
  });
}

/**
 * List all custom certificates.
 * Includes active profileId in every query key.
 */
export function useCertificates() {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'certificates'] as const,
    queryFn: () => domainApi.getCertificates(),
    enabled: !!profileId,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Retrieve Docker Compose stack services.
 */
export function useComposeServices(composeId: string) {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'compose', 'services', composeId] as const,
    queryFn: () => domainApi.getComposeServices(composeId),
    enabled: !!composeId && !!profileId,
    staleTime: 1000 * 30,
  });
}

/**
 * Run diagnostic domain validation check.
 * Query key: ['dokploy', profileId, 'domain-validation', domainId]
 * API request uses actual hostname domain.host
 */
export function useDomainValidation(domainId: string, host: string, serverIp?: string) {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'domain-validation', domainId] as const,
    queryFn: () => domainApi.validateDomain({ domain: host, ...(serverIp ? { serverIp } : {}) }),
    enabled: false,
    staleTime: Infinity,
  });
}

// ─── Mutation Hooks ───────────────────────────────────────────────────────────

/**
 * Create a new domain and invalidate the relevant profile-scoped list.
 */
export function useCreateDomain() {
  const queryClient = useQueryClient();
  const { data: profileId } = useActiveProfileId();
  return useMutation({
    mutationFn: (input: CreateDomainInput) => domainApi.create(input),
    onSuccess: (_, variables) => {
      if (profileId) {
        if (variables.applicationId) {
          queryClient.invalidateQueries({
            queryKey: ['dokploy', profileId, 'domains', 'application', variables.applicationId],
          });
        }
        if (variables.composeId) {
          queryClient.invalidateQueries({
            queryKey: ['dokploy', profileId, 'domains', 'compose', variables.composeId],
          });
        }
      }
    },
  });
}

/**
 * Update an existing domain and invalidate the relevant profile-scoped list.
 */
export function useUpdateDomain(applicationId?: string, composeId?: string) {
  const queryClient = useQueryClient();
  const { data: profileId } = useActiveProfileId();
  return useMutation({
    mutationFn: (input: UpdateDomainInput) => domainApi.update(input),
    onSuccess: () => {
      if (profileId) {
        if (applicationId) {
          queryClient.invalidateQueries({
            queryKey: ['dokploy', profileId, 'domains', 'application', applicationId],
          });
        }
        if (composeId) {
          queryClient.invalidateQueries({
            queryKey: ['dokploy', profileId, 'domains', 'compose', composeId],
          });
        }
      }
    },
  });
}

/**
 * Delete a domain and invalidate the relevant profile-scoped list.
 */
export function useDeleteDomain(applicationId?: string, composeId?: string) {
  const queryClient = useQueryClient();
  const { data: profileId } = useActiveProfileId();
  return useMutation({
    mutationFn: (domainId: string) => domainApi.remove(domainId),
    onSuccess: () => {
      if (profileId) {
        if (applicationId) {
          queryClient.invalidateQueries({
            queryKey: ['dokploy', profileId, 'domains', 'application', applicationId],
          });
        }
        if (composeId) {
          queryClient.invalidateQueries({
            queryKey: ['dokploy', profileId, 'domains', 'compose', composeId],
          });
        }
      }
    },
  });
}

/**
 * Fetch application details.
 */
export function useApplicationDetails(applicationId: string) {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'application', applicationId] as const,
    queryFn: () => domainApi.getApplication(applicationId),
    enabled: !!applicationId && !!profileId,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Fetch Compose stack details.
 */
export function useComposeDetails(composeId: string) {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'compose', composeId] as const,
    queryFn: () => domainApi.getCompose(composeId),
    enabled: !!composeId && !!profileId,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Query check to see if Traefik.me domain generation is supported.
 * Query key: ['dokploy', profileId, 'domains', 'can-generate-traefik-me', serverId]
 */
export function useCanGenerateTraefikMe(serverId?: string, enabled: boolean = true) {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'domains', 'can-generate-traefik-me', serverId || 'local'] as const,
    queryFn: () => domainApi.canGenerateTraefikMeDomains(serverId),
    enabled: !!profileId && typeof serverId === 'string' && enabled,
    staleTime: 1000 * 60 * 10,
  });
}

/**
 * Generate a free Traefik.me test domain.
 */
export function useGenerateDomain() {
  return useMutation({
    mutationFn: (input: { appName: string; serverId?: string }) => domainApi.generateDomain(input),
  });
}

/**
 * Redeploy Compose Stack mutation.
 * Reuses the existing /compose.redeploy API.
 */
export function useRedeployCompose() {
  return useMutation({
    mutationFn: (composeId: string) => domainApi.getCompose(composeId).then(() => {
      return api.redeployCompose(composeId);
    }),
  });
}
