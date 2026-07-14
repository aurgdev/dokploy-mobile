import { dokployFetch } from '../../services/api';
import { 
  VolumeBackupPlan, 
  SelectableNamedVolume, 
  VolumeBackupResourceType 
} from './volumeBackup.types';
import { 
  parseVolumeBackupPlanList, 
  parseVolumeBackupPlan,
  parseApplicationMounts,
  parseComposeServices,
  parseComposeMounts
} from './volumeBackup.parser';

function logDiagnostics(method: string, endpoint: string, response: any, body?: any) {
  if (__DEV__) {
    console.log(`[VOLUME BACKUP DIAGNOSTICS]`, {
      method,
      endpoint,
      responseKeys: response && typeof response === 'object' ? Object.keys(response) : [],
      hasBody: !!body,
    });
  }
}

export const volumeBackupApi = {
  async listVolumeBackups(resourceId: string, resourceType: VolumeBackupResourceType): Promise<VolumeBackupPlan[]> {
    const endpoint = `/volumeBackups.list?id=${encodeURIComponent(resourceId)}&volumeBackupType=${encodeURIComponent(resourceType)}`;
    const response = await dokployFetch(endpoint);
    logDiagnostics('GET', endpoint, response);
    return parseVolumeBackupPlanList(response, resourceType, resourceId);
  },

  async getVolumeBackup(volumeBackupId: string): Promise<VolumeBackupPlan> {
    const endpoint = `/volumeBackups.one?volumeBackupId=${encodeURIComponent(volumeBackupId)}`;
    const response = await dokployFetch(endpoint);
    logDiagnostics('GET', endpoint, response);
    return parseVolumeBackupPlan(response);
  },

  async createVolumeBackup(payload: any): Promise<boolean> {
    const endpoint = '/volumeBackups.create';
    const response = await dokployFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    logDiagnostics('POST', endpoint, response, payload);
    return true;
  },

  async updateVolumeBackup(payload: any): Promise<boolean> {
    const endpoint = '/volumeBackups.update';
    const response = await dokployFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    logDiagnostics('POST', endpoint, response, payload);
    return true;
  },

  async deleteVolumeBackup(volumeBackupId: string): Promise<boolean> {
    const endpoint = '/volumeBackups.delete';
    const payload = { volumeBackupId };
    const response = await dokployFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    logDiagnostics('POST', endpoint, response, payload);
    return true;
  },

  async runVolumeBackupManually(volumeBackupId: string): Promise<boolean> {
    const endpoint = '/volumeBackups.runManually';
    const payload = { volumeBackupId };
    const response = await dokployFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    logDiagnostics('POST', endpoint, response, payload);
    return true;
  },

  async getApplicationNamedMounts(applicationId: string): Promise<SelectableNamedVolume[]> {
    const endpoint = `/mounts.allNamedByApplicationId?applicationId=${encodeURIComponent(applicationId)}`;
    const response = await dokployFetch(endpoint);
    logDiagnostics('GET', endpoint, response);
    return parseApplicationMounts(response);
  },

  async getComposeServices(composeId: string): Promise<string[]> {
    const endpoint = `/compose.loadServices?composeId=${encodeURIComponent(composeId)}`;
    const response = await dokployFetch(endpoint);
    logDiagnostics('GET', endpoint, response);
    return parseComposeServices(response);
  },

  async getComposeMountsByService(composeId: string, serviceName: string): Promise<SelectableNamedVolume[]> {
    const endpoint = `/compose.loadMountsByService?composeId=${encodeURIComponent(composeId)}&serviceName=${encodeURIComponent(serviceName)}`;
    const response = await dokployFetch(endpoint);
    logDiagnostics('GET', endpoint, response);
    return parseComposeMounts(response, serviceName);
  }
};
