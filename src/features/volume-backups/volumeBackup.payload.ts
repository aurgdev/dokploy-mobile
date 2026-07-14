import { VolumeBackupResourceType } from './volumeBackup.types';

export interface CreateVolumeBackupForm {
  name: string;
  volumeName: string;
  prefix: string;
  appName: string | null;
  serviceName: string | null;
  turnOff: boolean;
  cronExpression: string;
  keepLatestCount: number | null;
  enabled: boolean;
  destinationId: string;
}

export function buildCreateVolumeBackupPayload(params: {
  resourceId: string;
  resourceType: VolumeBackupResourceType;
  form: CreateVolumeBackupForm;
}) {
  const { resourceId, resourceType, form } = params;
  const isApp = resourceType === 'application';

  return {
    name: form.name.trim(),
    volumeName: form.volumeName,
    prefix: form.prefix.trim(),
    serviceType: resourceType,
    appName: form.appName,
    serviceName: isApp ? null : form.serviceName,
    turnOff: form.turnOff,
    cronExpression: form.cronExpression,
    keepLatestCount: form.keepLatestCount,
    enabled: form.enabled,
    applicationId: isApp ? resourceId : undefined,
    composeId: isApp ? undefined : resourceId,
    destinationId: form.destinationId,
  };
}

export function buildUpdateVolumeBackupPayload(params: {
  volumeBackupId: string;
  resourceId: string;
  resourceType: VolumeBackupResourceType;
  form: CreateVolumeBackupForm;
  originalBackup?: any;
}) {
  const { volumeBackupId, resourceId, resourceType, form, originalBackup } = params;
  const isApp = resourceType === 'application';

  return {
    ...(originalBackup || {}),
    volumeBackupId,
    name: form.name.trim(),
    volumeName: form.volumeName,
    prefix: form.prefix.trim(),
    serviceType: resourceType,
    appName: form.appName,
    serviceName: isApp ? null : form.serviceName,
    turnOff: form.turnOff,
    cronExpression: form.cronExpression,
    keepLatestCount: form.keepLatestCount,
    enabled: form.enabled,
    applicationId: isApp ? resourceId : undefined,
    composeId: isApp ? undefined : resourceId,
    destinationId: form.destinationId,
  };
}
