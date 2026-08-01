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

`lowlighter/metrics` generates two visuals:

- `github-metrics.svg` is the full-width overview for languages, account metadata, and featured repositories.
- `github-metrics-calendar.svg` is a compact standalone full-year contribution calendar.

The separate eight-week HTML contribution index exists because links embedded inside an SVG loaded through an `<img>` element are not interactive on a GitHub profile README.

The upstream Recent activity plugin is intentionally disabled. GitHub's current public Events payload omits `payload.commits` from `PushEvent`, while the plugin still calls `commits.filter(...)`; Metrics therefore renders `Unexpected error`. The clickable fork-aware index supplies the recent commit view until the upstream plugin handles the new payload safely.
