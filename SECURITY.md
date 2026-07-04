# Security Policy

## Supported Versions

Pleco-Xa follows semantic versioning. Security fixes land on the latest minor
release line; please upgrade to the most recent version before reporting.

| Version | Supported          |
| ------- | ------------------ |
| 2.x     | :white_check_mark: |
| < 2.0   | :x:                |

## Reporting a Vulnerability

**Please do not open a public issue for security problems.**

Report vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/pleco-xa/pleco-xa/security/advisories/new)
(the **Security → Report a vulnerability** button on the repository). If you
cannot use that channel, email **brooksc3@oregonstate.edu** with the details.

Please include:

- A description of the vulnerability and its impact
- Steps to reproduce (a minimal input signal or code snippet is ideal)
- The affected version(s)

## What to Expect

- **Acknowledgement** within 5 business days.
- An assessment and, where confirmed, a fix on a coordinated timeline —
  typically a patch release within 30 days, sooner for high-severity issues.
- Credit in the release notes and advisory, unless you prefer to remain
  anonymous.

## Scope

Pleco-Xa is a pure-DSP audio-analysis library with **zero runtime
dependencies** — it ships no server, network, or filesystem access. The most
relevant classes of issue are:

- Crashes, unbounded memory, or denial-of-service from malformed or adversarial
  audio input (e.g. crafted WAV headers, pathological buffer sizes).
- Prototype pollution or unsafe evaluation reachable from a public API.

Because there are no runtime dependencies, the usual transitive-dependency
CVE surface does not apply. Reports about **dev**-dependencies used only for
building/testing are welcome but are generally lower priority.
