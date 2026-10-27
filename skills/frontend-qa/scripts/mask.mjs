// Loads scripts/mask.js in a sandbox so Node can call the same functions the page installs.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const sourcePath = join(dirname(fileURLToPath(import.meta.url)), 'mask.js');
export const MASK_SOURCE = readFileSync(sourcePath, 'utf8');

const context = {
  // Result objects must be this realm's objects so Node deepEqual matches the page.
  Object,
  Array,
};
context.globalThis = context;
// The page provides URL. The Node sandbox does not.
context.URL = URL;
vm.createContext(context);
vm.runInContext(MASK_SOURCE, context);

export const mask = context.__frontendQaMask;
export const maskResult = context.__frontendQaMaskResult;
export const maskControl = context.__frontendQaMaskControl;
export const maskElement = context.__frontendQaMaskElement;
export const maskConsole = context.__frontendQaMaskConsole;
export const maskConsoleArg = context.__frontendQaMaskConsoleArg;
export const maskEvaluateResult = context.__frontendQaMaskEvaluateResult;
export const maskText = context.__frontendQaMaskText;
export const maskBody = context.__frontendQaMaskBody;
export const isSensitiveKey = context.__frontendQaIsSensitiveKey;
export const READABLE_HEADERS = context.__frontendQaReadableHeaders;
