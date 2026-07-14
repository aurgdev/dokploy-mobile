import { DatabaseBackupConfig, BackupFile, SafeDestination } from './backup.types';

export type BackupHealthSeverity = 'neutral' | 'warning' | 'error' | 'success';

export interface BackupHealthSummary {
  status: string;
  severity: BackupHealthSeverity;
  label: string;
  description: string;
  latestBackupTime: string | null;
}

/**
 * Sorts backup files:
 * 1. Prefer real lastModifiedAt.
 * 2. Fall back to ISO filename timestamp if parsed.
 * 3. Sort newest first.
 * 4. Preserve stable order if neither exists.
 */
export function sortBackupFiles(files: BackupFile[]): BackupFile[] {
  return [...files].sort((a, b) => {
    const timeA = a.lastModifiedAt ? new Date(a.lastModifiedAt).getTime() : null;
    const timeB = b.lastModifiedAt ? new Date(b.lastModifiedAt).getTime() : null;

    const hasTimeA = timeA !== null && !isNaN(timeA);
    const hasTimeB = timeB !== null && !isNaN(timeB);

    if (hasTimeA && hasTimeB) {
      return (timeB as number) - (timeA as number);
    }
    if (hasTimeA) return -1;
    if (hasTimeB) return 1;
    return 0;
  });
}

/**
 * Computes the health summary for a backup configuration, destination details, and file listing.
 */
export function getBackupHealthSummary(
  config: DatabaseBackupConfig | undefined,
  files: BackupFile[] | undefined,
  isFilesLoading: boolean,
  filesError: any,
  destination?: SafeDestination | null,
  destError?: any
): BackupHealthSummary {
  if (!config) {
    return {
      status: 'status_unknown',
      severity: 'neutral',
      label: 'Status Unknown',
      description: 'No backup configuration found.',
      latestBackupTime: null,
    };
  }

  // Check malformed configuration
  if (!config.schedule || !config.destinationId) {
    return {
      status: 'malformed_configuration',
      severity: 'warning',
      label: 'Malformed Config',
      description: 'The backup configuration is missing schedule or destination reference.',
      latestBackupTime: null,
    };
  }

  // Check S3 Destination Errors
  if (destError) {
    const status = destError.status;
    if (status === 403) {
      return {
        status: 'permission_denied',
        severity: 'error',
        label: 'Permission Denied',
        description: 'You do not have permission to view destination details.',
        latestBackupTime: null,
      };
    }
    if (status === 404) {
      return {
        status: 'destination_deleted',
        severity: 'warning',
        label: 'Destination Not Found',
        description: 'The configured backup destination no longer exists.',
        latestBackupTime: null,
      };
    }
    return {
      status: 'destination_metadata_unavailable',
      severity: 'neutral',
      label: 'Destination Configured',
      description: 'Destination details could not be loaded, but backups are runnable.',
      latestBackupTime: null,
    };
  }

  // Check file query failed
  if (filesError) {
    return {
      status: 'status_unknown',
      severity: 'neutral',
      label: 'Status Unknown',
      description: 'Backup files could not be listed (temporary connection failure).',
      latestBackupTime: null,
    };
  }

  // Check file query not completed / loading
  if (files === undefined) {
    if (config.enabled === false) {
      return {
        status: 'configured_disabled',
        severity: 'warning',
        label: 'Schedule Disabled',
        description: 'Backup file status has not been checked.',
        latestBackupTime: null,
      };
    }
    return {
      status: 'configured_enabled',
      severity: 'neutral',
      label: 'Configured & Enabled',
      description: 'Backup file status has not been checked.',
      latestBackupTime: null,
    };
  }

  // Check recent files found
  if (files && files.length > 0) {
    const sorted = sortBackupFiles(files);
    const latestFile = sorted[0];
    const latestBackupTime = latestFile ? latestFile.lastModifiedAt : null;
    return {
      status: 'recent_files_found',
      severity: 'success',
      label: 'Backups Active',
      description: 'Recent backup files found.',
      latestBackupTime,
    };
  }

  // Check files.length === 0
  if (files && files.length === 0) {
    return {
      status: 'no_files_found',
      severity: 'neutral',
      label: 'No Files Found',
      description: 'No backup files found.',
      latestBackupTime: null,
    };
  }

  // Check disabled state
  if (config.enabled === false) {
    return {
      status: 'configured_disabled',
      severity: 'warning',
      label: 'Schedule Disabled',
      description: 'Backup schedule is configured but currently disabled.',
      latestBackupTime: null,
    };
  }

  return {
    status: 'configured_enabled',
    severity: 'neutral',
    label: 'Configured & Enabled',
    description: 'Backup schedule is active, but no files have been listed yet.',
    latestBackupTime: null,
  };
}
