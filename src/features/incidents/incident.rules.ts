import { CentralizedDeployment, QueueJob } from './incident.api';
import { Incident, IncidentSeverity, IncidentCategory, IncidentResourceType } from './incident.types';
import { sanitizeErrorMessage, generateIncidentId } from './incident.utils';

/**
 * Parses Centralized Deployments list into normalized Incidents.
 */
export function parseDeployments(
  deployments: CentralizedDeployment[],
  stuckThresholdMins: number = 30
): Incident[] {
  const incidents: Incident[] = [];
  const now = Date.now();

  for (const dep of deployments) {
    if (!dep.id) continue;

    // A. Error deployments
    if (dep.status === 'error') {
      const isVolumeBackup = 
        (dep as any).volumeBackupId || 
        dep.title?.toLowerCase().includes('volume-backup') || 
        (dep as any).type === 'volumeBackup';
        
      const isBackup = 
        !isVolumeBackup && 
        ((dep as any).backupId || 
         dep.title?.toLowerCase().includes('backup') || 
         (dep as any).type === 'backup');

      let category: IncidentCategory = 'deployment_failed';
      let resourceType: IncidentResourceType = 'application';
      
      if (isVolumeBackup) {
        category = 'volume_backup_failed';
        resourceType = 'volumeBackup';
      } else if (isBackup) {
        category = 'backup_failed';
        resourceType = 'backup';
      } else if (dep.title?.toLowerCase().includes('compose') || (dep as any).composeId) {
        resourceType = 'compose';
      } else if (dep.title?.toLowerCase().includes('database') || (dep as any).databaseId) {
        resourceType = 'database';
      }

      const rawMsg = dep.errorMessage || (dep as any).failedReason || 'Unknown deployment failure';
      const summary = sanitizeErrorMessage(rawMsg);

      const incidentId = generateIncidentId(
        category,
        resourceType,
        dep.applicationId || (dep as any).resourceId || null,
        dep.id,
        dep.createdAt
      );

      incidents.push({
        incidentId,
        category,
        severity: 'error',
        title: dep.title || `${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)} Deployment Failed`,
        summary,
        resourceType,
        resourceId: dep.applicationId || (dep as any).resourceId || null,
        resourceName: dep.applicationName || null,
        projectName: dep.projectName || null,
        deploymentId: dep.id,
        createdAt: dep.createdAt,
        detectedAt: new Date(now).toISOString(),
        sourceStatus: dep.status,
        canOpenResource: true,
        canViewLogs: true,
      });
    }

    // B. Running deployments (classifying stuck deployments)
    if (dep.status === 'running') {
      const startTimeStr = dep.startedAt || dep.createdAt;
      if (startTimeStr) {
        const startTime = new Date(startTimeStr).getTime();
        if (!isNaN(startTime)) {
          const elapsedMins = (now - startTime) / (60 * 1000);
          if (elapsedMins > stuckThresholdMins) {
            let resourceType: IncidentResourceType = 'application';
            if (dep.title?.toLowerCase().includes('compose') || (dep as any).composeId) {
              resourceType = 'compose';
            } else if (dep.title?.toLowerCase().includes('database') || (dep as any).databaseId) {
              resourceType = 'database';
            }

            const incidentId = generateIncidentId(
              'deployment_stuck',
              resourceType,
              dep.applicationId || (dep as any).resourceId || null,
              dep.id,
              'stuck'
            );

            incidents.push({
              incidentId,
              category: 'deployment_stuck',
              severity: 'warning',
              title: `Deployment Stuck: ${dep.applicationName || resourceType}`,
              summary: `Deployment has been running for over ${stuckThresholdMins} minutes (elapsed: ${Math.round(elapsedMins)} mins).`,
              resourceType,
              resourceId: dep.applicationId || (dep as any).resourceId || null,
              resourceName: dep.applicationName || null,
              projectName: dep.projectName || null,
              deploymentId: dep.id,
              createdAt: startTimeStr,
              detectedAt: new Date(now).toISOString(),
              sourceStatus: dep.status,
              canOpenResource: true,
              canViewLogs: true,
            });
          }
        }
      }
    }
  }

  return incidents;
}

/**
 * Parses Queue Jobs list into normalized Incidents.
 */
