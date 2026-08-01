# Profile README backup — 2026-08-01

This directory contains the exact Chinese, English, and Japanese profile READMEs that were live before the `lowlighter/metrics` redesign.

- Source commit: `62a53c436d6ea24e1162ba51f77b400a83f7f396`
- Backup tag: `backup/profile-readme-before-metrics-2026-08-01`
- Files: `README.md`, `README.en.md`, `README.ja.md`

## Restore all three versions

```bash
git restore --source backup/profile-readme-before-metrics-2026-08-01 -- README.md README.en.md README.ja.md
```

The backup is intentionally kept inside the repository as well as in Git history, so it remains readable without knowing the tag command.
