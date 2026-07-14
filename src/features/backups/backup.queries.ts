import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { backupApi } from './backup.api';
import { useActiveProfileId } from '../domains/domain.queries';
import { DatabaseBackupConfig, BackupFile, SafeDestination } from './backup.types';

/**
 * Fetch backup configurations for a specific database.
 * Query key: ['dokploy', profileId, 'database-backups', databaseType, databaseId]
 */
export function useDatabaseBackups(databaseId: string, databaseType: string) {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'database-backups', databaseType, databaseId] as const,
    queryFn: () => backupApi.getBackupsForDatabase(databaseId, databaseType),
    enabled: !!databaseId && !!databaseType && !!profileId,
    staleTime: 1000 * 30, // 30 seconds caching
  });
}

/**
 * Fetch a single backup configuration.
 * Query key: ['dokploy', profileId, 'backup', backupId]
 */
export function useBackupDetails(backupId: string) {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'backup', backupId] as const,
    queryFn: () => backupApi.getBackupById(backupId),
    enabled: !!backupId && !!profileId,
    staleTime: 1000 * 30,
  });
}

/**
 * List files from a backup destination.
 * Query key: ['dokploy', profileId, 'backup-files', backupId, destinationId, search, (serverId if relevant)]
 * If listBackupFiles fails, it must not hide the backup configuration itself (handled in UI via separate queries).
 */
export function useBackupFiles(backupId: string, destinationId: string, search: string, serverId?: string | null) {
  const { data: profileId } = useActiveProfileId();
  
  const queryKey = ['dokploy', profileId || 'no-profile', 'backup-files', backupId, destinationId, search] as any[];
  if (serverId && serverId.trim() !== '') {
    queryKey.push(serverId);
  }

  return useQuery({
    queryKey: queryKey as any,
    queryFn: () => backupApi.listBackupFiles({ destinationId, search, serverId: serverId || undefined }),
    enabled: !!backupId && !!destinationId && !!search && !!profileId,
    staleTime: 1000 * 30,
    placeholderData: (previousData) => previousData,
  });
}

/**
 * Fetch safe S3 destination details.
 * Query key: ['dokploy', profileId, 'safe-destination', destinationId]
 */
export function useDestinationDetails(destinationId: string) {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'safe-destination', destinationId] as const,
    queryFn: () => backupApi.getDestination(destinationId),
    enabled: !!destinationId && !!profileId,
    staleTime: 1000 * 60 * 5, // 5 minutes caching
  });
}

/**
 * Mutation to run manual database backup.
 * Invalidate/refetch only that backup configuration and its backup files.
 */
export function useRunDatabaseBackup(databaseType: string, destinationId?: string, prefix?: string) {
  const queryClient = useQueryClient();
  const { data: profileId } = useActiveProfileId();

  return useMutation({
    mutationFn: (input: { backupId: string }) => 
      backupApi.runDatabaseBackup({ backupId: input.backupId, databaseType }),
    onSuccess: (_, variables) => {
      if (profileId) {
        // Refetch/invalidate specifically this backup configuration
        queryClient.invalidateQueries({
          queryKey: ['dokploy', profileId, 'backup', variables.backupId],
        });
        
        // Refetch/invalidate specifically this backup config's files list.
        // We can invalidate the prefix-level search or target the base backup-files list for this backup configuration.
        queryClient.invalidateQueries({
          queryKey: ['dokploy', profileId, 'backup-files', variables.backupId],
        });
      }
    },
  });
}

/**
 * Fetch all safe destinations.
 * Query key: ['dokploy', profileId, 'safe-destinations']
 */
export function useSafeDestinations() {
  const { data: profileId } = useActiveProfileId();
  return useQuery({
    queryKey: ['dokploy', profileId || 'no-profile', 'safe-destinations'] as const,
    queryFn: () => backupApi.getAllDestinations(),
    enabled: !!profileId,
    staleTime: 1000 * 60 * 5,
  });
}

/**
 * Create a new database backup plan.
 */
export function useCreateBackup(databaseId: string, databaseType: string) {
  const queryClient = useQueryClient();
  const { data: profileId } = useActiveProfileId();

  return useMutation({
    mutationFn: (payload: any) => backupApi.createBackup(payload),
    onSuccess: () => {
      if (profileId) {
        queryClient.invalidateQueries({
          queryKey: ['dokploy', profileId, 'database-backups', databaseType, databaseId],
        });
        queryClient.invalidateQueries({
          queryKey: ['dokploy', profileId, databaseType, databaseId],
        });
      }
    },
  });
}

/**
 * Update an existing database backup plan.
 */
export function useUpdateBackup(databaseId: string, databaseType: string) {
  const queryClient = useQueryClient();
  const { data: profileId } = useActiveProfileId();

  return useMutation({
    mutationFn: (payload: any) => backupApi.updateBackup(payload),
    onSuccess: (_, variables) => {
      if (profileId) {
        queryClient.invalidateQueries({
          queryKey: ['dokploy', profileId, 'backup', variables.backupId],
        });
        queryClient.invalidateQueries({
          queryKey: ['dokploy', profileId, 'database-backups', databaseType, databaseId],
        });
        queryClient.invalidateQueries({
          queryKey: ['dokploy', profileId, 'backup-files', variables.backupId],
        });
      }
    },
  });
}
