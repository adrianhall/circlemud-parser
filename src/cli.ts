#!/usr/bin/env node
import { runCli } from './cli/run.js';

process.exit(runCli(process.argv.slice(2)));
