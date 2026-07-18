import { apiCall } from './api.js';
import { loadConfig } from './config.js';
import { CliError } from './errors.js';

export interface CliProject {
  id: string;
  name: string;
  cwdAlias: string;
}

export async function resolveProject(aliasOrId?: string): Promise<CliProject> {
  const config = loadConfig();
  if (!config.apiKey) throw new CliError('CLI not configured. Run `bm init` first.');

  const selector = aliasOrId ?? config.defaultProject;
  if (!selector) {
    throw new CliError('No project specified. Use --project or set defaultProject in config.');
  }

  const response = await apiCall<unknown>('/v1/projects');
  const projects = Array.isArray(response)
    ? (response as CliProject[])
    : ((response as { data?: CliProject[] }).data ?? []);
  const project = projects.find(
    (candidate) => candidate.id === selector || candidate.cwdAlias === selector,
  );
  if (!project) throw new CliError(`Project "${selector}" not found.`);
  return project;
}
