import * as tl from 'azure-pipelines-task-lib/task';
import type { InputReader } from './config';

// The SDK vault only stores nonempty values. Empty INPUT_* variables remain in
// process.env; preserve them so explicit blank differs from an omitted input.
export const readAzureInput: InputReader = name => {
  const raw = process.env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`];
  return raw === undefined ? tl.getInput(name) : raw;
};
