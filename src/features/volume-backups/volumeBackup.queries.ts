import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { volumeBackupApi } from './volumeBackup.api';
import { useActiveProfileId } from '../domains/domain.queries';
import { VolumeBackupPlan, VolumeBackupResourceType } from './volumeBackup.types';

export function useVolumeBackups(resourceId: string, resourceType: VolumeBackupResourceType) {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'volume-backups', resourceType, resourceId] as const,
    queryFn: () => volumeBackupApi.listVolumeBackups(resourceId, resourceType),
    enabled: !!resourceId && !!resourceType && !!profileId,
    staleTime: 1000 * 30,
  });
}

export function useVolumeBackupDetails(volumeBackupId: string) {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'volume-backup', volumeBackupId] as const,
    queryFn: () => volumeBackupApi.getVolumeBackup(volumeBackupId),
    enabled: !!volumeBackupId && !!profileId,
    staleTime: 1000 * 30,
  });
}

export function useApplicationNamedMounts(applicationId: string) {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'application-named-volumes', applicationId] as const,
    queryFn: () => volumeBackupApi.getApplicationNamedMounts(applicationId),
    enabled: !!applicationId && !!profileId,
    staleTime: 1000 * 60,
  });
}

export function useComposeServices(composeId: string) {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'compose-services', composeId] as const,
    queryFn: () => volumeBackupApi.getComposeServices(composeId),
    enabled: !!composeId && !!profileId,
    staleTime: 1000 * 60,
  });
}

export function useComposeNamedMounts(composeId: string, serviceName: string) {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'compose-named-volumes', composeId, serviceName] as const,
    queryFn: () => volumeBackupApi.getComposeMountsByService(composeId, serviceName),
    enabled: !!composeId && !!serviceName && !!profileId,
    staleTime: 1000 * 60,
  });
}

export function useCreateVolumeBackup(resourceId: string, resourceType: VolumeBackupResourceType) {
  const queryClient = useQueryClient();
  const { data: profileId } = useActiveProfileId();

  return useMutation({
    mutationFn: (payload: any) => volumeBackupApi.createVolumeBackup(payload),
    onSuccess: () => {
      if (profileId) {
        queryClient.invalidateQueries({
          queryKey: ['dokploy', profileId, 'volume-backups', resourceType, resourceId],
        });
      }
    },
  });
}

export function useUpdateVolumeBackup(resourceId: string, resourceType: VolumeBackupResourceType) {
  const queryClient = useQueryClient();
  const { data: profileId } = useActiveProfileId();

  return useMutation({
    mutationFn: (payload: any) => volumeBackupApi.updateVolumeBackup(payload),
    onSuccess: (_, variables) => {
      if (profileId) {
        queryClient.invalidateQueries({
          queryKey: ['dokploy', profileId, 'volume-backup', variables.volumeBackupId],
        });
        queryClient.invalidateQueries({
          queryKey: ['dokploy', profileId, 'volume-backups', resourceType, resourceId],
        });
      }
    },
  });
}

export function useDeleteVolumeBackup(resourceId: string, resourceType: VolumeBackupResourceType) {
  const queryClient = useQueryClient();
  const { data: profileId } = useActiveProfileId();

  return useMutation({
    mutationFn: (volumeBackupId: string) => volumeBackupApi.deleteVolumeBackup(volumeBackupId),
    onSuccess: (_, volumeBackupId) => {
      if (profileId) {
        queryClient.invalidateQueries({
          queryKey: ['dokploy', profileId, 'volume-backup', volumeBackupId],
        });
        queryClient.invalidateQueries({
          queryKey: ['dokploy', profileId, 'volume-backups', resourceType, resourceId],
        });
      }
    },
  });
}

export function useRunVolumeBackupManually() {
  return useMutation({
    mutationFn: (volumeBackupId: string) => volumeBackupApi.runVolumeBackupManually(volumeBackupId),
  });
}
