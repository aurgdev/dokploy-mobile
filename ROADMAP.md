# 🗺 Dokploy Companion Roadmap

This document outlines the development status and planned direction for the **Dokploy Companion** mobile app.

---

## ✅ Completed

- **Secure Connection & Biometric Lock**: Encrypted credentials in local hardware-backed storage (`SecureStore`) with optional fingerprint/face authentication gating.
- **Capability & Permission Foundation**: Automatic feature discovery based on target Dokploy version and endpoint scans; permission-aware read/write controls.
- **Dashboard Telemetry**: Real-time VPS resource dials (CPU, RAM, and Disk) with status cards.
- **Projects & Resource Controls**: Categorized namespaces (Projects, Applications, Databases, Compose).
- **Containers & Logs**: Live container status, inspector, uptime, ports, mounts, networks, and terminal streaming logs.
- **Domains & HTTPS**: Full domains listing, details, creation, deletion, SSL verification, generated test domains.
- **Database Backups**: Backup health status, lists of recent backup files, and manual backup triggers.
- **Volume Backups**: Dedicated dashboard and backup plans for named application volumes.
- **Server Maintenance Tools**: Host VPS cleanups (Docker image, unused containers, volumes, build caches).

---

## 🚀 Next (Beta Milestones)

1. **Incident Center & Priority Alerts**: Consolidated warning dashboard showing failed containers or high resource usage.
2. **Failed & Stuck Deployment Recovery**: Diagnostic utilities to inspect and troubleshoot frozen build queues.
3. **Deployment Cancellation & Rollback**: Terminating active builds and rolling back services to previous images.
4. **Notification Integrations**: Push notification support for service health updates.
5. **Environment Variables & Configuration Editing**: Managing server/container env properties dynamically.
6. **Ports, Mounts, Redirects & Schedules**: Finer settings for application routes and cron schedules.
7. **Multi-instance Connection Profiles**: Fast switching between multiple configured Dokploy VPS servers.
8. **Remote-Server Management**: Basic host OS administration tools.
9. **Request & Traffic Logs**: High-level traffic analytics dashboard (where Traefik logs are enabled).
10. **Open-source Beta Stabilization**: Enhancing responsiveness, resolving outstanding edge cases, and community audit support.

---

## 🔮 Later (Production & Store Releases)

- **Stable Signed Android Releases**: Generating release keys and setting up secure production build signing.
- **Play Store Distribution**: App store releases for Android.
- **iOS Validation**: Dedicated Keychain testing, physical iPhone compatibility runs, and TestFlight.
- **Localization**: Multi-language support.
- **Accessibility Audit**: Implementing screen reader tags and dynamic text scaling.
- **Advanced Traefik Tools**: Traefik middleware config support.
- **Team & Organization Administration**: Multi-user permissions management.
- **Restore Workflows**: Adding backup restoration actions (planned only after API safety guarantees are validated).
