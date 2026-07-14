import * as SecureStore from 'expo-secure-store';
import { SecureConnectionProfile } from './api.types';

let cachedProfile: SecureConnectionProfile | null = null;
let loadPromise: Promise<SecureConnectionProfile | null> | null = null;

export async function getProfile(): Promise<SecureConnectionProfile | null> {
  if (cachedProfile) {
    return cachedProfile;
  }
  if (loadPromise) {
    return loadPromise;
  }
  loadPromise = (async () => {
    try {
      const profileStr = await SecureStore.getItemAsync('dokploy_profile');
      if (!profileStr) return null;
      const parsed = JSON.parse(profileStr) as SecureConnectionProfile;
      if (parsed && parsed.profileId && parsed.serverUrl && parsed.apiKey) {
        cachedProfile = parsed;
        return parsed;
      }
      return null;
    } catch {
      return null;
    } finally {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

export async function saveProfile(profile: SecureConnectionProfile): Promise<void> {
  await SecureStore.setItemAsync('dokploy_profile', JSON.stringify(profile));
  cachedProfile = profile;
}

export async function clearProfileMemoryAndStorage(): Promise<void> {
  cachedProfile = null;
  await SecureStore.deleteItemAsync('dokploy_profile');
  await SecureStore.deleteItemAsync('dokploy_vps_url');
  await SecureStore.deleteItemAsync('dokploy_api_key');
}
