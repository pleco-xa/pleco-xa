# Governance

Pleco-Xa is a small project with strong opinions. This document says who
decides things, what is not up for debate, and how that changes if the
project grows. It is written for a project of this size — one maintainer,
early contributors, and a user count still near zero — and it will be revised
when reality outgrows it.

## The steward

The project has a single steward: **Cameron Brooks** ([@brookcs3](https://github.com/brookcs3)),
the project's creator. The steward sets direction, has final say on every
change, and owns releases. This is a benevolent-dictator model, chosen
deliberately: at this stage, a coherent product built with taste beats a
consensus product built by committee. The steward is also the contact of
record for [security reports](SECURITY.md) and
[Code of Conduct enforcement](CODE_OF_CONDUCT.md).

Disagreement is welcome. Open an issue, make the argument, bring evidence —
the steward has been talked out of things before and expects to be again.
But when discussion ends, one person decides, and the decision is recorded
in the issue or PR where it happened.

## The hard rules

Some properties of this library are constitutional. PRs that violate them
will be declined regardless of quality — and they bind the steward too:

1. **Zero runtime dependencies.** Nothing lands in a consumer's bundle
   except this library. Dev dependencies are fine; runtime ones are not.
2. **Honesty over convenience.** Functions that cannot produce a valid
   result throw with diagnostics. No silent fallbacks between quality
   tiers, no fabricated confidence values, no plausible-but-wrong defaults.
3. **The uniform contract.** Analysis functions take
   `(Float32Array, sampleRate)` and return plain data. Browser, Node, and
   worker behavior stay identical on that path.
4. **Proof ships with claims.** Numerical behavior is pinned by committed
   reference fixtures with declared tolerances (see
   [`VERIFICATION.md`](VERIFICATION.md)). A capability that cannot be
   fixture-verified is documented as experimental, not claimed as stable.
5. **The library is silent by default.** No logging outside the debug flag.

## How changes land

The gate decides, not the origin.

- **Every change goes through a PR with green CI.** The pipeline is the
  law: lint, the full test suite (420 tests against committed
  goldens — see [`VERIFICATION.md`](VERIFICATION.md)), the packed-tarball type check under both module resolutions,
  and the docs build. If CI is red, it does not merge — including the
  steward's own work.
- **AI-assisted contributions are welcome and unexceptional.** This
  library was built with heavy agent assistance, verified at every step;
  pretending otherwise would be theater. What is not welcome is
  *unverified* work from any source — human or agent. If you (or your
  agent) submit a PR, you are personally vouching that you ran it, read
  it, and can defend it in review. "The model wrote it" is not a defense;
  it is a description.
- **Small PRs merge fast; big PRs merge slow.** A focused fix with a test
  can land the same day. A new capability needs a conversation first —
  open the issue before you write the five hundred lines.
- **Numerical changes carry their evidence.** If a PR changes analysis
  output, it must update or add reference fixtures and state the tolerance
  impact. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Scope: what this project says no to

Lean is a feature. The project will generally decline: wrappers around
other libraries, runtime dependencies of any kind, capabilities that can't
run in a browser tab, kitchen-sink options on stable APIs, and breaking
changes without a deprecation path. "No" is the default answer to scope;
the burden of proof is on the addition.

## If the project grows

Governance should be one size larger than the project actually is, and no
larger. The planned stages:

1. **Now — solo steward.** Everything above.
2. **Trusted committers.** Contributors who have landed several
   well-verified PRs and shown taste alignment may be given merge rights
   over specific areas (a namespace, the docs, the demo gallery). Merge
   rights are earned by demonstrated judgment, not seniority or volume,
   and can be handed back or withdrawn without drama.
3. **A real team.** If the project ever has multiple active maintainers,
   this document gets rewritten with them: decision records for anything
   contested, a lazy-consensus default for routine changes, steward as
   tiebreaker rather than gatekeeper.
4. **Beyond one person.** If Pleco-Xa ever matters enough that a single
   steward is a liability, the honest options are a neutral home
   (a foundation or multi-maintainer org) or a clearly-designated
   successor. The steward commits to choosing one *before* it is urgent.

## Bus factor, stated plainly

Today the bus factor is one. Mitigations that already exist: the entire
verification methodology is reproducible from the public repo
(`npm ci && npm test`), releases are tagged, the
documentation source lives in-tree, and nothing about the build requires
private infrastructure. If the steward disappears tomorrow, a competent
stranger could maintain this project from what is public. That is a design
goal, not an accident.

## Changing this document

Governance changes are PRs like everything else — visible, reviewable,
recorded. The steward decides, until stage 3 above says otherwise.
