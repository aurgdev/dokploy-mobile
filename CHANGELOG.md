# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0-beta.1] - Unreleased

### Added

* **Core & Connection Setup**
  * Encryption-first connection flow validating VPS address and api key.
  * Local device biometric authentication lock (fingerprint/face recognition).
  * Auto-redaction utility stripping sensitive API credentials and connection tokens from all logs and error streams.

* **Capability Discovery Engine**
  * Auto-probes API capabilities based on target self-hosted Dokploy version.
  * Dynamically locks or unlocks features in the user interface depending on detected server capabilities and permissions.

* **Projects & Services Manager**
  * Interactive tree mapping Projects -> Applications, Databases, Compose stacks.
  * Unified service lifecycle controls (Start, Stop, Restart, and Redeploy) with instant feedback.
  * Host VPS cleanups (unused Docker images, container cache, build volumes).

* **Container Inspector & Log Terminal**
  * Inspect detailed container network interfaces, mounts, local ports, status, and system uptime.
  * Stream live stdout/stderr container logs directly into an on-device scrollable console view.

* **Domains & SSL Router**
  * Full dashboard for domain registrations, routing paths, and Let's Encrypt SSL/TLS status.
  * Inline domain creation, validation checks, and automatic test domain generation.

* **Database & Volume Backups**
  * Real-time tracking of database backup schedules, backup file histories, and manual execution triggers.
  * Named application and Docker Compose volume backup configurations with bind-mount protection rules.
