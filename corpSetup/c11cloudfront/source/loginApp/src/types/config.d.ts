export {};

declare global {
  interface Window {
    __APP_CONFIG__?: {
      tenantId: string;
      clientId: string;
      redirectUri: string;
      domainName: string;
    };
  }
}
