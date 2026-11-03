import * as tl from 'azure-pipelines-task-lib/task';
import type { InputReader } from './config';

// SDK vault 只收非空輸入；空的 INPUT_* 留在 process.env，必須保留「明確清空」的語意。
/** 保留 Azure SDK 未收進 vault 的空輸入，區分使用者清空欄位與未提供值。 */
export const readAzureInput: InputReader = (name) => {
  const raw = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`];

  return raw === undefined ? tl.getInput(name) : raw;
};
