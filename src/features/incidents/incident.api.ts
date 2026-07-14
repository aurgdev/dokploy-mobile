import { dokployFetch } from '../../services/api';

export interface CentralizedDeployment {
  id: string;
  applicationId: string;
  status: 'running' | 'done' | 'error' | 'cancelled' | string;
  title: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  applicationName?: string | null;
  projectName?: string | null;
}

export interface QueueJob {
  id: string;
  name: string;
  data: any;
  timestamp: number; // millisecond timestamp
  processedOn?: number | null;
  finishedOn?: number | null;
  failedReason?: string | null;
  state: 'active' | 'waiting' | 'delayed' | 'failed' | 'completed' | string;
  servicePath?: string | null;
}

export interface DeploymentLogResponse {
  logs: string;
}

export const incidentApi = {
  getCentralDeployments: (): Promise<CentralizedDeployment[]> =>
    dokployFetch('/deployment.allCentralized'),

  getQueueList: (): Promise<QueueJob[]> =>
    dokployFetch('/deployment.queueList'),

  getDeploymentLogs: (deploymentId: string, tail: number = 200): Promise<DeploymentLogResponse> =>
    dokployFetch(`/deployment.readLogs?deploymentId=${deploymentId}&tail=${tail}`),
};
