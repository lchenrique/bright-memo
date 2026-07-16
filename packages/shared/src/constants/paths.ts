export const API_PATHS = {
  health: '/v1/health',
  authMe: '/v1/auth/me',
  authKeys: '/v1/auth/keys',
  authKey: '/v1/auth/keys/:keyId',
  projects: '/v1/projects',
  project: '/v1/projects/:projectId',
  projectContext: '/v1/projects/:projectId/context',
  memories: '/v1/memories',
  memory: '/v1/memories/:memoryId',
  memorySearch: '/v1/memories/search',
  memoryContext: '/v1/memories/context',
} as const;

export const API_ENDPOINTS = [
  { name: 'health', method: 'GET', path: API_PATHS.health },
  { name: 'authMe', method: 'GET', path: API_PATHS.authMe },
  { name: 'authKeys', method: 'POST', path: API_PATHS.authKeys },
  { name: 'authKey', method: 'DELETE', path: API_PATHS.authKey },
  { name: 'projects', method: 'GET', path: API_PATHS.projects },
  { name: 'project', method: 'GET', path: API_PATHS.project },
  { name: 'projectContext', method: 'GET', path: API_PATHS.projectContext },
  { name: 'memories', method: 'GET', path: API_PATHS.memories },
  { name: 'memory', method: 'GET', path: API_PATHS.memory },
  { name: 'memorySearch', method: 'GET', path: API_PATHS.memorySearch },
  { name: 'memoryContext', method: 'GET', path: API_PATHS.memoryContext },
] as const;

export type ApiPath = (typeof API_PATHS)[keyof typeof API_PATHS];
