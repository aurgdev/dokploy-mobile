import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useDokployCapabilities } from '../services/queries';
import { DokployCapabilityKey, DOKPLOY_CAPABILITY_KEYS, CapabilityStatus } from '../services/api.types';
import DisabledActionExplanation from './DisabledAction';

export function getGranularCapabilityKey(capability: string, access: 'read' | 'write'): DokployCapabilityKey {
  if (DOKPLOY_CAPABILITY_KEYS.includes(capability as any)) {
    return capability as DokployCapabilityKey;
  }
  switch (capability) {
    case 'projects':
      return access === 'read' ? 'readProjects' : 'createProjects';
    case 'applications':
      return access === 'read' ? 'readApplications' : 'manageApplicationLifecycle';
    case 'compose':
      return access === 'read' ? 'readCompose' : 'manageComposeLifecycle';
    case 'databases':
      return access === 'read' ? 'readDatabases' : 'manageDatabaseLifecycle';
    case 'containers':
      return access === 'read' ? 'readContainers' : 'manageDocker';
    case 'domains':
      return access === 'read' ? 'readDomains' : 'manageDomains';
    case 'backups':
      return access === 'read' ? 'readBackups' : 'manageBackups';
    case 'notifications':
      return access === 'read' ? 'readNotifications' : 'manageNotifications';
    case 'servers':
      return access === 'read' ? 'readServers' : 'manageServers';
    case 'traefik':
      return access === 'read' ? 'readProjects' : 'manageTraefik';
    default:
      return 'readProjects';
  }
}

export function getCapabilityStatus(capabilities: any, capability: string, access: 'read' | 'write'): CapabilityStatus {
  if (!capabilities) return 'unknown';
  const key = getGranularCapabilityKey(capability, access);
  return capabilities[key] || 'unknown';
}

export function hasCapability(capabilities: any, capability: string, access: 'read' | 'write'): boolean {
  const status = getCapabilityStatus(capabilities, capability, access);
  if (status === 'available') return true;
  if (access === 'read' && status === 'read_only') return true;
  if (access === 'write' && status === 'unknown') return true;
  return false;
}

interface CapabilityGateProps {
  capability: string;
  access: 'read' | 'write';
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const CapabilityGate: React.FC<CapabilityGateProps> = ({ 
  capability, 
  access,
  fallback, 
  children 
}) => {
  const { data: capabilities, isLoading } = useDokployCapabilities();

  if (isLoading) {
    return <ActivityIndicator size="small" style={{ margin: 12 }} />;
  }

  const status = getCapabilityStatus(capabilities, capability, access);

  if (status === 'available') {
    return <>{children}</>;
  }

  if (access === 'read' && status === 'read_only') {
    return <>{children}</>;
  }

  if (access === 'write' && status === 'unknown') {
    return <>{children}</>;
  }

  // Allow custom fallback overrides
  if (fallback !== undefined) {
    return <>{fallback}</>;
  }

  // Otherwise, render standard disabled messages
  if (status === 'read_only' && access === 'write') {
    return <DisabledActionExplanation message="This action is disabled: Read-Only access" />;
  }

  if (status === 'forbidden') {
    return <DisabledActionExplanation message="Access Denied: Insufficient permissions to perform this operation" />;
  }

  if (status === 'unsupported') {
    return <DisabledActionExplanation message="Unsupported: This feature is not supported by your Dokploy server version" />;
  }

  // Unknown state shows neutral disabled loading state
  return (
    <View style={{ padding: 12, alignItems: 'center', opacity: 0.5 }}>
      <ActivityIndicator size="small" />
    </View>
  );
};

export default CapabilityGate;
