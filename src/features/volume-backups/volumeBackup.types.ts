export type VolumeBackupResourceType = 'application' | 'compose';

export interface VolumeBackupPlan {
  volumeBackupId: string;
  name: string;
  volumeName: string;
  prefix: string;
  resourceType: VolumeBackupResourceType;
  resourceId: string;
  appName: string | null;
  serviceName: string | null;
  destinationId: string;
  cronExpression: string;
  keepLatestCount: number | null;
  enabled: boolean | null;
  turnOff: boolean;
  createdAt: string | null;
}

export interface SelectableNamedVolume {
  volumeName: string;
  displayName: string;
  mountPath: string | null;
  serviceName: string | null;
  source: 'application_mount' | 'compose_service';
}
