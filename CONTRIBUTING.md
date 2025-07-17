# Contributing to Pleco Xa

Thank you for considering a contribution!

## Development setup

Install all project dependencies before running tests or the development server:

```bash
npm ci
```

This command installs both production and development packages exactly as locked
in `package-lock.json`, including the `vitest` test runner. It ensures
reproducible installs across environments.

Alternatively, run the helper script:

```bash
npm run setup
```

## Running tests

After installing dependencies, execute:

```bash
npm test
```

We use [Vitest](https://vitest.dev/) for the test suite.
