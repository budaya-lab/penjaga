# Steward demo: metadata issues

This descriptor is valid JSON but intentionally fails three shared metadata checks:

- `title` is required and is missing.
- `stage:not-a-real-stage` is not in the bundled policy.
- The resource path `../outside.csv` is not a safe relative POSIX path.

The unsafe path is only metadata. No file exists there, and Steward does not follow it.
