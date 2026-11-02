import { spawn } from 'node:child_process';

export interface Command {
  executable: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}
export interface ProcessResult { stdout: string; stderr: string }
export type ProcessRunner = (command: Command) => Promise<ProcessResult>;

// Never print child output or arguments: npm can include registry credentials in errors.
// Child output is retained only in memory for version and metadata parsing.
export const runProcess: ProcessRunner = (command) => new Promise((resolve, reject) => {
  const child = spawn(command.executable, command.args, {
    cwd: command.cwd, env: command.env ?? process.env, shell: false,
    windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '';
  const limit = 4 * 1024 * 1024;
  const append = (current: string, chunk: Buffer) => (current + chunk.toString()).slice(-limit);
  child.stdout.on('data', (data: Buffer) => { stdout = append(stdout, data); });
  child.stderr.on('data', (data: Buffer) => { stderr = append(stderr, data); });
  const timeout = setTimeout(() => {
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else if (child.pid) {
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    }
    reject(new Error('子程序執行逾時。請檢查工具與來源連線。'));
  }, command.timeoutMs ?? 15 * 60_000);
  child.on('error', () => { clearTimeout(timeout); reject(new Error('無法啟動必要工具。請檢查執行權限與工具位置。')); });
  child.on('close', (code) => {
    clearTimeout(timeout);
    if (code === 0) resolve({ stdout, stderr });
    else reject(new Error(`子程序失敗 (exit ${code ?? 'signal'})；請檢查來源設定、lockfile 與安裝腳本。為避免來源認證外洩，不轉印子程序輸出。`));
  });
});
