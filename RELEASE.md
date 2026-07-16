# Release Guide

Use this checklist when preparing a GitHub release and an Obsidian Community Plugin submission.

## Build

Install dependencies:

```bash
pnpm install --frozen-lockfile
```

Build the plugin:

```bash
pnpm run typecheck
pnpm test
pnpm run build
```

Confirm these files exist at the repository root:

```text
manifest.json
main.js
styles.css
```

## Version Files

Before creating a release:

1. Confirm `manifest.json` has the release version.
2. Confirm `package.json` has the same version.
3. Confirm `versions.json` maps that plugin version to the same `minAppVersion` used in `manifest.json`.

Example:

```json
{
  "0.1.0": "1.5.0"
}
```

## GitHub Release

1. Commit the release changes.
2. Create a Git tag that exactly matches `manifest.json` version.
3. Do not prefix the tag with `v`.

Correct:

```text
0.1.0
```

Incorrect:

```text
v0.1.0
```

4. Push the tag to GitHub.
5. Create a GitHub release for that tag.
6. Upload these files as individual release assets:

```text
manifest.json
main.js
styles.css
```

Do not upload a zip file instead of the individual assets for the Obsidian release.

## Obsidian Community Plugin Submission

After the GitHub release is available:

1. Open the Obsidian Community Plugins developer dashboard.
2. Submit this repository.
3. Use the plugin id from `manifest.json`.
4. Confirm the latest GitHub release contains `manifest.json`, `main.js`, and `styles.css`.
5. Confirm the release tag exactly matches the plugin version.
