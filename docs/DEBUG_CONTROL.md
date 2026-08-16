# DEBUG Log Control in @worktif/utils

## Overview

DEBUG logs in `@worktif/utils` are now controlled by the `RUNTIME_DEBUG` environment variable. This provides fine-grained control over debug output for the entire package, not just the logger.

## Behavior

### Default Behavior (DEBUG logs hidden)
By default, DEBUG level logs are **hidden** even if the logger is configured with DEBUG level. This prevents verbose debug output in production and development environments unless explicitly requested.

```typescript
import { logger, initLog } from '@worktif/utils';
import { LoggerLevel } from '@worktif/utils';

const loggerInstance = logger({ serviceName: 'MyService' });
const log = await initLog(loggerInstance, 'myAction', LoggerLevel.Info);

// This DEBUG log will NOT be displayed (default behavior)
await log.now({ data: 'test' }, { level: LoggerLevel.Debug });

// INFO, WARN, ERROR logs are always displayed
await log.now({ data: 'test' }, { level: LoggerLevel.Info });  // ✓ Displayed
await log.now({ data: 'test' }, { level: LoggerLevel.Warn });  // ✓ Displayed
await log.now({ data: 'test' }, { level: LoggerLevel.Error }); // ✓ Displayed
```

### Enabling DEBUG Logs

To enable DEBUG logs, set the `RUNTIME_DEBUG` environment variable to `'true'`:

```bash
# Enable DEBUG logs for @worktif/utils
export RUNTIME_DEBUG=true

# Run your application
node app.js
```

Or in your code (before importing the logger):

```typescript
process.env.RUNTIME_DEBUG = 'true';

import { logger, initLog } from '@worktif/utils';
// ... rest of your code
```

### Disabling DEBUG Logs

To explicitly disable DEBUG logs (or return to default behavior):

```bash
# Disable DEBUG logs
unset RUNTIME_DEBUG

# Or set to false
export RUNTIME_DEBUG=false
```

## Environment Variable

### `RUNTIME_DEBUG`

- **Type**: `string`
- **Values**: 
  - `'true'` - Enable DEBUG logs
  - Any other value or unset - Disable DEBUG logs (default)
- **Scope**: Affects the entire `@worktif/utils` package
- **Purpose**: Controls visibility of DEBUG level logs across all utilities

## Use Cases

### Development
```bash
# Enable verbose debugging during development
export RUNTIME_DEBUG=true
npm run dev
```

### Production
```bash
# Keep DEBUG logs hidden in production (default)
unset RUNTIME_DEBUG
npm start
```

### CI/CD
```bash
# Enable DEBUG logs for troubleshooting CI issues
RUNTIME_DEBUG=true npm test
```

### Docker
```dockerfile
# Dockerfile
ENV RUNTIME_DEBUG=false

# Or enable for debugging
# ENV RUNTIME_DEBUG=true
```

## Why This Approach?

1. **Package-scoped**: The variable name `RUNTIME_DEBUG` clearly indicates it controls the entire `@worktif/utils` package, not just the logger
2. **Explicit control**: DEBUG logs are opt-in, preventing accidental verbose output
3. **Production-safe**: Default behavior hides DEBUG logs, reducing noise in production logs
4. **Flexible**: Can be enabled per-environment or per-deployment without code changes

## Migration from Previous Behavior

If you were relying on DEBUG logs being displayed automatically, you now need to:

1. Set `RUNTIME_DEBUG=true` in your environment
2. Or update your logger configuration to use INFO level instead of DEBUG for important logs

```typescript
// Before (DEBUG logs were always shown)
await log.now({ data: 'important' }, { level: LoggerLevel.Debug });

// After (use INFO for important logs, or enable DEBUG via env var)
await log.now({ data: 'important' }, { level: LoggerLevel.Info });

// Or enable DEBUG logs via environment variable
process.env.RUNTIME_DEBUG = 'true';
await log.now({ data: 'debug info' }, { level: LoggerLevel.Debug }); // Now visible
```

## Related Environment Variables

- `STAGE`: Controls the application environment (dev, staging, prod)
- `SERVICE_NAME`: Sets the service name for logging
- `RUNTIME_DEBUG`: Controls DEBUG log visibility (this feature)
