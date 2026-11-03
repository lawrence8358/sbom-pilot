import { spawn } from 'node:child_process';

export interface Command {
  executable: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}
export interface ProcessResult {
  stdout: string;
  stderr: string;
}
export type ProcessRunner = (command: Command) => Promise<ProcessResult>;

// npm 錯誤可能包含 registry 認證，因此不轉印子程序輸出或參數。
// 輸出只在記憶體中用於版本及中繼資料解析。
/** 不用 shell 執行子程序，保留 UTF-8 原始輸出於記憶體；逾時清理程序樹且不轉印秘密。 */
export const runProcess: ProcessRunner = (command) =>
  new Promise((resolve, reject) => {
    const child = spawn(command.executable, command.args, {
      cwd: command.cwd,
      env: command.env ?? process.env,
      shell: false,
      windowsHide: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    const limit = 4 * 1024 * 1024;
    // 串流解碼會保留跨 data 事件的未完整 UTF-8 位元組，避免中文字被截斷。
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    /** 限制記憶體保留的子程序輸出長度，避免大量日誌耗盡 Task 記憶體。 */
    const append = (current: string, chunk: string) => (current + chunk).slice(-limit);
    child.stdout.on('data', (data: string) => {
      stdout = append(stdout, data);
    });
    child.stderr.on('data', (data: string) => {
      stderr = append(stderr, data);
    });
    const timeout = setTimeout(
      () => {
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
          });
        } else if (child.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            child.kill('SIGKILL');
          }
        }
        reject(new Error('子程序執行逾時。請檢查工具與來源連線。'));
      },
      command.timeoutMs ?? 15 * 60_000,
    );
    child.on('error', () => {
      clearTimeout(timeout);
      reject(new Error('無法啟動必要工具。請檢查執行權限與工具位置。'));
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `子程序失敗 (exit ${code ?? 'signal'})；請檢查來源設定、lockfile 與安裝腳本。為避免來源認證外洩，不轉印子程序輸出。`,
          ),
        );
      }
    });
  });
