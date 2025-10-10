File-based admin commands for cache

Drop a JSON file with commands and the server will process it on changes/poll.

Default location (if not set): ./admin_cache_commands.json

Supported commands (JSON shape):

{
  "flush": ["products:v1:abcd*", "home:v1:123"],
  "stats": true
}

- flush: array of keys to flush. Keys can end with '*' to indicate prefix deletion (e.g. 'products:v1:abcd*'). After processing the flush list the server clears the array in the file so commands are not repeatedly executed.
- stats: if true the server will write a file alongside the commands file named `admin_cache_stats.json` with the current cache stats (calls `cache.stats()` and writes the JSON).

How to enable

Set the environment var on server startup:

PowerShell:
$env:ADMIN_COMMANDS_FILE='C:\path\to\admin_cache_commands.json'; node src/server.js

Or add to your process manager env.

Security

This is intended for local/dev operational convenience. Do not expose the commands file to untrusted users. In production you may prefer the guarded HTTP admin endpoints (ADMIN_CACHE_SECRET) instead.
