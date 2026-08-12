# Meridian Capital Migration — Vercel SA Take-Home Submission

Design doc + working demo for a legacy IT admin evaluating moving Meridian
Capital's portfolio-watchlist app and its front end/app tier to Vercel.

## → The working demo lives in a separate repo

**[github.com/FraserPol/meridian-migration-demo](https://github.com/FraserPol/meridian-migration-demo)**
— the actual Next.js app, the Migration Copilot (AI SDK + AI Gateway), and
the Terraform for the real AWS RDS + HCP Vault production path. Its own
README covers running it locally, deploying it, demo accounts, and known
limitations. It's a separate repo (not a subdirectory here) so its own
commit history stays intact and independently reviewable.

**Live demo:** _add your Vercel deployment URL here once you're ready to publish it_

## This repo

- [`solution-architecture.md`](./solution-architecture.md) — the design
  doc: target-state architecture, the OIDC-based boundary-crossing pattern
  between Vercel and AWS/HCP Vault the demo implements, and the
  migration/rollout plan. Read this first.
- This README.

**Deploying the demo yourself?** See
[`PRODUCTION_SETUP.md`](https://github.com/FraserPol/meridian-migration-demo/blob/main/PRODUCTION_SETUP.md)
in the demo repo — explicit, copy-paste commands in order, from Terraform
init through the full AWS RDS + HCP Vault production setup.
