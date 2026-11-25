#!/usr/bin/env node

import path from 'path';
import { startMcpServer } from '../src/mcp/server.js';

const cliArgs = process.argv.slice(2);
const cwdIdx = cliArgs.indexOf('--cwd');
const explicitCwd = cwdIdx > -1 && cliArgs[cwdIdx + 1]
  ? path.resolve(cliArgs[cwdIdx + 1])
  : process.cwd();

startMcpServer({ cwd: explicitCwd });
