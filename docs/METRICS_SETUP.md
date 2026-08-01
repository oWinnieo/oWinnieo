# Metrics setup

The profile works with the repository-scoped `GITHUB_TOKEN` for public data. To include private and collaborator repositories in the anonymized fork-aware contribution index, add a repository Actions secret named `METRICS_TOKEN`.

Recommended token access:

- Read-only access to repository metadata and contents/commits for every repository that should be counted.
- Read access to the account profile.
- No write permission is required; the workflow uses `GITHUB_TOKEN` separately when committing generated files.

Privacy rules enforced by `scripts/generate-contribution-index.mjs`:

- Public repository names and their active weekly cells link to the matching GitHub commit view.
- Public forks are included and marked `fork`.
- All private repositories are merged into a single `private repo` row.
- Private repository names and URLs are never written to the README or logs.

`lowlighter/metrics` is used for the main visual. The separate HTML contribution index exists because links embedded inside an SVG loaded through an `<img>` element are not interactive on a GitHub profile README.
