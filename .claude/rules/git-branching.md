# Git Branching (Git Flow)

Git branching using git flow.

## Base Branches

| Branch | Parent | Purpose | Deployable |
|--------|--------|---------|------------|
| `master` | (root) | Production-ready code. | Yes |
| `develop` | `master` | Integration branch for ongoing development. Auto-updates from `master`. | No |

## Topic Branches

### feature/

- **Parent:** `develop`
- **Start from:** `develop`
- **Upstream:** merge / **Downstream:** rebase
- **Naming:** `feature/<short-description>` or `feature/<ticket-id>-<short-description>`
- **Examples:** `feature/license-activation`, `feature/123-single-variant-cart`

### release/

- **Parent:** `master`
- **Start from:** `develop`
- **Upstream:** merge / **Downstream:** merge
- **Tags:** yes
- **Naming:** `release/<version>`
- **Examples:** `release/v0.1.0`, `release/v1.0.0`
- **Purpose:** Freeze features, bug fixes only. Allows `develop` to receive new features for the next release.

### hotfix/

- **Parent:** `master`
- **Start from:** `master`
- **Upstream:** merge / **Downstream:** rebase
- **Tags:** yes
- **Naming:** `hotfix/<version>` or `hotfix/<description>`
- **Examples:** `hotfix/v0.1.1`, `hotfix/fix-license-expiry-check`

### bugfix/

- **Parent:** `develop`
- **Start from:** `develop`
- **Upstream:** merge / **Downstream:** rebase
- **Naming:** `bugfix/<short-description>`
- **Examples:** `bugfix/cart-validation-error`, `bugfix/null-customer-id`

### support/

- **Parent:** `master`
- **Start from:** `master`
- **Upstream:** none / **Downstream:** none
- **Naming:** `support/<version>`
- **Purpose:** Long-term maintenance of specific production releases.

## Rules

- Never commit directly to `master`.
- Keep `develop` always in a buildable state.
- Delete branches after merging.
- Use `git flow <type> start/finish` commands to manage branches.
- Tag `master` with semantic version (e.g., `v0.1.0`) after each release or hotfix merge.
