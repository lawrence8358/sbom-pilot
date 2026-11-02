import type { ToolContext } from '../tools';
import type { ProcessRunner } from '../process';

export interface InstallOptions { tempDirectory?: string; log?: (message: string) => void }
export interface DependencyInstaller {
  install(root: string, tools: ToolContext, run: ProcessRunner, options?: InstallOptions): Promise<void>;
}
export type JavaScriptManager = 'npm' | 'pnpm' | 'yarn';
export interface JavaScriptProject {
  root: string;
  manager: JavaScriptManager;
  version: string;
  reason: 'declaration' | 'fallback' | 'project-binary';
  integrity?: string;
  lockPath: string;
  yarn?: { generation: 'classic' | 'modern'; path?: string };
}
export interface ManagerCommand { executable: string; args: string[]; env?: NodeJS.ProcessEnv; version?: string }
export interface JavaScriptAdapter {
  install(project: JavaScriptProject, command: ManagerCommand, tools: ToolContext, run: ProcessRunner): Promise<void>;
}
