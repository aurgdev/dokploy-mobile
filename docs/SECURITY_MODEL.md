# Security Model

This document outlines the security architecture and boundaries of the **Dokploy Companion** application.

---

## 🔒 1. Credential & Profile Storage

The application stores your connection URL and API keys locally on your device.

* **iOS Storage**: Credentials are saved to iOS **Keychain Services**.
* **Android Storage**: Credentials are saved to **EncryptedSharedPreferences** backed by the **Android Keystore system**.
  * *Note: Hardware-backed encryption keys are utilized where supported by the physical device hardware; otherwise, software-backed fallback keys are used.*
* **Expo SecureStore**: Secure operations are managed exclusively via the `expo-secure-store` library.
* **Active Profile Cache**: During app execution, the active profile credentials (API keys and endpoint configuration) are cached in memory inside the react context/query layers.
* **AsyncStorage**: The standard React Native `AsyncStorage` is used **only** for storing non-sensitive metadata such as:
  * Server version and release tags.
  * Discovered OpenAPI/Endpoint capabilities.
  * Connection health status timestamps.
  * *No API keys, passwords, or connection credentials ever enter standard AsyncStorage.*

---

## 🌐 2. Network Security

* **HTTPS Enforcement**: By default, public and non-local Dokploy URLs **must** use HTTPS protocol.
* **HTTP Exemption**: Connections using plain HTTP are permitted only for local development or trusted private network IP ranges (e.g., `localhost`, `127.0.0.1`, `192.168.x.x`, `10.x.x.x`, `172.16.x.x` to `172.31.x.x`). A warning prompt is shown to the user on first connection to HTTP hosts.
* **API Key Transmission**: API keys are passed strictly via HTTP request headers (`Authorization` or `x-api-key`) in TLS-encrypted channels.

---

## ⚙️ 3. Capability vs. Permission Security

* **Capability Support**: Checked by looking at available REST paths (using OpenAPI parsing or probing endpoints). This determines if the server *supports* a feature.
* **API Key Permission**: Controlled by the user's role on the Dokploy VPS (e.g., Admin vs. Guest). If the API key lacks authorization to perform a task, the server will reject the request with `403 Forbidden` or `401 Unauthorized` regardless of the app's capability checks.

---

## 🛡️ 4. Local Log & Error Redaction

* To prevent developer tools or diagnostics from leaking secrets, the app runs a central **Redactor** utility on all API payloads.
* Any object key resembling `Authorization`, `x-api-key`, `password`, `token`, `secret`, or connection credentials will have its value replaced with `[REDACTED]` before printing to console logs or attaching to error messages.

---

## ⚠️ 5. Protection Boundaries & Risk Assumptions

Like any client application, the app's internal security is bound by its sandbox environment:
* **Compromised Device**: If the host operating system is compromised (e.g., rooted Android or jailbroken iOS, or active spyware running), memory contents and SecureStore assets could potentially be accessed. This lies outside the app's protection boundary.
* **Compromised Dokploy Server**: If the target self-hosted Dokploy VPS is compromised, the attacker may return malicious OpenAPI docs or false payloads. The app performs client-side safety parsing but assumes the target server's communication channel remains verified via valid SSL/TLS certificates.
