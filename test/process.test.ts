import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runProcess } from '../src/process';

test('child stdout and stderr preserve UTF-8 characters split across pipe writes', async () => {
  const script = `
    const output=Buffer.from(JSON.stringify({path:'交付產品/中文路徑'}));
    const offset=output.indexOf(Buffer.from('交'))+1;
    process.stdout.write(output.subarray(0,offset));
    const error=Buffer.from('錯誤路徑');
    process.stderr.write(error.subarray(0,2));
    setTimeout(()=>{process.stdout.write(output.subarray(offset));process.stderr.write(error.subarray(2));},40);
  `;
  const result = await runProcess({ executable: process.execPath, args: ['-e', script], cwd: process.cwd() });
  assert.deepEqual(JSON.parse(result.stdout), { path: '交付產品/中文路徑' });
  assert.equal(result.stderr, '錯誤路徑');
});
