import { VolumeBackupPlan, SelectableNamedVolume, VolumeBackupResourceType } from './volumeBackup.types';

export function parseVolumeBackupPlan(
  raw: any, 
  defaultResourceType?: VolumeBackupResourceType, 
  defaultResourceId?: string
): VolumeBackupPlan {
  if (!raw || typeof raw !== 'object') {
    throw new Error('INVALID_RESPONSE');
  }
  
  const volumeBackupId = raw.volumeBackupId || raw.id;
  if (!volumeBackupId) {
    throw new Error('INVALID_RESPONSE');
  }

  const resourceType = raw.applicationId ? 'application' : raw.composeId ? 'compose' : (defaultResourceType || 'application');
  const resourceId = raw.applicationId || raw.composeId || (defaultResourceId || '');

  return {
    volumeBackupId,
    name: raw.name || 'Unnamed Plan',
    volumeName: raw.volumeName || '',
    prefix: raw.prefix || '',
    resourceType,
    resourceId,
    appName: raw.appName || null,
    serviceName: raw.serviceName || null,
    destinationId: raw.destinationId || '',
    cronExpression: raw.cronExpression || raw.schedule || '',
    keepLatestCount: typeof raw.keepLatestCount === 'number' ? raw.keepLatestCount : null,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : true,
    turnOff: typeof raw.turnOff === 'boolean' ? raw.turnOff : true,
    createdAt: raw.createdAt || null
  };
}

export function parseVolumeBackupPlanList(
  raw: any, 
  defaultResourceType?: VolumeBackupResourceType, 
  defaultResourceId?: string
): VolumeBackupPlan[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(item => parseVolumeBackupPlan(item, defaultResourceType, defaultResourceId));
  }
  if (raw && typeof raw === 'object') {
    const array = raw.data || raw.volumeBackups || raw.list || [];
    if (Array.isArray(array)) {
      return array.map(item => parseVolumeBackupPlan(item, defaultResourceType, defaultResourceId));
    }
  }
  throw new Error('INVALID_RESPONSE');
}

export function parseApplicationMounts(raw: any): SelectableNamedVolume[] {
  if (!raw) return [];
  if (typeof raw !== 'object') {
    throw new Error('INVALID_RESPONSE');
  }
  const array = Array.isArray(raw) ? raw : (raw.data || raw.mounts);
  if (!Array.isArray(array)) {
    throw new Error('INVALID_RESPONSE');
  }
  return array
    .filter((m: any) => m && (m.type === 'volume' || (m.volumeName && !m.hostPath)))
    .map((m: any) => ({
      volumeName: m.volumeName || m.name || '',
      displayName: m.volumeName || m.name || 'Unnamed Volume',
      mountPath: m.mountPath || null,
      serviceName: null,
      source: 'application_mount' as const
    }));
}

export function parseComposeServices(raw: any): string[] {
  if (!raw) return [];
  if (typeof raw !== 'object') {
    throw new Error('INVALID_RESPONSE');
  }
  const array = Array.isArray(raw) ? raw : (raw.data || raw.services);
  if (!Array.isArray(array)) {
    throw new Error('INVALID_RESPONSE');
  }
  return array
    .map((item: any) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return item.name || item.serviceName || '';
      return '';
    })
    .filter(Boolean);
}

export function parseComposeMounts(raw: any, serviceName: string): SelectableNamedVolume[] {
  if (!raw) return [];
  if (typeof raw !== 'object') {
    throw new Error('INVALID_RESPONSE');
  }
  const array = Array.isArray(raw) ? raw : (raw.data || raw.mounts);
  if (!Array.isArray(array)) {
    throw new Error('INVALID_RESPONSE');
  }
  return array
    .filter((m: any) => m && (m.type === 'volume' || (m.volumeName && !m.hostPath)))
    .map((m: any) => ({
      volumeName: m.volumeName || m.name || '',
      displayName: m.volumeName || m.name || 'Unnamed Volume',
      mountPath: m.mountPath || null,
      serviceName,
      source: 'compose_service' as const
    }));
}
