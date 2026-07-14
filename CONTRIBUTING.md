# Contributing to Dokploy Companion

Thank you for your interest in contributing to **Dokploy Companion**! This project is an unofficial community dashboard for Dokploy.

---

## 🛠 Setup Instructions

To get started with local development:

1. **Prerequisites**: Make sure you have Node.js (v20 or v22 recommended) and npm installed.
2. **Install Dependencies**:
   ```bash
   npm ci
   ```
3. **Verify Setup**: Run Expo Doctor to check project health:
   ```bash
   npm run doctor
   ```

---

## 💻 Development & Execution

- **Development Runtime**: Start the bundler and development server:
   ```bash
   npm run start
   ```
   To open the development runtime inside an emulator or connected device (using Expo Go or a pre-configured client):
   ```bash
   npm run android
   npm run ios
   ```
   *Note: `expo start --android` starts the development server and triggers the development runtime; it does not compile a native application.*

- **Local Native Android Run**: To compile and run the native application debug build on your connected device/emulator:
   ```bash
   npm run android:run
   ```

---

## 🧪 Testing & Validation

All contributions must pass code style checks, compiler checks, and tests:

- **Type Checking**:
   ```bash
   npm run typecheck
   ```
- **Run Tests**:
   ```bash
   npm run test
   ```
- **CI Test Run**: To run the test suite in band (single thread, matching CI behavior):
   ```bash
   npm run test:ci
   ```

---

## 📝 Pull Request Checklist

Before submitting a Pull Request, ensure that:
1. All 150+ Jest tests pass successfully.
2. The code compiles without TypeScript errors.
3. No secrets, credentials, or personal local paths (e.g. `C:\Users\...`) are committed.
4. Your commits are atomic and have clean messages.
