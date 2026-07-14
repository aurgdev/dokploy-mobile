export function validateVolumeBackupName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'Plan name is required';
  }
  return null;
}

export function validateCronExpression(cron: string): string | null {
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

export function validatePrefix(prefix: string): string | null {
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

export function validateRetention(type: string, customVal: string): string | null {
  if (type === 'custom') {
    const val = parseInt(customVal, 10);
    if (isNaN(val) || val <= 0 || val > 1000) {
      return 'Retention limit must be between 1 and 1000';
    }
  }
  return null;
}

export type VolumeBackupFormBlockReason =
  | "missing_name"
  | "missing_destination"
  | "missing_service"
  | "missing_named_volume"
  | "invalid_schedule"
  | "invalid_prefix"
  | "invalid_retention"
  | "loading_mounts"
  | "mount_discovery_failed"
  | "submitting"
  | null;

export function getVolumeBackupFormBlockReason(params: {
  name: string;
  destinationId: string;
  volumeName: string;
  schedule: string;
  prefix: string;
  retentionType: string;
  customRetention: string;
  isSubmitting: boolean;
  isMountsLoading: boolean;
  mountsError: any;
  resourceType: 'application' | 'compose';
  serviceName?: string | null;
}): VolumeBackupFormBlockReason {
  if (params.isSubmitting) return 'submitting';
  if (!params.name.trim()) return 'missing_name';
  if (!params.destinationId) return 'missing_destination';
  if (params.resourceType === 'compose' && !params.serviceName) return 'missing_service';
  if (params.isMountsLoading) return 'loading_mounts';
  if (params.mountsError) return 'mount_discovery_failed';
  if (!params.volumeName) return 'missing_named_volume';
  
  if (validateCronExpression(params.schedule)) return 'invalid_schedule';
  if (validatePrefix(params.prefix)) return 'invalid_prefix';
  if (validateRetention(params.retentionType, params.customRetention)) return 'invalid_retention';

  return null;
}