export function parseQueueJobs(
  queueJobs: QueueJob[],
  stuckThresholdMins: number = 30,
  waitingThresholdMins: number = 15
): Incident[] {
  const incidents: Incident[] = [];
  const now = Date.now();

  for (const job of queueJobs) {
    if (!job.id) continue;

    // A. Failed queue job
    const isFailedState = job.state === 'failed';
    const hasFailedReason = job.failedReason && job.failedReason.trim() !== '';

    if (isFailedState || hasFailedReason) {
      const summary = sanitizeErrorMessage(job.failedReason || 'Queue job failed execution');
      let resourceType: IncidentResourceType = 'application';
      if (job.name?.toLowerCase().includes('database') || job.servicePath?.toLowerCase().includes('database')) {
        resourceType = 'database';
      } else if (job.name?.toLowerCase().includes('compose') || job.servicePath?.toLowerCase().includes('compose')) {
        resourceType = 'compose';
      }

      const incidentId = generateIncidentId(
        'deployment_failed',
        resourceType,
        job.id,
        job.id,
        'queue-failed'
      );

      incidents.push({
        incidentId,
        category: 'deployment_failed',
        severity: 'error',
        title: `Queue Job Failed: ${job.name || 'Unknown Job'}`,
        summary,
        resourceType,
        resourceId: job.id,
        resourceName: job.name || null,
        projectName: null,
        deploymentId: job.id,
        createdAt: new Date(job.timestamp).toISOString(),
        detectedAt: new Date(now).toISOString(),
        sourceStatus: job.state || 'failed',
        canOpenResource: false,
        canViewLogs: false,
      });
      continue; // Skip further checks if failed
    }

    // B. Active queue job running too long
    if (job.state === 'active' && job.processedOn) {
      const elapsedMins = (now - job.processedOn) / (60 * 1000);
      if (elapsedMins > stuckThresholdMins) {
        const incidentId = generateIncidentId(
          'queue_stuck',
          'server',
          job.id,
          job.id,
          'queue-stuck-active'
        );

        incidents.push({
          incidentId,
          category: 'queue_stuck',
          severity: 'warning',
          title: `Queue Job Stuck: ${job.name || 'Active Job'}`,
          summary: `Queue job has been active for over ${stuckThresholdMins} minutes.`,
          resourceType: 'server',
          resourceId: job.id,
          resourceName: job.name || null,
          projectName: null,
          deploymentId: job.id,
          createdAt: new Date(job.processedOn).toISOString(),
          detectedAt: new Date(now).toISOString(),
          sourceStatus: job.state,
          canOpenResource: false,
          canViewLogs: false,
        });
      }
    }

    // C. Waiting or delayed job unusually long
    if ((job.state === 'waiting' || job.state === 'delayed') && job.timestamp) {
      const elapsedMins = (now - job.timestamp) / (60 * 1000);
      if (elapsedMins > waitingThresholdMins) {
        const incidentId = generateIncidentId(
          'queue_stuck',
          'server',
          job.id,
          job.id,
          `queue-stuck-${job.state}`
        );

        incidents.push({
          incidentId,
          category: 'queue_stuck',
          severity: 'warning',
          title: `Queue Job Delayed: ${job.name || 'Pending Job'}`,
          summary: `Queue job has been in ${job.state} state for over ${waitingThresholdMins} minutes.`,
          resourceType: 'server',
          resourceId: job.id,
          resourceName: job.name || null,
          projectName: null,
          deploymentId: job.id,
          createdAt: new Date(job.timestamp).toISOString(),
          detectedAt: new Date(now).toISOString(),
          sourceStatus: job.state,
          canOpenResource: false,
          canViewLogs: false,
        });
      }
    }
  }

  return incidents;
}

/**
 * Parses Service/Container status into normalized Incidents.
 */
export function parseServiceHealth(containers: any[]): Incident[] {
  const incidents: Incident[] = [];
  const now = Date.now();

  for (const container of containers) {
    if (!container || !container.name) continue;

    // Only generate incident for confirmed unhealthy condition:
    // 1. Docker health status is explicitly unhealthy
    // 2. A service expected to be running is explicitly in a confirmed failed/error state
    const healthStatus = container.health?.toLowerCase() || '';
    const state = container.state?.toLowerCase() || '';
    const status = container.status?.toLowerCase() || '';

    const isUnhealthy = healthStatus === 'unhealthy' || status.includes('(unhealthy)');
    const isDeadState = state === 'dead';

    if (isUnhealthy || isDeadState) {
      let category: IncidentCategory = 'service_unhealthy';
      // Default severity to 'error'. Production services or explicit health alerts can elevate to 'critical'
      const isProduction = container.isProduction === true || container.name?.toLowerCase().includes('prod');
      const severity: IncidentSeverity = (isUnhealthy && isProduction) ? 'critical' : 'error';

      const resourceType: IncidentResourceType = 
        container.name?.includes('db') ? 'database' : 
        container.name?.includes('compose') ? 'compose' : 'application';

      const incidentId = generateIncidentId(
        category,
        resourceType,
        container.id || container.name,
        null,
        'unhealthy'
      );

      incidents.push({
        incidentId,
        category,
        severity,
        title: `Service Unhealthy: ${container.name}`,
        summary: isDeadState ? 'Service is in DEAD state.' : `Service health check returned '${container.health || 'unhealthy'}'.`,
        resourceType,
        resourceId: container.id || null,
        resourceName: container.name,
        projectName: container.projectName || null,
        deploymentId: null,
        createdAt: new Date(now).toISOString(),
        detectedAt: new Date(now).toISOString(),
        sourceStatus: state || 'unhealthy',
        canOpenResource: true,
        canViewLogs: true,
      });
    }
  }

  return incidents;
}

/**
 * Parses Backup health details into normalized Incidents.
 */
