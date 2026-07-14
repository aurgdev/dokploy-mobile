# Release & Deployment Guide

This document describes the validation and release processes for **Dokploy Companion**.

---

## 💻 Part 1: Actions Safe on the Current PC

The following tasks are safe to execute on this environment to verify project integrity before transfer:

1. **Install Dependencies**:
   ```bash
   npm ci
   ```
2. **TypeScript Compilation Check**:
   ```bash
   npm run typecheck
   ```
3. **Execute Unit Tests**:
   ```bash
   npm run test:ci
   ```
4. **Configuration Check (Partial)**:
   ```bash
   npm run doctor
   ```
   *(Note: The ignore check of the doctor tool will fail because Git is not yet initialized or installed here.)*

---

## 🏠 Part 2: Future Actions to Perform on the Owner's PC

The following tasks must be performed later on your personal Windows development PC where Git is installed and you have full control over keys and endpoints.

### 1. Initialize and Push Git Repository
Once the codebase is copied to your development machine:
1. Initialize the repository:
   ```bash
   git init
   ```
2. Add and commit all audited repository files:
   ```bash
   git add .
   git commit -m "chore: initial release configuration"
   ```
3. Push to your empty remote GitHub repository:
   ```bash
   git remote add origin <your-github-repo-url>
   git branch -M main
   git push -u origin main
   ```
4. Verify that the **CI Workflow** (`ci.yml`) runs successfully on GitHub.

### 2. Run Native Android Builds Locally
To build or debug native Android binaries locally:
1. Run prebuild to generate native files:
   ```bash
   npx expo prebuild --platform android
   ```
2. Launch the native debug build on your connected physical device or emulator:
   ```bash
   npm run android:run
   ```

### 3. Generate Android Preview APKs on GitHub Actions
1. Navigate to your repository on GitHub.
2. Select the **Actions** tab.
3. Click the **Build Android APK** workflow.
4. Run the workflow manually via `workflow_dispatch`.
5. Download **`Android Preview APK`** from the artifacts section to perform smoke testing on a physical device.

### 4. Future Permanent Android Signing & Releases
Before creating stable signed releases or publishing to the Play Store, configure the signing pipeline using these repository secrets on GitHub:
* `ANDROID_KEYSTORE_BASE64` (Base64-encoded release `.jks` file)
* `ANDROID_KEYSTORE_PASSWORD`
* `ANDROID_KEY_ALIAS`
* `ANDROID_KEY_PASSWORD`

*Do not create or check in keystore files to the repository. Release tags and actual prereleases should only be published after the keystore signing process is fully configured and verified.*
