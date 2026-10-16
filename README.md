# StockRoom

**StockRoom** is a web-based inventory management workspace for grocery wholesalers supplying products in bulk to retail shops. It brings product and category records, current stock, low-stock thresholds, and an auditable stock-movement history into one authenticated application.

StockRoom is an inventory-control tool, not a point-of-sale or accounting application. Product prices are catalog data; the app does not record retail sales, supplier purchase orders, retailer orders, invoices, or historical stock balances.

## Contents

- [Overview](#overview)
- [Features](#features)
- [Technology stack](#technology-stack)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation and setup](#installation-and-setup)
- [Environment variables](#environment-variables)
- [MongoDB Atlas setup](#mongodb-atlas-setup)
- [Data model](#data-model)
- [Sample data](#sample-data)
- [Running StockRoom](#running-stockroom)
- [Application workflow](#application-workflow)
- [Roles and permissions](#roles-and-permissions)
- [API reference](#api-reference)
- [Screenshots](#screenshots)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Planned enhancements](#planned-enhancements)
- [Contributing](#contributing)
- [License](#license)

## Overview

Wholesale inventory changes quickly: products arrive in bulk, quantities are dispatched to retailers, and staff need a reliable way to see what is on hand and what needs replenishing. StockRoom keeps a shared product catalog and records each stock-in, stock-out, or adjustment with its previous and resulting quantity.

The database stores product quantity directly on each product. **There is no separate `stock` collection**. Historical changes are stored in `stockmovements`; these entries are used for operational reporting, not for reconstructing historical inventory balances.

### Main workspace pages

| Page | Implemented behavior |
| --- | --- |
| Overview | Current active-product, unit, category, inventory-at-cost, low-stock, and daily movement summaries; recent activity and low-stock products. |
| Products | Search and filter the active product list, sort and paginate it in the browser, create and edit products, and archive products. Quantity changes must use a stock movement. |
| Categories | Search categories, view active product and unit totals, open a category's paginated product detail, and create or delete unused categories. |
| Stock entry | Unified stock workspace with Stock entry, Stock in, and Stock out tabs. The entry view provides stock movement shortcuts, recent totals, and adjustment actions for users with permission. |
| Stock in / Stock out tabs | Within Stock entry; shows active products, current quantities, the latest movement per product, and date-specific transaction totals, and opens a product-prefilled movement form. |
| Movement history | Server-paginated movement history with movement type, product, category, business-date range, and search filters. |
| Daily & monthly reports | Timezone-aware movement counts and quantities, per-hour or per-day charts, top moved products, a current inventory snapshot, and CSV export of the report summary. |
| Team & permissions | Admin-only team management: role and permission assignment, account activation, invitations, resend/revoke, and invitation status history. |

Low stock means `quantity <= lowStockThreshold`. The threshold is a per-product setting.

## Features

- Product catalog with SKU, category, brand, wholesale unit, pack size, pack unit, wholesale price, unit cost, current quantity, and low-stock threshold.
- Category creation, deletion when unused, category summaries, and category-specific product search, status filtering, sorting, and pagination.
- Transactional stock-in, stock-out, and physical-count adjustments. A stock-out cannot reduce quantity below zero, and an adjustment requires a reason.
- Movement notes and optional supplier/dispatch reference, recording creator, timestamp, quantity, and before/after stock.
- Dashboard low-stock indicators and inventory value calculated from current quantity multiplied by unit cost.
- Daily and monthly reports grouped using the configured business timezone. Historical movement totals are kept distinct from current inventory snapshots.
- CSV export of movement-summary and trend data for the selected report period.
- JWT sign-in, invitation-based account setup, administrator/inventory-manager/staff roles, custom non-admin permissions, and account deactivation.
- Local-only invitation-link preview when SMTP is not configured and `CLIENT_ORIGIN` points to localhost. Invitation links are not returned in production.

## Technology stack

| Area | Implementation |
| --- | --- |
| Frontend | React 19, Vite 8, JavaScript, CSS |
| Charts | Chart.js |
| Backend | Node.js, Express 5 |
| Database and ODM | MongoDB, MongoDB Atlas-compatible deployment, Mongoose 8 |
| Authentication | JSON Web Tokens (`jsonwebtoken`), `bcryptjs` password hashing |
| Invitation email | Nodemailer |
| API protections | CORS configuration, JSON request-size limit, Express rate limiting for login and invitations |
| Tests | Node.js built-in test runner (`node --test`) |

## Project structure

```text
.
├── README.md
├── client/
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.js
│   └── src/
│       ├── App.jsx                 # App shell, authentication, navigation, forms
│       ├── AdvancedPages.jsx       # Category detail, stock flows, reports, history, team
│       ├── AdvancedPages.css       # Styles for the added workspaces and charts
│       ├── App.css
│       ├── redesign.css
│       ├── index.css
│       └── main.jsx
└── server/
    ├── .env.example
    ├── package.json
    ├── server.js                   # Express startup, MongoDB connection, route setup
    ├── scripts/
    │   ├── migrateInvitations.js   # One-time, non-destructive invitation-index migration
    │   ├── seedAdmin.js
    │   └── seedGroceryInventory.js
    ├── src/
    │   ├── middleware/
    │   │   ├── auth.js             # JWT verification and active-account check
    │   │   ├── authorization.js    # Roles, permission defaults, access middleware
    │   │   └── rateLimit.js
    │   ├── models/
    │   │   ├── Category.js
    │   │   ├── Invitation.js
    │   │   ├── Product.js
    │   │   ├── StockMovement.js
    │   │   └── User.js
    │   ├── routes/
    │   │   ├── authRoutes.js
    │   │   ├── categoryRoutes.js
    │   │   ├── dashboardRoutes.js
    │   │   ├── movementRoutes.js
    │   │   └── productRoutes.js
    │   └── utils/
    │       ├── asyncHandler.js
    │       └── businessTime.js
    └── test/
        ├── authorization.test.js
        └── businessTime.test.js
```

The Vite development server proxies `/api` to `http://localhost:4000`. The browser stores its JWT in `localStorage` and sends it as a Bearer token to protected API routes.

## Prerequisites

- Node.js **20.19+** or **22.12+** (required by the Vite 8 toolchain).
- npm.
- A MongoDB Atlas database or another MongoDB deployment configured as a replica set. Stock changes and product creation use transactions; standalone MongoDB does not support those transactions.
- An SMTP service only if invitations should be delivered by email. For local development, the API can return a one-time local invitation URL when SMTP is not configured.

## Installation and setup

1. Clone the repository and open two terminals in its root directory.
2. Install the backend and frontend dependencies:

   ```bash
   cd server
   npm install
   ```

   In the second terminal:

   ```bash
   cd client
   npm install
   ```

3. Configure the backend environment:

   ```bash
   cd server
   cp .env.example .env
   ```

   Edit `server/.env` with your own MongoDB URI, a random JWT secret of at least 32 characters, and administrator bootstrap values. **Never commit `server/.env` or put real credentials in this README.**

4. Configure the MongoDB Atlas cluster as described in [MongoDB Atlas setup](#mongodb-atlas-setup).
5. Before running the upgraded application against a database that was used by an earlier StockRoom version, run the invitation migration once:

   ```bash
   cd server
   npm run migrate:invitations
   ```

   The migration retains existing invitation records and upgrades old pending administrator invitations. It removes the former unique-email and TTL-expiration indexes, then creates indexes that support invitation status history and resend/revoke operations. Run this before starting the server with the new invitation schema.
6. Create the first administrator:

   ```bash
   cd server
   npm run seed:admin
   ```

   The script reads `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` from `server/.env`. Passwords must be at least 12 characters. If the account already exists, the command does not change its password. Use `npm run reset:admin` only when an explicit password reset is intended.
7. Optionally load sample grocery categories and products:

   ```bash
   cd server
   npm run seed:grocery
   ```

   This script is additive: existing matching categories and product SKUs are left unchanged. See [Sample data](#sample-data) for its behavior.

There is no client `.env` file required for local development. `VITE_API_URL` is optional; it defaults to `/api`.

## Environment variables

`server/.env.example` is a placeholder template. Replace values locally; do not put real secrets into the example file.

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Yes | MongoDB connection string, including the database name. |
| `JWT_SECRET` | Yes | Signing secret; startup rejects values shorter than 32 characters. |
| `JWT_EXPIRES_IN` | No | JWT lifetime accepted by `jsonwebtoken`; defaults to `12h`. |
| `PORT` | No | API port; defaults to `4000`. |
| `CLIENT_ORIGIN` | No | Comma-separated allowed browser origins; defaults to `http://localhost:5173`. |
| `SMTP_URL` | For email invitations | Nodemailer transport URL. Without it, only local development preview is available. |
| `MAIL_FROM` | For email invitations | Sender address displayed on invitation emails. |
| `ADMIN_NAME` | For `seed:admin` | Initial administrator name. |
| `ADMIN_EMAIL` | For seeding | Initial administrator email; also used by the grocery seed script to find that user. |
| `ADMIN_PASSWORD` | For `seed:admin` | Initial password; at least 12 characters. |
| `BUSINESS_TIMEZONE` | No | IANA timezone for dashboard daily counts and date/month reports; defaults to `Asia/Kolkata`. |
| `INVITATION_LIFETIME_HOURS` | No | Invitation lifetime, 1–720 whole hours; defaults to 24. |

Example placeholders:

```dotenv
MONGODB_URI=mongodb+srv://<db_username>:<db_password>@<cluster-host>/stockroom?retryWrites=true&w=majority
JWT_SECRET=replace-with-a-random-secret-of-at-least-32-characters
JWT_EXPIRES_IN=12h
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
SMTP_URL=smtp://username:password@smtp.example.com:587
MAIL_FROM=StockRoom <no-reply@example.com>
ADMIN_NAME=Workspace Administrator
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=replace-with-a-private-password-of-at-least-12-characters
BUSINESS_TIMEZONE=Asia/Kolkata
INVITATION_LIFETIME_HOURS=24
```

## MongoDB Atlas setup

1. Create an Atlas project and a database cluster.
2. In **Database Access**, create a database user with a strong password. URL-encode reserved characters in the password before placing it in a MongoDB URI.
3. In **Network Access**, allow the development machine's IP address. Avoid allowing access from every IP address for a production database unless a reviewed network policy requires it.
4. Select **Connect → Drivers**, copy the Node.js connection string, and replace the username, password, and database name. Put the completed URI only in `server/.env` as `MONGODB_URI`.
5. Ensure the target deployment supports replica-set transactions. Atlas clusters support them. For self-managed deployments, configure a replica set.
6. Run the invitation migration for databases created by an earlier StockRoom version. Mongoose creates model collections and indexes as the application initializes; manual collection creation is not required.

The model collections are `categories`, `products`, `stockmovements`, `users`, and `invitations`. There is **no `stock` collection**.

## Data model

All listed models use Mongoose timestamps, so they include `createdAt` and `updatedAt` unless noted. MongoDB also supplies each document's `_id` ObjectId.

### `categories`

| Field | Type | Behavior |
| --- | --- | --- |
| `name` | String | Required, trimmed, maximum 60 characters; unique case-insensitively. |
| `description` | String | Optional, trimmed, maximum 240 characters; defaults to empty text. |

### `products`

| Field | Type | Behavior |
| --- | --- | --- |
| `name` | String | Required, trimmed, maximum 120 characters. |
| `sku` | String | Required, trimmed, uppercased, maximum 40 characters, unique. |
| `description` | String | Optional, maximum 500 characters; defaults to empty text. |
| `brand` | String | Optional, maximum 80 characters; defaults to empty text. |
| `unit` | String | Wholesale stock-count unit (for example bag or carton), maximum 40 characters. |
| `packSize` | Number or `null` | Optional, non-negative; a provided value must be greater than zero. |
| `packUnit` | String | Optional pack measurement unit, maximum 40 characters. |
| `category` | ObjectId reference to `categories` or `null` | Optional. |
| `quantity` | Number | Current non-negative on-hand quantity; stock movement input requires whole units. |
| `unitPrice` | Number | Required, non-negative catalog price. |
| `unitCost` | Number | Required, non-negative unit cost used for inventory-value summaries. |
| `lowStockThreshold` | Number | Non-negative, defaults to `5`. |
| `isArchived` | Boolean | Defaults to `false`; archived products are excluded from active inventory. |

The model also defines a text index over `name` and `sku`; current UI search is handled by frontend filtering except for category detail search.

### `stockmovements`

| Field | Type | Behavior |
| --- | --- | --- |
| `product` | ObjectId reference to `products` | Required. Historical records remain when a product is archived. |
| `type` | String | Required enum: `in`, `out`, or `adjustment`. |
| `quantity` | Number | Non-negative movement quantity. For adjustments this is the absolute difference, not the target count. |
| `previousStock` | Number | Required non-negative quantity before the change. |
| `newStock` | Number | Required non-negative quantity after the change. |
| `note` | String | Optional, maximum 240 characters. Adjustment entries require a reason. |
| `reference` | String | Optional supplier or dispatch reference, maximum 120 characters. |
| `createdBy` | ObjectId reference to `users` | Required movement author. |
| `createdAt` | Date | Movement timestamp; indexed newest-first. |

### `users`

| Field | Type | Behavior |
| --- | --- | --- |
| `name` | String | Required, trimmed, maximum 80 characters. |
| `email` | String | Required, unique, lowercased, and trimmed. |
| `passwordHash` | String | Required bcrypt hash; excluded from ordinary query results. |
| `role` | String | `admin`, `inventory_manager`, or `staff`; new bootstrap users default to `admin`. |
| `permissions` | Array of strings | Optional explicit non-admin permission grants. When absent, the user's role defaults are used. Admins always receive all permissions. |
| `isActive` | Boolean | Defaults to `true`; inactive accounts are denied by login and protected API requests. |
| `invitedBy` | ObjectId reference to `users` or `null` | User who created the invitation. |
| `lastLoginAt` | Date or `null` | Updated at successful password login. |

### `invitations`

| Field | Type | Behavior |
| --- | --- | --- |
| `name`, `email` | String | Invitee identity; email is lowercased and trimmed. |
| `tokenHash` | String | Unique SHA-256 hash; the raw invitation token is not stored. |
| `role` | String | Role granted at acceptance: admin, inventory manager, or staff. |
| `permissions` | Array of strings | Permission grants applied to the new account. |
| `status` | String | `pending`, `accepted`, `revoked`, or `expired`. |
| `message` | String | Optional invitation note, maximum 240 characters. |
| `expiresAt` | Date | Required invitation expiry. Expired invitation records are retained for status history. |
| `acceptedAt`, `revokedAt` | Date or `null` | Lifecycle timestamps. |
| `createdBy` | ObjectId reference to `users` | Administrator who invited the user. |

### Relationships

- A product optionally references one category; a category can have many products.
- A stock movement references one product and the user who recorded it.
- An invitation references the inviter. On acceptance, the new user also stores that inviter in `invitedBy`.
- Product quantity is the current balance. The application does not maintain a separately queryable historical balance per date.

## Sample data

The supported grocery seed command is:

```bash
cd server
npm run seed:grocery
```

It requires `MONGODB_URI` and `ADMIN_EMAIL`, and it requires that the administrator already exists. The script adds categories such as **Grains & Flours**, **Pulses & Lentils**, **Edible Oils & Ghee**, **Spices & Masalas**, **Daily Essentials**, and **Snacks & Packaged Food**, plus sample products such as Basmati Rice, Wheat Flour, Toor Dal, Sunflower Oil, Sugar, and Biscuits.

This is an additive seed, not a reset: existing matching category names and SKUs are skipped, and existing product details/quantities are not overwritten. The seed records opening movements for a selected subset of seeded SKUs only when the product quantity still equals the seed quantity; it avoids duplicating a matching opening note. Review the script before using sample data in a production database.

## Running StockRoom

Start the backend in one terminal:

```bash
cd server
npm run dev
```

The API listens at `http://localhost:4000` by default.

Start the frontend in a second terminal:

```bash
cd client
npm run dev
```

Open the Vite URL printed by the command (normally `http://localhost:5173`) and sign in with the bootstrap administrator credentials. The Vite proxy forwards `/api` requests to port 4000.

Other available commands:

| Directory | Command | Purpose |
| --- | --- | --- |
| `server` | `npm start` | Start the API without Node watch mode. |
| `server` | `npm run seed:admin` | Create the configured bootstrap admin if it does not exist. |
| `server` | `npm run reset:admin` | Reset the configured admin password. |
| `server` | `npm run seed:grocery` | Add the sample grocery data described above. |
| `server` | `npm run migrate:invitations` | Apply the one-time invitation-index and record migration. |
| `server` | `npm test` | Run backend unit tests with Node's test runner. |
| `client` | `npm run lint` | Run ESLint. |
| `client` | `npm run build` | Create the production frontend build in `client/dist`. |
| `client` | `npm run preview` | Preview the built frontend locally. |

## Application workflow

1. **Create categories and products.** A product can be assigned to a category and stores pack, pricing, and low-stock information. Product creation may include an opening quantity; if positive, that quantity and its initial stock-in movement are committed together.
2. **Record incoming stock.** Choose an active product, enter a positive whole quantity, and optionally add a supplier/delivery reference and note. StockRoom increments the product balance and creates a movement record in the same transaction.
3. **Record outgoing stock.** Enter a positive whole quantity and optional dispatch reference. The transaction is rejected if it would make the product quantity negative.
4. **Adjust a stocktake count.** Enter the new on-hand total, not the difference, and provide a reason. StockRoom stores the absolute difference as movement `quantity` and stores the before/after values.
5. **Review and replenish.** Products at or below their configured threshold appear in low-stock summaries. Movement history can be searched and filtered. Daily/monthly reports summarize movements by business-timezone date; current low-stock and category data are current snapshots, not historical ones.
6. **Manage access.** Admins invite users with a role and optional individual grants. Invitation tokens expire after the configured lifetime, are hashed in the database, and can be resent or revoked. Deactivation prevents login and is checked again on every protected API request.

MongoDB transactions require a replica-set-capable deployment, such as MongoDB Atlas.

## Roles and permissions

All permission checks are enforced by the API; hiding a navigation item is not the security boundary.

| Role | Default access |
| --- | --- |
| `admin` | All permissions, including team administration. Admin grants cannot be narrowed by a custom permission list. |
| `inventory_manager` | Inventory/dashboard viewing, product and category management, movement view/in/out/adjustment, and reports. |
| `staff` | Inventory/dashboard viewing and movement history. Other capabilities must be granted by an administrator. |

The UI permits assigning non-admin grants for inventory/dashboard viewing, product/category management, movement viewing/in/out/adjustment, and reports. A product/category-management grant implies inventory viewing; a stock-write grant implies inventory and movement viewing so the operator can select products and review the result. `team.read` and `team.manage` are deliberately not assignable as custom grants; team administration remains admin-only.

## API reference

The API is mounted under `/api`. All endpoints except `GET /api/health`, `POST /api/auth/login`, and `POST /api/auth/invitations/accept` require:

```http
Authorization: Bearer <JWT>
Content-Type: application/json
```

Protected endpoints also require the corresponding user permission. JSON errors use `{ "message": "..." }`. Object IDs below are MongoDB ObjectId strings.

### Health and authentication

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /api/health` | Public | Returns `{ "status": "ok" }`. |
| `POST /api/auth/login` | Public, rate-limited | Sign in with email and password; returns `{ token, user }`. |
| `GET /api/auth/me` | Signed-in user | Return the current user and effective permissions. |
| `GET /api/auth/admins` | `team.manage` | Legacy endpoint; returns all team accounts in an `admins` array. |
| `GET /api/auth/team` | `team.manage` | Return `{ users, invitations }` with user/invitation lifecycle details. |
| `POST /api/auth/invitations` | `team.manage`, rate-limited | Create an invitation. Returns invitation metadata; returns `invitationUrl` only for allowed local development preview. |
| `POST /api/auth/invitations/:id/resend` | `team.manage`, rate-limited | Revoke the previous pending token and create a new invitation record with a fresh token. |
| `DELETE /api/auth/invitations/:id` | `team.manage` | Revoke a pending invitation. |
| `PATCH /api/auth/team/:id` | `team.manage` | Update a user's role, permissions, or active status. |
| `POST /api/auth/invitations/accept` | Public, rate-limited | Accept a valid invitation and set a password of at least 12 characters. |

Login request:

```json
{ "email": "admin@example.com", "password": "a-private-password" }
```

Invitation request:

```json
{
  "name": "Warehouse colleague",
  "email": "colleague@example.com",
  "role": "staff",
  "permissions": ["inventory.read", "dashboard.read", "movements.read"],
  "message": "Welcome to the inventory team."
}
```

Allowed invitation roles are `admin`, `inventory_manager`, and `staff`. Omit `permissions` to use that role's defaults. `admin` invitations always receive all administrator permissions.

Invitation acceptance:

```json
{ "token": "<token-from-invitation-link>", "password": "at-least-12-characters" }
```

Team update example:

```json
{ "role": "inventory_manager" }
```

Other accepted fields include `permissions` (an array of assignable permission strings) and `isActive` (boolean). The API prevents an admin from deactivating/demoting their own account or removing the last active administrator.

### Products

| Method and path | Permission | Purpose |
| --- | --- | --- |
| `GET /api/products` | `inventory.read` | Return active products, sorted by most recently updated and populated with category name. `?includeArchived=true` returns archived products instead. |
| `POST /api/products` | `products.manage` | Create a product; positive opening quantity creates an initial stock-in movement in the same transaction. |
| `PATCH /api/products/:id` | `products.manage` | Update product details. A `quantity` property is rejected; use a movement instead. |
| `PATCH /api/products/:id/archive` | `products.manage` | Archive an active product without deleting its movement history. |

Create request example:

```json
{
  "name": "Basmati Rice",
  "sku": "GRA001",
  "category": "<category-object-id>",
  "brand": "Example brand",
  "unit": "bag",
  "packSize": 25,
  "packUnit": "kg",
  "unitPrice": 1650,
  "unitCost": 1500,
  "quantity": 100,
  "lowStockThreshold": 10,
  "description": "25 kg wholesale bag"
}
```

Successful create returns `{ "product": { ... } }`; list returns `{ "products": [...] }`.

### Categories

| Method and path | Permission | Purpose |
| --- | --- | --- |
| `GET /api/categories` | `inventory.read` | Return categories with active product/unit/value/low-stock summaries. |
| `GET /api/categories/:id/products` | `inventory.read` | Category detail with active products, latest movement, summary, and server pagination. |
| `POST /api/categories` | `categories.manage` | Create a category from `name` and optional `description`. |
| `DELETE /api/categories/:id` | `categories.manage` | Delete only when no products reference the category. |

Category product filters: `page`, `limit` (maximum 100), `search` (name or SKU), `status` (`all`, `low`, `in-stock`, `out-of-stock`), and `sort` (`name-asc`, `name-desc`, `quantity-asc`, `quantity-desc`, `last-movement-desc`). The response contains `{ category, summary, products, pagination }`.

### Stock movements

| Method and path | Permission | Purpose |
| --- | --- | --- |
| `GET /api/movements` | `movements.read` | Return paginated movement records (default 50 per page; maximum 200), populated with product, category, and creator. |
| `GET /api/movements/summary` | `movements.read` | Return period/filter-specific transaction and quantity totals plus affected products. |
| `GET /api/movements/latest-by-product` | `movements.read` | Return the latest historical movement for each active product. |
| `POST /api/movements` | Type-specific | Create a transactionally applied stock-in, stock-out, or adjustment. |

List and summary filters support `type` (`in`, `out`, `adjustment`), `product`, `category`, `from`, and `to`. Dates use `YYYY-MM-DD` in `BUSINESS_TIMEZONE`. List additionally accepts `page`, `limit`, `search`, and `sort=oldest` (newest is the default).

Movement request examples:

```json
{
  "type": "in",
  "product": "<product-object-id>",
  "quantity": 24,
  "reference": "SUPPLIER-INV-1042",
  "note": "Weekly restock"
}
```

```json
{
  "type": "adjustment",
  "product": "<product-object-id>",
  "quantity": 118,
  "note": "Physical stock count"
}
```

Successful creation returns `{ "movement": { ... } }`. Adjustment input `quantity` means the new total stock; the stored movement's `quantity` is the absolute difference.

### Dashboard and reports

| Method and path | Permission | Purpose |
| --- | --- | --- |
| `GET /api/dashboard` | `dashboard.read` | Current inventory snapshot, low-stock items, category breakdown, and movement count for today in the business timezone. |
| `GET /api/dashboard/daily?date=YYYY-MM-DD` | `reports.read` | Daily movement report; defaults to the current business date. Includes hourly activity buckets. |
| `GET /api/dashboard/monthly?month=1&year=2026` | `reports.read` | Monthly report; defaults to the current business month. Includes daily activity buckets. |

Daily/monthly report responses include `{ period, timeZone, summary, byType, trend, topProducts, inventory, recentMovements, movementCount, note }`. `summary` contains movement transaction count, movement units, and distinct affected products. `inventory` is a **current** snapshot and must not be interpreted as a historical balance. Movement units are not sales units or revenue.

## Screenshots

Screenshots are not currently checked into the repository. Capture and add images here when available:

| Screen | Screenshot |
| --- | --- |
| Dashboard | `![StockRoom dashboard](docs/screenshots/dashboard.png)` |
| Product management | `![StockRoom product management](docs/screenshots/products.png)` |
| Category management | `![StockRoom category management](docs/screenshots/categories.png)` |
| Stock management | `![StockRoom stock management](docs/screenshots/stock-management.png)` |

Until those files are added, the Markdown image references above are placeholders and will not render an image on GitHub.

## Troubleshooting

| Symptom | Resolution |
| --- | --- |
| API exits with missing `MONGODB_URI` or `JWT_SECRET` | Copy `server/.env.example` to `server/.env` and fill in the local values. Ensure the JWT secret has at least 32 characters. |
| `Could not connect to MongoDB` / server selection timeout | Check the URI, database-user credentials, URL-encoding of reserved password characters, Atlas IP allowlist, DNS/network access, and cluster status. |
| Transaction or replica-set error while adding stock | The deployment does not support transactions. Use Atlas or configure MongoDB as a replica set. |
| Invitation migration index conflict | Stop the API, confirm the configured URI points to the intended database, run `npm run migrate:invitations`, then start the upgraded server. The script only changes invitation indexes and fills lifecycle fields; it does not delete invitation documents. |
| Invitations cannot be emailed | Configure a valid `SMTP_URL` and `MAIL_FROM`. Local preview requires non-production mode and a localhost `CLIENT_ORIGIN`; production deliberately never returns a raw invitation token in the API response. |
| Browser reports CORS or failed `/api` requests | Run the client at the configured `CLIENT_ORIGIN`, check `CLIENT_ORIGIN` on the server, and ensure the API is listening on port 4000. If using a different API host, set the client `VITE_API_URL`. |
| `npm install` or Vite reports an unsupported Node version | Use Node.js 20.19+ or 22.12+ and reinstall the package dependencies. |
| Login succeeds but a protected request returns 403 | The signed-in account may be inactive or lack the required permission. Ask an active administrator to check the role and grants. |
| Duplicate SKU, email, or category name | Each product SKU and user email must be unique; category names are unique without regard to letter case. |
| Low-stock count seems higher than expected | A product is low when its quantity is less than **or equal to** its configured threshold. |
| Client lint/build fails after dependency changes | From `client`, run `npm install`, then `npm run lint` and `npm run build`; use the first reported file/line to diagnose. |

## Security

- Keep `server/.env` private and excluded from version control. Use distinct, strong MongoDB credentials and a random JWT secret; rotate credentials if they are exposed.
- Passwords are bcrypt-hashed with a cost factor of 12. Invitation acceptance requires a password of at least 12 characters. There is no password-reset flow currently.
- Invitation tokens are generated with cryptographic randomness, stored only as SHA-256 hashes, expire, and can be revoked. A raw invitation URL is returned only for non-production localhost development when SMTP is not configured.
- JWTs are verified on every protected API request. The API reloads the user on each request and blocks inactive accounts, so role changes and deactivation apply without waiting for a new token.
- The browser stores the JWT in `localStorage`; protect the frontend against cross-site scripting and consider an `HttpOnly`, `Secure`, `SameSite` cookie-based session design before deploying to a sensitive production environment.
- API route handlers validate IDs, numeric quantities, date formats, role assignments, permission grants, and text lengths. Access is checked on the server, not just hidden in the UI.
- Login and invitation endpoints are rate-limited. Requests are limited to 20 KB JSON. CORS origins are configured with `CLIENT_ORIGIN`.
- Restrict Atlas network access, use TLS in deployed environments, and serve the frontend/API over HTTPS. Production deployment should set `NODE_ENV=production`, configure SMTP, and keep logs free of credentials and invitation tokens.
- The application has no separate audit log for team permission changes; movement records are retained for normal stock operations.

## Planned enhancements

The following are **not implemented** and are possible future work:

- Barcode scanning and barcode-based product lookup.
- Expiry-date and batch/lot tracking.
- Supplier records, purchase orders, and receiving workflows.
- Retailer records and retailer orders.
- Invoice generation and export.
- Sales, revenue, margin, and accounting reports.
- Multi-warehouse support and stock transfers.
- Password reset and stronger optional MFA.

## Contributing

1. Fork the repository and create a focused feature branch.
2. Keep changes scoped to the requested feature and preserve the existing React/Express/MongoDB architecture.
3. Do not include real credentials or production data.
4. Run checks from the affected package:

   ```bash
   cd server && npm test
   cd ../client && npm run lint && npm run build
   ```

5. Include a clear description of the behavior change and any database migration or configuration requirement in your pull request.

## License

No license file or license declaration is currently present in the repository. The project license is **not yet specified**.
