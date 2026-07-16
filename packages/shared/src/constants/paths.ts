export const API_PATHS = {
  health: '/health',
  authMe: '/v1/me',
  authKeys: '/v1/auth/keys',
} as const;

export const API_ENDPOINTS = [
  { name: 'health', method: 'GET', path: API_PATHS.health },
  { name: 'authMe', method: 'GET', path: API_PATHS.authMe },
  { name: 'authKeys', method: 'POST', path: API_PATHS.authKeys },
] as const;

export type ApiPath = (typeof API_PATHS)[keyof typeof API_PATHS];
