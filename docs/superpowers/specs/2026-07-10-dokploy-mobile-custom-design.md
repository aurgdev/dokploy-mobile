# Custom Dokploy Mobile Companion - Design Specification

**Date:** 2026-07-10  
**Status:** Approved  
**Author:** Antigravity AI  

---

## 1. Goal & Overview
The goal of this project is to build a high-fidelity, custom React Native (Expo) mobile dashboard for a user to monitor and manage a single self-hosted Dokploy VPS instance. 

The application is designed following **Apple Design principles**, focusing on high responsiveness (pointer-down feedback), physical spring-driven motions, organic boundary resistance (rubber-banding), and material depth (glassmorphism/translucency).

---

## 2. Architecture & Tech Stack
* **Framework:** React Native + Expo (SDK 55)
* **Routing:** `expo-router` (Tabs Layout)
* **Animations:** `react-native-reanimated` + `react-native-gesture-handler` (custom physics)
* **Storage:** `expo-secure-store` (for URL and API Key encryption)
* **API Client:** Direct REST fetch module mapping Dokploy endpoints

---

## 3. Navigation & State Flow

### A. Auth / Credential Gate
* On startup, check `SecureStore` for `dokploy_vps_url` and `dokploy_api_key`.
* If missing: Load **Setup Screen** (Inputs: VPS URL, API Key, button to validate and save).
* If present: Read credentials, test connection silently, and load **Main App Tabs**.

### B. Tab Configuration
The app uses a bottom tab navigator with three tabs:
1. **Dashboard:** Server health metrics and expandable Project lists.
2. **Deployments:** Global build feed (active, completed, failed) and logs.
3. **Settings:** Edit connection settings, test connection, and log out (clear keys).

---

## 4. UI & Interaction Design (Apple-Style)

### A. Dashboard Resource Carousel
* Displays horizontal scrollable cards for **CPU**, **Memory**, and **Disk**.
* Uses minimal circle/bar progress gauges instead of complex graphs.

### B. Project List
* Lists projects. Tapping a project expands it inline using layout transitions.
* Apps and Databases show a colored status dot:
  * Green: Running
  * Red: Stopped
  * Yellow: Deploying / Processing

### C. Swipeable Details Sheet
Tapping any App or Database slides up a custom gestural bottom sheet.
* **Translucent Glass Material:** Semi-transparent dark overlay + background blur.
* **Critically Damped Spring:** Snaps to open/close states with `damping: 1.0`, `response: 0.35` (no artificial bouncing).
* **Rubber-Banding:** Progressive drag resistance past the top/bottom boundaries.
* **Velocity Handoff:** Captures finger drag velocity on release to animate the sheet smoothly to its final target.
* **Controls:** Big, physical tap buttons (Start, Stop, Restart, Redeploy) and a scrollable log terminal view.

---

## 5. API Client & Endpoints
The HTTP Client will directly fetch from the Dokploy REST API:
* **Connection Validation:** `GET /api/project.all` (verifies API key is active)
* **Projects & Services:** `GET /api/project.all`
* **App Controls:**
  * Start: `POST /api/application.start`
  * Stop: `POST /api/application.stop`
  * Restart: `POST /api/application.restart`
  * Deploy: `POST /api/application.deploy`
* **DB Controls:**
  * Start: `POST /api/database.start`
  * Stop: `POST /api/database.stop`
* **Container Logs:** `GET /api/application.logs` (polled periodically)

---

## 6. Micro-interactions & Haptics
* **Button Scale:** Buttons scale down to `0.96` on touch-down (immediate feedback) and return to `1.0` on release.
* **Action Haptics:**
  * Button press: Light haptic click.
  * Success confirmation: Normal double-pulse.
  * Operation failure: Three quick pulses.
