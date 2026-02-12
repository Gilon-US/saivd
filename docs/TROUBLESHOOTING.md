# Troubleshooting

## npm warnings during build

If you see warnings like:

```
npm warn Unknown env config "devdir". This will stop working in the next major version of npm.
npm warn Unknown user config "always-auth". This will stop working in the next major version of npm.
```

These come from **user-level or global npm config**, not this project. npm 11.2+ rejects unrecognized settings.

### How to fix

1. **Find the source:**
   ```bash
   npm config ls -l
   ```
   Look for `devdir` or `always-auth` and note their origin (file path or environment).

2. **Remove from user config:**
   ```bash
   npm config delete devdir
   npm config delete always-auth
   ```

3. **Or edit manually:**
   - User config: `~/.npmrc`
   - Remove lines containing `devdir=` or `always-auth=`

4. **If from environment variables:**
   Check your shell profile (`.bashrc`, `.zshrc`) for `npm_config_devdir` or `npm_config_always-auth` and remove them.

`devdir` is often set by **node-gyp** for native builds; `always-auth` by scoped registry auth. Removing them is safe for this project.
