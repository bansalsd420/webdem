import fs from 'fs';
import path from 'path';

// Simple file-based admin command runner for cache
// Usage: drop a JSON file with shape { "flush": ["products:v1:abc*"], "stats": true }
// The watcher will run commands on change and write a stats output file alongside.

function safeReadJson(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

function safeWriteJson(file, obj) {
  try {
    fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.error('[fileAdmin] failed to write', file, e && e.message ? e.message : e);
  }
}

export function startFileAdmin({ cache, commandsFile, statsFile, pollMs = 1500 } = {}) {
  if (!cache) throw new Error('cache required');
  commandsFile = commandsFile || process.env.ADMIN_COMMANDS_FILE || path.join(process.cwd(), 'admin_cache_commands.json');
  statsFile = statsFile || path.join(path.dirname(commandsFile), 'admin_cache_stats.json');

  // Ensure the commands file exists
  try { if (!fs.existsSync(commandsFile)) fs.writeFileSync(commandsFile, '{}', 'utf8'); } catch (e) {}

  let running = false;

  async function processOnce() {
    if (running) return;
    running = true;
    try {
      const cmds = safeReadJson(commandsFile);
      let changed = false;

      if (Array.isArray(cmds.flush) && cmds.flush.length) {
        for (const key of cmds.flush) {
          try {
            // support trailing '*' wildcard (cache.invalidateByKey understands that)
            await cache.invalidateByKey(key);
          } catch (e) {
            console.error('[fileAdmin] flush failed for', key, e && e.message ? e.message : e);
          }
        }
        // clear the flush list so the same commands aren't repeatedly executed
        cmds.flush = [];
        changed = true;
      }

      if (cmds.stats) {
        try {
          const s = cache.stats ? cache.stats() : { ok: false };
          safeWriteJson(statsFile, { ts: Date.now(), stats: s });
        } catch (e) {
          console.error('[fileAdmin] stats failed', e && e.message ? e.message : e);
        }
        // leave cmds.stats as-is (it can be polled repeatedly) — consumer can delete it if desired
      }

      if (changed) safeWriteJson(commandsFile, cmds);
    } finally {
      running = false;
    }
  }

  // Poll the file every pollMs (simple and robust across platforms)
  const iv = setInterval(() => { processOnce().catch(() => {}); }, Math.max(500, pollMs));
  // run once immediately
  processOnce().catch(() => {});

  return {
    stop() { clearInterval(iv); }
  };
}

export default { startFileAdmin };
