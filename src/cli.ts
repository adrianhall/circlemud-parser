#!/usr/bin/env node
import { Command } from 'commander';

import { VERSION } from './index.js';

const program = new Command();

program
  .name('circlemud-parser')
  .description('Parse CircleMUD/TbaMUD world data files into JSON')
  .version(VERSION);

program.parse();
