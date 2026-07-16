export const API_KEY_SCOPES = [
  'memories:read',
  'memories:write',
  'projects:read',
  'projects:write',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const SCOPES = API_KEY_SCOPES;
