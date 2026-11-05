# Security Policy

## Supported versions

| Version         | Supported |
| --------------- | --------- |
| 0.1.x (current) | ✅        |
| older           | ❌        |

The extension is published from the `main` branch of this repository;
security fixes land there first and ship in the next tagged release.

## Reporting a vulnerability

Please do **not** open a public issue for something that looks exploitable.

- Preferred: GitHub **private vulnerability reporting** on this repository
  (Security → Report a vulnerability), which reaches the maintainer directly.
- Alternative: open an issue asking for a private contact channel, without
  describing the details.

You can expect a first response within **7 days**. If the report is
confirmed, a fix will be prepared privately and released as soon as it is
ready; you will be credited in the release notes unless you prefer not to be.

## Scope

LRC Toolkit reads and edits the text of `.lrc` files opened in VS Code. It
has **zero runtime dependencies and no network access**: it does not fetch,
telemetry, or execute content from the lyrics files. Vulnerabilities that
would matter most are ones that let a crafted `.lrc` file crash the extension
host, corrupt unrelated editor state, or exfiltrate document content.
