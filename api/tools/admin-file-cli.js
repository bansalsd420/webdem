#!/usr/bin/env node
// Simple helper to atomically write admin cache commands to file
// Usage:
//  node tools/admin-file-cli.js --file ./admin_cache_commands.json --flush "products:v1:*,home:v1" --stats
// Or pipe JSON: cat payload.json | node tools/admin-file-cli.js --file ./admin_cache_commands.json

import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
function getArg(name) {
  const i = argv.indexOf(name);
  if (i === -1) return null;
  return argv[i+1] || null;
}

const outFile = getArg('--file') || process.env.ADMIN_COMMANDS_FILE || path.join(process.cwd(), 'admin_cache_commands.json');
const flushArg = getArg('--flush');
const statsArg = argv.includes('--stats');

async function readStdin() {
  const stdin = process.stdin;
  if (stdin.isTTY) return null;
  const chunks = [];
  for await (const chunk of stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

(async () => {
  try {
    const piped = await readStdin();
    let payload = {};
    if (piped) {
      payload = JSON.parse(piped);
    } else {
      if (flushArg) payload.flush = String(flushArg).split(',').map(s => s.trim()).filter(Boolean);
      if (statsArg) payload.stats = true;
    }

    // Read existing to preserve stats flag if present
    let existing = {};
    try { existing = JSON.parse(fs.readFileSync(outFile, 'utf8') || '{}'); } catch (e) { existing = {}; }

    const next = { ...existing, ...payload };

    // Atomic write
    const tmp = outFile + '.' + Date.now() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
    fs.renameSync(tmp, outFile);
    console.log('WROTE', outFile);
  } catch (e) {
    console.error('ERROR', e && e.message ? e.message : e);
    process.exit(1);
  }
})();
