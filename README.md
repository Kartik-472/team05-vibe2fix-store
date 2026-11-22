# Vibe2Fix Store

An e-commerce store for precision hardware: React frontend, Express + Prisma backend, PostgreSQL database.

Your task: find the security problems in this code and fix them, without breaking the store.

## Run it locally

Put a unique strong `ADMIN_PASSWORD` in a local `.env` file beside docker-compose.yml.

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine with Compose).

```bash
docker compose up --build
```

The first build takes a few minutes. When you see `Vibe2Fix backend listening`, open **http://localhost:8000**.
(The log says port 5000: that is inside the container. On your machine it is 8000.)

### Demo accounts

| Role | Email | Password |
|---|---|---|
| Customer | `customer@vibe2fix.com` | `Demo@Vibe2024` |

These exist only in your local copy. You can also register new accounts.

### After changing code

Stop with **Ctrl+C**, then rebuild and start again:

```bash
docker compose up --build
```

### Start over with fresh data

```bash
docker compose down -v
docker compose up --build
```

## Project layout

| Folder | What it is |
|---|---|
| `server/src/routes/` | API routes |
| `server/src/controllers/` | Request handling |
| `server/src/services/` | Business logic and database queries |
| `server/src/middleware/` | Auth, input handling, uploads, error handling |
| `server/prisma/` | Database schema and demo data |
| `client/src/` | React frontend |

## Submitting

Follow the submission instructions from the organisers. Make sure the store still works after your changes: browsing, cart, checkout, orders, reviews and the admin panel.

## Phase 2 deployment

Use the existing Prisma schema setup (Compose uses `prisma db push`). On an existing
migration-managed database, apply the additive sessions-and-verification migration
before switching the application. Existing customers keep their orders and accounts;
all users sign in again at the cutover. The bearer token now identifies a database
session and signing out revokes that session.

For welcome discounts, configure `RESEND_API_KEY` and `VERIFICATION_FROM` (a verified
sender) in the app environment. The server needs outbound HTTPS access to Resend.
Customers request and confirm their code under Profile. The welcome coupon remains
unavailable until ownership is confirmed. Ordinary purchases do not require email.
Eligibility is once per account subject to the coupon's global redemption limit.

For a host you operate, supply a valid certificate chain and key as
`deploy/certs/fullchain.pem` and `deploy/certs/privkey.pem`. Set `PUBLIC_HOST` to
the certificate hostname, `PUBLIC_HTTPS=true`, and start `docker compose --profile tls up --build`.
Keep the app port loopback-only. Set `TRUST_PROXY=1` only behind a single trusted
proxy that overwrites the forwarding headers. For a longer chain, configure
trusted proxy addresses for your deployment. Local HTTP remains available on loopback.

The competition access gate is external to this repository. When using the TLS proxy
with a gate, set `STORE_UPSTREAM` to the reachable gate host:port and configure the
gate to forward to the app on the private network. If organizers operate the public
gateway, have them apply HTTPS and the Secure cookie flag at that gateway. The
included Nginx configuration marks the gate cookie on responses that pass through it.

Run the targeted service regressions with `node --test server/test/phase2.test.js` from the repository root. These use database doubles.
