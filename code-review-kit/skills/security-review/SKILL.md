---
name: security-review
description: Security-focused review for vulnerabilities, auth issues, and data exposure. Use when reviewing auth code, API endpoints, user input handling, or before deploying security-sensitive changes.
---

# Security Review

## When to use

- Reviewing authentication or authorization code
- Reviewing API endpoints that accept user input
- Before deploying security-sensitive changes
- User asks for a security review

## Checklist

1. **Injection**: SQL injection, XSS, command injection, path traversal
2. **Authentication**: proper session/token handling, no hardcoded secrets
3. **Authorization**: access controls on every sensitive operation
4. **Data exposure**: no PII or secrets in logs, responses, or error messages
5. **Input validation**: validate and sanitize all external input
6. **Dependencies**: check for known vulnerabilities in new dependencies
7. **Cryptography**: no custom crypto, use established libraries and algorithms

## Output format

Report findings grouped by severity:

- **Critical**: exploitable vulnerability, must fix before merge
- **High**: likely security risk, fix before release
- **Medium**: defense-in-depth improvement
- **Low**: informational, best practice suggestion

For each finding: describe the risk, affected code location, and recommended fix.
