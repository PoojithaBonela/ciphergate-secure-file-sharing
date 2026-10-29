# Encra 3.0

A privacy-focused, secure file-sharing platform.

> **Status:** Foundation only. Feature development has not begun.

---

## Prerequisites

| Tool | Minimum version |
|------|-----------------|
| Node.js | 20.x |
| npm | 10.x |
| PostgreSQL | 15.x *(only required when developing database features)* |

---

## Quick start

### 1. Install dependencies

```bash
npm install
```

This installs dependencies for the root, `client`, and `server` workspaces in one command.

### 2. Configure the server environment

```bash
cp server/.env.example server/.env
```

Edit `server/.env` and set real values when needed. The server starts without a database connection — `DATABASE_URL` is only required when you run Prisma migrations or query the database.

### 3. Start development servers

```bash
# Start both client and server concurrently
npm run dev

# Or start individually
npm run dev:client   # http://localhost:3000
npm run dev:server   # http://localhost:5000
```

---

## Available scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start client and server concurrently |
| `npm run dev:client` | Start Vite dev server (port 3000) |
| `npm run dev:server` | Start Express with nodemon + tsx (port 5000) |
| `npm run build` | Build client and server for production |
| `npm run build:client` | Build Vite frontend only |
| `npm run build:server` | Compile TypeScript server only |
| `npm run lint` | Run ESLint across client and server |
| `npm run typecheck` | Run TypeScript checks across client and server |

### Database scripts (run from project root or `server/`)

| Script | Description |
|--------|-------------|
| `npm run db:generate --workspace=server` | Generate Prisma client |
| `npm run db:migrate --workspace=server` | Apply migrations (requires DB) |
| `npm run db:studio --workspace=server` | Open Prisma Studio |

---

## Project structure

```
encra-3.0/
├── client/                  # React + Vite frontend
│   ├── public/
│   ├── src/
│   │   ├── assets/          # Static assets (images, fonts, etc.)
│   │   ├── components/
│   │   │   ├── common/      # Shared, reusable UI components
│   │   │   └── layout/      # Layout components (Shell, Header, etc.)
│   │   ├── pages/           # Route-level page components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── services/        # API client functions
│   │   ├── utils/           # Pure utility functions
│   │   ├── types/           # Shared TypeScript types and interfaces
│   │   ├── styles/          # Global and shared stylesheets
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── server/                  # Node.js + Express backend
│   ├── prisma/
│   │   └── schema.prisma    # Database schema (PostgreSQL via Prisma)
│   ├── src/
│   │   ├── config/          # Environment and app configuration
│   │   ├── controllers/     # Route handler functions
│   │   ├── routes/          # Express routers
│   │   ├── middleware/       # Express middleware (error handling, auth, etc.)
│   │   ├── services/        # Business logic
│   │   ├── repositories/    # Data access layer (Prisma queries)
│   │   ├── utils/           # Utility functions
│   │   ├── types/           # TypeScript types and interfaces
│   │   ├── app.ts           # Express app factory
│   │   └── server.ts        # HTTP server entry point
│   ├── .env.example
│   ├── nodemon.json
│   ├── package.json
│   └── tsconfig.json
│
├── package.json             # Monorepo root (npm workspaces)
├── .gitignore
└── README.md
```

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Liveness check — returns `{ status: "ok" }` |

---

## Technology stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite 6 |
| Styling | Tailwind CSS 4 (Vite plugin) |
| Routing | React Router 7 |
| Icons | Lucide React |
| Backend | Node.js, Express 4, TypeScript |
| ORM | Prisma 6 (PostgreSQL) |
| Validation | Zod |
| Security | Helmet, CORS |

---

## Planned features (not yet implemented)

- AES-256-GCM password-based file encryption (Web Crypto API)
- Secure file storage (AWS S3)
- Sender dashboard (24-hour access window, metadata, revocation)
- Optional location-based access restrictions
- Optional consent-based camera monitoring (MediaPipe)
- Optional email / SMS notifications
- Automatic file expiration and deletion

---

## License

Private — all rights reserved.
