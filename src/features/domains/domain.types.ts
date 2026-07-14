// Domain & Certificate types for Dokploy API
// IMPORTANT: Never add privateKey or certificateData fields here —
// those fields must never be cached or logged.

export type CertificateType = 'letsencrypt' | 'none' | 'custom';
export type DomainType = 'application' | 'compose' | 'preview';

export interface Domain {
  domainId: string;
  host: string;
  path: string;
  port: number;
  https: boolean;
  certificateType: CertificateType;
  domainType: DomainType;
  serviceName: string | null;
  customEntrypoint: string | null;
  createdAt: string;
}

export interface CreateDomainInput {
  host: string;
  domainType: DomainType;
  applicationId?: string;
  composeId?: string;
  serviceName?: string;
  path?: string;
  port?: number;
  https?: boolean;
  certificateType?: CertificateType;
}

export interface UpdateDomainInput {
  domainId: string;
  host?: string;
  path?: string;
  port?: number;
  https?: boolean;
  certificateType?: CertificateType;
  serviceName?: string;
}

/**
 * Lightweight certificate listing object.
 * privateKey and certificateData are intentionally omitted
 * to prevent secret material from being held in memory or cache.
 */
export interface Certificate {
  certificateId: string;
  name: string;
  autoRenew: boolean | null;
  createdAt: string;
}

export type DomainMutationResult = {
  resourceType: 'application' | 'compose';
  resourceId: string;
  operation: 'create' | 'update' | 'delete';
  requiresRedeploy: boolean;
};
