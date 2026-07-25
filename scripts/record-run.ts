import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { recordRun } from './evidence.js';

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`missing required option ${name}`);
  return value;
}

try {
  const metadataPath = resolve(option('--metadata'));
  const output = recordRun({
    metadata: JSON.parse(readFileSync(metadataPath, 'utf8')),
    runDirectory: resolve(option('--run-dir')),
    schedulerLog: resolve(option('--scheduler-log')),
    outputRoot: resolve(option('--output-root')),
  });
  console.log(`Recorded immutable redacted evidence at ${output}`);
} catch (error) {
  console.error(`record-run: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
