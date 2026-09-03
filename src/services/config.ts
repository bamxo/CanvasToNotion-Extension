/**
 * Configuration Service
 * Manages URLs and configuration dynamically without hardcoding external URLs
 */

interface ConfigData {
  apiBaseUrl?: string;
  webAppBaseUrl?: string;
  environment?: 'development' | 'production';
}

/**
 * Build-time API base override. Set VITE_API_BASE at build time (see the
 * `build:vercel` script) to point every API call at a specific backend
 * (e.g. the Vercel deployment) regardless of mode or stored config.
 * Trailing slashes are trimmed. Takes precedence over chrome.storage config.
 */
const BUILD_API_BASE = (import.meta.env.VITE_API_BASE as string | undefined)
  ?.trim()
  .replace(/\/+$/, '');

/**
 * Build-time web-app base override. Set VITE_WEB_BASE at build time to point
 * every web-app redirect (login `/lookup`, `/settings`, cookie lookups) at a
 * specific frontend (e.g. a locally running dev server). Trailing slashes are
 * trimmed. Takes precedence over chrome.storage config and mode.
 */
const BUILD_WEB_BASE = (import.meta.env.VITE_WEB_BASE as string | undefined)
  ?.trim()
  .replace(/\/+$/, '');

/**
 * True when the build targets an overridden backend (`build:vercel`), i.e. a
 * local cross-origin test. In that mode there is no valid same-site auth
 * cookie, so the cookie-based auth path (checkAuthCookie) must be disabled —
 * otherwise it re-authenticates the user right after logout. Auth then runs
 * purely off the stored bearer token.
 */
export const IS_BUILD_BACKEND_OVERRIDE = !!BUILD_API_BASE;

class ConfigService {
  private static instance: ConfigService;
  private config: ConfigData = {};
  private initialized = false;

  private constructor() {}

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Get stored configuration
      const stored = await chrome.storage.local.get(['configData']);
      
      if (stored.configData) {
        this.config = stored.configData;
      } else {
        // Set default configuration based on environment
        const isDev = import.meta.env.MODE === 'development';
        this.config = {
          environment: isDev ? 'development' : 'production',
          apiBaseUrl: isDev ? 'http://localhost:3000' : '',
          webAppBaseUrl: isDev ? 'http://localhost:5173' : ''
        };
        
        // Store the configuration
        await chrome.storage.local.set({ configData: this.config });
      }
      
      this.initialized = true;
    } catch (error) {
      console.error('Error initializing config:', error);
      // Fallback configuration
      this.config = {
        environment: 'production',
        apiBaseUrl: '',
        webAppBaseUrl: ''
      };
      this.initialized = true;
    }
  }

  async getApiBaseUrl(): Promise<string> {
    // Build-time override wins over mode and any stored config.
    if (BUILD_API_BASE) return BUILD_API_BASE;
    await this.initialize();
    if (this.config.environment === 'development') {
      return this.config.apiBaseUrl || 'http://localhost:3000';
    }
    // For production, construct URL dynamically or use stored value
    return this.config.apiBaseUrl || this.getProductionApiUrl();
  }

  async getWebAppBaseUrl(): Promise<string> {
    // Build-time override wins over mode and any stored config.
    if (BUILD_WEB_BASE) return BUILD_WEB_BASE;
    await this.initialize();
    if (this.config.environment === 'development') {
      return this.config.webAppBaseUrl || 'http://localhost:5173';
    }
    // For production, construct URL dynamically or use stored value
    return this.config.webAppBaseUrl || this.getProductionWebUrl();
  }

  private getProductionApiUrl(): string {
    // Production backend (Vercel). Routers are mounted at bare paths; the
    // `/notion` prefix is added by getApiEndpoint().
    return 'https://api2.canvastonotion.io';
  }

  private getProductionWebUrl(): string {
    // Construct production web URL dynamically
    const domain = 'canvastonotion.io';
    return `https://${domain}`;
  }

  async getApiEndpoint(endpoint: string): Promise<string> {
    const baseUrl = await this.getApiBaseUrl();
    // The Vercel backend mounts routers at bare paths (`/notion/*`); only the
    // legacy local dev server uses the `/api` prefix.
    const prefix = !BUILD_API_BASE && this.config.environment === 'development'
      ? '/api/notion'
      : '/notion';
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${baseUrl}${prefix}${normalizedEndpoint}`;
  }

  async getCookieUrl(): Promise<string> {
    return await this.getWebAppBaseUrl();
  }

  async getLogoutApiUrl(): Promise<string> {
    if (BUILD_API_BASE) return `${BUILD_API_BASE}/auth/logout`;
    if (this.config.environment === 'development') {
      return 'http://localhost:3000/api/auth/logout';
    }
    // Production backend (Vercel)
    return 'https://api2.canvastonotion.io/auth/logout';
  }

  async getClearAuthUrl(): Promise<string> {
    if (BUILD_API_BASE) return `${BUILD_API_BASE}/cookie-state/clear-authenticated`;
    if (this.config.environment === 'development') {
      return 'http://localhost:3000/api/cookie-state/clear-authenticated';
    }
    // Production backend (Vercel)
    return 'https://api2.canvastonotion.io/cookie-state/clear-authenticated';
  }

  isDevelopment(): boolean {
    return this.config.environment === 'development' || import.meta.env.MODE === 'development';
  }

  getDefaultEmail(): string {
    return 'user@extension.local';
  }
}

export const configService = ConfigService.getInstance();
export { ConfigService }; 