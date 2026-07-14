import AsyncStorage from '@react-native-async-storage/async-storage';
import { IncidentAcknowledgement } from './incident.types';

const ACK_KEY_PREFIX = 'dokploy:';
const ACK_KEY_SUFFIX = ':incident-acknowledgements';

function getStorageKey(profileId: string): string {
  return `${ACK_KEY_PREFIX}${profileId}${ACK_KEY_SUFFIX}`;
}

/**
 * Loads all incident acknowledgements for a given connection profile.
 */
export async function getAcknowledgements(profileId: string): Promise<IncidentAcknowledgement[]> {
  try {
    const key = getStorageKey(profileId);
    const stored = await AsyncStorage.getItem(key);
    if (!stored) return [];
    
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    
    return parsed as IncidentAcknowledgement[];
  } catch (err) {
    console.error('[Incident Storage] Failed to load acknowledgements', err);
    return [];
  }
}

/**
 * Adds an acknowledgement for a specific incident.
 */
export async function saveAcknowledgement(profileId: string, incidentId: string): Promise<IncidentAcknowledgement[]> {
  try {
    const key = getStorageKey(profileId);
    const existing = await getAcknowledgements(profileId);
    
    // Check if already exists
    if (existing.some(ack => ack.incidentId === incidentId)) {
      return existing;
    }
    
    const newAck: IncidentAcknowledgement = {
      incidentId,
      acknowledgedAt: new Date().toISOString()
    };
    
    const updated = [...existing, newAck];
    await AsyncStorage.setItem(key, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('[Incident Storage] Failed to save acknowledgement', err);
    return [];
  }
}

/**
 * Removes an acknowledgement for a specific incident.
 */
export async function removeAcknowledgement(profileId: string, incidentId: string): Promise<IncidentAcknowledgement[]> {
  try {
    const key = getStorageKey(profileId);
    const existing = await getAcknowledgements(profileId);
    
    const updated = existing.filter(ack => ack.incidentId !== incidentId);
    await AsyncStorage.setItem(key, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.error('[Incident Storage] Failed to remove acknowledgement', err);
    return [];
  }
}

/**
 * Prunes acknowledgements older than 30 days or no longer corresponding to active incidents.
 * @param activeIncidentIds The list of currently active incident IDs to preserve (optional)
 */
export async function pruneAcknowledgements(profileId: string, activeIncidentIds?: string[]): Promise<void> {
  try {
    const key = getStorageKey(profileId);
    const existing = await getAcknowledgements(profileId);
    if (existing.length === 0) return;
    
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    
    const filtered = existing.filter(ack => {
      // 1. Prune if older than 30 days
      const ageMs = now - new Date(ack.acknowledgedAt).getTime();
      if (ageMs > thirtyDaysMs) return false;
      
      // 2. Optional: prune if not in currently active incident list (if active list is supplied)
      if (activeIncidentIds && !activeIncidentIds.includes(ack.incidentId)) {
        return false;
      }
      
      return true;
    });
    
    if (filtered.length !== existing.length) {
      await AsyncStorage.setItem(key, JSON.stringify(filtered));
    }
  } catch (err) {
    console.error('[Incident Storage] Failed to prune acknowledgements', err);
  }
}
