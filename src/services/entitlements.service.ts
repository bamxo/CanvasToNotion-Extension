/**
 * Entitlements Service
 * Reads the signed-in user's plan + class-sync usage from the web-app backend.
 * The extension only needs this for the free-tier class cap in the picker.
 */
import axios from 'axios';
import { configService } from './config';

export interface ExtensionEntitlements {
  tier: 'free' | 'pro' | 'lifetime' | 'legacy';
  classSyncLimit: number | null;
  classSyncUsed: number;
  syncedCourseIds: string[];
}

export async function fetchEntitlements(token: string): Promise<ExtensionEntitlements> {
  const url = await configService.getUsersApiEndpoint('/entitlements');
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 5000,
  });
  const d = res.data ?? {};
  return {
    tier: d.tier ?? 'free',
    classSyncLimit: d.classSyncLimit ?? null,
    classSyncUsed: d.classSyncUsed ?? 0,
    syncedCourseIds: Array.isArray(d.syncedCourseIds) ? d.syncedCourseIds.map(String) : [],
  };
}
