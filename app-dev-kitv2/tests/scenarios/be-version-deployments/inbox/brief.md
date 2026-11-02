# Service version and deployment log

Today the liveness endpoint answers with a status only.

Operators want GET /health/live to also return the running service version when SERVICE_VERSION is configured.

Every deployment must be recorded in a deployments table with the version and the time it went live.
