// This module MUST be imported before task-lib: the SDK moves nonempty INPUT_*
// values into its vault during module initialization. Capture only in memory;
// never call getInput for secrets, because that method logs their raw values.
export const dtApiKeyInput = process.env.INPUT_DTAPIKEY;
