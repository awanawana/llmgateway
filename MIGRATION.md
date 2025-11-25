# Migration Guide: Encrypting Provider API Keys

This guide explains how to migrate existing plaintext provider API keys to encrypted format.

## Prerequisites

Before running the migration, ensure you have:

1. Set the `ENCRYPTION_KEY` environment variable with a 32-byte base64-encoded key:

   ```bash
   # Generate a new key
   openssl rand -base64 32

   # Set in your environment
   export ENCRYPTION_KEY="<generated-key>"
   ```

2. Built the database package:
   ```bash
   pnpm --filter @llmgateway/db build
   ```

## Running the Migration

### Method 1: Using the npm script (Recommended)

```bash
# From the root of the repository
pnpm --filter @llmgateway/db encrypt-keys
```

### Method 2: Using the built file directly

```bash
# From the packages/db directory
cd packages/db
node dist/encrypt-provider-keys.js
```

### Method 3: Programmatically

You can also import and run the migration function in your own code:

```typescript
import { encryptProviderKeys } from "@llmgateway/db";

await encryptProviderKeys();
```

## What the Migration Does

The migration script:

1. Fetches all active provider keys from the database
2. Checks each key to see if it's already encrypted
3. Encrypts plaintext keys using AES-256-GCM
4. Updates the database with encrypted tokens
5. Logs progress and results

## Migration Output

The script will log:

- Total number of keys checked
- Number of keys encrypted
- Number of keys skipped (already encrypted)
- Number of errors (if any)

Example output:

```
[INFO] Starting provider key encryption migration
[INFO] Found 5 provider keys to check
[INFO] Encrypted provider key abc123 for provider openai
[INFO] Encrypted provider key def456 for provider anthropic
[INFO] Provider key encryption migration completed {
  total: 5,
  encrypted: 3,
  skipped: 2,
  errors: 0
}
```

## Safety

- The migration is idempotent - it's safe to run multiple times
- Already encrypted keys are automatically skipped
- The migration runs in a transaction (implicit per update)
- Deleted keys are not processed

## Rollback

If you need to rollback:

1. The migration does not keep plaintext backups
2. You should restore from a database backup taken before running the migration
3. After restoring, do not deploy the encryption code until you're ready to re-run the migration

## Post-Migration

After successfully running the migration:

1. Verify all keys are encrypted by checking the database
2. Test that the API and Gateway can decrypt and use the keys
3. Monitor logs for any decryption errors
4. Keep the `ENCRYPTION_KEY` environment variable secure and backed up

## Troubleshooting

### "ENCRYPTION_KEY environment variable is required"

Make sure you've set the `ENCRYPTION_KEY` environment variable:

```bash
export ENCRYPTION_KEY="your-base64-encoded-32-byte-key"
```

### "ENCRYPTION_KEY must be a 32-byte key"

The key must be exactly 32 bytes when decoded from base64. Generate a new one:

```bash
openssl rand -base64 32
```

### Migration fails with errors

Check the logs for specific error messages. Common issues:

- Database connection problems
- Missing shared package dependency
- Corrupted token data

If specific keys fail, you may need to manually investigate and fix them.