export function parseBackupsHealth(
  backups: any[],
  volumeBackups: any[]
): Incident[] {
  const incidents: Incident[] = [];
  const now = Date.now();

  // A. Database backups confirmed failure
  for (const backup of backups) {
    if (!backup) continue;
    // Generate incident only when there is a confirmed failure
    if (backup.lastStatus === 'error' || backup.lastStatus === 'failed') {
      const incidentId = generateIncidentId(
        'backup_failed',
        'backup',
        backup.id,
        null,
        backup.lastBackupTime || 'failed'
      );

      incidents.push({
        incidentId,
        category: 'backup_failed',
        severity: 'error',
        title: `Backup Failed: ${backup.name || 'Database Backup'}`,
        summary: backup.errorMessage || 'Database backup job failed server-side execution.',
        resourceType: 'backup',
        resourceId: backup.id,
        resourceName: backup.name || null,
        projectName: backup.projectName || null,
        deploymentId: null,
        createdAt: backup.lastBackupTime || new Date(now).toISOString(),
        detectedAt: new Date(now).toISOString(),
        sourceStatus: backup.lastStatus,
        canOpenResource: true,
        canViewLogs: false,
      });
    }
  }

  // B. Volume backups confirmed failure
  for (const vol of volumeBackups) {
    if (!vol) continue;
    if (vol.lastStatus === 'error' || vol.lastStatus === 'failed') {
      const incidentId = generateIncidentId(
        'volume_backup_failed',
        'volumeBackup',
        vol.id,
        null,
        vol.lastBackupTime || 'failed'
      );

      incidents.push({
        incidentId,
        category: 'volume_backup_failed',
        severity: 'error',
        title: `Volume Backup Failed: ${vol.name || 'Volume Backup'}`,
        summary: vol.errorMessage || 'Volume backup job failed server-side execution.',
        resourceType: 'volumeBackup',
        resourceId: vol.id,
        resourceName: vol.name || null,
        projectName: vol.projectName || null,
        deploymentId: null,
        createdAt: vol.lastBackupTime || new Date(now).toISOString(),
        detectedAt: new Date(now).toISOString(),
        sourceStatus: vol.lastStatus,
        canOpenResource: true,
        canViewLogs: false,
      });
    }
  }

  return incidents;
}

/**
 * Deduplicates and sorts incidents.
 * Deduplication rules:
 * - Queue job and deployment record representing the same failure (matched by deploymentId/queueJob id or resource).
 * - Duplicate resources returned through multiple queries.
 * - Repeated identical backup failures.
 *
 * Preference order for duplicate matching:
 * 1. Deployment ID
 * 2. Better resource context
 * 3. Better timestamp
 * 4. Safe error summary
 * 5. Logs availability
 */
export function deduplicateIncidents(incidents: Incident[]): Incident[] {
  const deduped: Record<string, Incident> = {};

  for (const inc of incidents) {
    // Determine a deduplication key based on resource and problem type
    // If we have a deploymentId, we can group by it. Otherwise group by resourceId + category
    const key = inc.deploymentId 
      ? `dep:${inc.deploymentId}` 
      : `res:${inc.resourceId || 'none'}:${inc.category}`;

    const existing = deduped[key];
    if (!existing) {
      deduped[key] = inc;
      continue;
    }

    // Compare and keep the better record:
    let keepNew = false;
    
    // Preference 1: Deployment ID presence
    if (inc.deploymentId && !existing.deploymentId) {
      keepNew = true;
    } else if (!inc.deploymentId && existing.deploymentId) {
      keepNew = false;
    } else {
      // Preference 2: Better resource context (has resourceName vs not)
      const newHasName = !!inc.resourceName;
      const oldHasName = !!existing.resourceName;
      if (newHasName && !oldHasName) {
        keepNew = true;
      } else if (!newHasName && oldHasName) {
        keepNew = false;
      } else {
        // Preference 3: Better/newer timestamp
        const newTime = new Date(inc.createdAt).getTime();
        const oldTime = new Date(existing.createdAt).getTime();
        if (!isNaN(newTime) && !isNaN(oldTime) && newTime > oldTime) {
          keepNew = true;
        } else {
          // Preference 4: Logs availability
          if (inc.canViewLogs && !existing.canViewLogs) {
            keepNew = true;
          }
        }
      }
    }

    if (keepNew) {
      deduped[key] = inc;
    }
  }

  return Object.values(deduped);
}

/**
 * Sorts incidents by severity: Critical -> Error -> Warning -> Info, and newest first within severity.
 */
export function sortIncidents(incidents: Incident[]): Incident[] {
  const severityWeight: Record<IncidentSeverity, number> = {
    critical: 4,
    error: 3,
    warning: 2,
    info: 1
  };

  return [...incidents].sort((a, b) => {
    const weightA = severityWeight[a.severity] || 0;
    const weightB = severityWeight[b.severity] || 0;

    if (weightA !== weightB) {
      return weightB - weightA; // Higher weight first (Critical before Error)
    }

    // Newest first
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    if (!isNaN(timeA) && !isNaN(timeB)) {
      return timeB - timeA;
    }

    return 0;
  });
}
