import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { SecureConnectionProfile } from './api.types';
import { saveProfile } from './profileStore';

export async function migrateLegacyCredentials(): Promise<boolean> {
  try {
    const profileStr = await SecureStore.getItemAsync('dokploy_profile');
    
    // 1. Preserve an existing valid profile
    if (profileStr) {
      try {
        const parsed = JSON.parse(profileStr) as SecureConnectionProfile;
        if (parsed && parsed.profileId && parsed.serverUrl && parsed.apiKey) {
          return false;
        }
      } catch {}
    }

    // 2. Read legacy URL and API key only when no new profile exists
    const legacyUrl = await SecureStore.getItemAsync('dokploy_vps_url');
    const legacyApiKey = await SecureStore.getItemAsync('dokploy_api_key');

    if (legacyUrl && legacyApiKey) {
      // 3. Generate one secure UUID
      const profileId = Crypto.randomUUID();
      const newProfile: SecureConnectionProfile = {
        profileId,
        serverUrl: legacyUrl,
        apiKey: legacyApiKey,
        createdAt: new Date().toISOString(),
      };

      // 4. Save the new profile
      await saveProfile(newProfile);

      // 5. Read it back and validate required fields
      const readBackStr = await SecureStore.getItemAsync('dokploy_profile');
      if (readBackStr) {
        const readBack = JSON.parse(readBackStr) as SecureConnectionProfile;
        if (
          readBack &&
          readBack.profileId === profileId &&
          readBack.serverUrl === legacyUrl &&
          readBack.apiKey === legacyApiKey
        ) {
          // 6. Delete legacy credentials only after successful validation
          await SecureStore.deleteItemAsync('dokploy_vps_url');
          await SecureStore.deleteItemAsync('dokploy_api_key');
          return true;
        }
      }
      
      // 7. If saving or validation fails, throw to keep legacy credentials in catch block
      throw new Error('Post-save verification failed');
    }
  } catch (error) {
    // Preserve legacy credentials (do not clear them)
  }
  return false;
}
