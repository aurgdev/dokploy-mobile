export type IncidentSeverity = 'critical' | 'error' | 'warning' | 'info';

export type IncidentCategory =
  | 'deployment_failed'
  | 'deployment_stuck'
  | 'queue_stuck'
  | 'service_unhealthy'
  | 'backup_failed'
  | 'volume_backup_failed';

export type IncidentResourceType =
  | 'application'
  | 'compose'
  | 'database'
  | 'server'
  | 'backup'
  | 'volumeBackup'
  | 'unknown';

export interface Incident {
  incidentId: string;
  category: IncidentCategory;
  severity: IncidentSeverity;
  title: string;
  summary: string;
  resourceType: IncidentResourceType;
  resourceId: string | null;
  resourceName: string | null;
  projectName: string | null;
  deploymentId: string | null;
  createdAt: string;
  detectedAt: string;
  sourceStatus: string | null;
  canOpenResource: boolean;
  canViewLogs: boolean;
}

export interface IncidentAcknowledgement {
  incidentId: string;
  acknowledgedAt: string;
}

export interface IncidentSourceState {
  deployments: 'success' | 'loading' | 'error' | 'unsupported' | 'forbidden';
  queue: 'success' | 'loading' | 'error' | 'unsupported' | 'forbidden';
  services: 'success' | 'loading' | 'error' | 'unsupported' | 'forbidden';
  backups: 'success' | 'loading' | 'error' | 'unsupported' | 'forbidden';
}
