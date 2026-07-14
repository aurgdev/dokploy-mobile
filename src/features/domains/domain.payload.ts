import { CreateDomainInput, UpdateDomainInput, DomainType, CertificateType } from './domain.types';
import { DomainFormValues } from './domain.validation';

export interface DomainPayloadInput {
  host: string;
  port: number;
  path: string;
  https: boolean;
  certificateType: CertificateType;
  domainType: DomainType;
  applicationId?: string;
  composeId?: string;
  serviceName?: string | null;
}

export function buildCreatePayload(
  values: DomainFormValues,
  isCompose: boolean,
  resourceId: string
): CreateDomainInput {
  // Normalize host name to lowercase
  const host = values.host.trim().toLowerCase();
  const port = parseInt(values.port, 10);
  
  // Normalize path
  let path = values.path.trim();
  if (!path) {
    path = '/';
  } else {
    // Normalize duplicate leading slashes safely
    path = '/' + path.replace(/^\/+/, '');
  }

  const basePayload: CreateDomainInput = {
    host,
    port,
    path,
    https: values.https,
    certificateType: (values.https ? values.certificateType : 'none') as CertificateType,
    domainType: isCompose ? 'compose' : 'application',
  };

  if (isCompose) {
    basePayload.composeId = resourceId;
    if (values.serviceName) {
      basePayload.serviceName = values.serviceName;
    }
  } else {
    basePayload.applicationId = resourceId;
  }

  return basePayload;
}

export function buildUpdatePayload(
  domainId: string,
  values: DomainFormValues,
  isCompose: boolean
): UpdateDomainInput {
  const host = values.host.trim().toLowerCase();
  const port = parseInt(values.port, 10);
  
  let path = values.path.trim();
  if (!path) {
    path = '/';
  } else {
    path = '/' + path.replace(/^\/+/, '');
  }

  const basePayload: UpdateDomainInput = {
    domainId,
    host,
    port,
    path,
    https: values.https,
    certificateType: (values.https ? values.certificateType : 'none') as CertificateType,
  };

  if (isCompose && values.serviceName) {
    basePayload.serviceName = values.serviceName;
  }

  return basePayload;
}
