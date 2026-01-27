/**
 * API Configuration Service
 * Provides environment-specific API endpoints based on build mode
 */

import { configService } from './config';

// The environment is determined at build time by Vite
const ENV = import.meta.env.VITE_APP_ENV || 'development';

// Configuration for different environments
const CONFIG = {
  development: {
    baseUrl: 'http://localhost:3000',
    apiPrefix: '/api/notion'
  },
  production: {
    baseUrl: '', // Will be set dynamically
    apiPrefix: '/notion'
  }
};

// Get the current environment configuration
const currentConfig = CONFIG[ENV as keyof typeof CONFIG] || CONFIG.development;

// Environment detection helpers
export const isDevelopment = ENV === 'development';
export const isProduction = ENV === 'production';

// Base URL for API calls - now dynamic
export const getApiBaseUrl = async (): Promise<string> => {
  return await configService.getApiBaseUrl();
};

// API prefix for endpoints
export const API_PREFIX = currentConfig.apiPrefix;

// Helper to construct full API endpoints
export const getApiEndpoint = async (endpoint: string): Promise<string> => {
  return await configService.getApiEndpoint(endpoint);
};

// Common endpoints - now async functions
export const ENDPOINTS = {
  SYNC: async () => await getApiEndpoint('/sync'),
  SYNC_V2: async () => await getApiEndpoint('/sync-v2'),
  COMPARE: async () => await getApiEndpoint('/compare'),
  CONNECTED: async () => await getApiEndpoint('/connected'),
  PAGES: async () => await getApiEndpoint('/pages')
};

// Legacy sync export for backwards compatibility
export const API_BASE_URL = ''; // Deprecated - use getApiBaseUrl() instead

// Log configuration in development
if (isDevelopment) {
  configService.getApiBaseUrl().then(baseUrl => {
    console.log('API Configuration:', {
      environment: ENV,
      baseUrl: baseUrl,
      apiPrefix: API_PREFIX
    });
  }).catch(console.error);
} 