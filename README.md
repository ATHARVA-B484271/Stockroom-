# Grocery Wholesale Inventory Management System

A web-based inventory workspace for grocery wholesalers supplying products in bulk to retail shops. The system keeps a catalog of products and categories, tracks current quantities and stock changes, highlights products at or below their restock threshold, and provides an overview of inventory value and recent activity.

The application is branded **Stockroom** in its user interface. It consists of a React/Vite frontend and an Express API backed by MongoDB through Mongoose.

## Table of Contents

- [Project Overview](#project-overview)
- [Application Architecture and Screens](#application-architecture-and-screens)
- [Key Features](#key-features)
- [Current Scope and Limitations](#current-scope-and-limitations)
- [Technology Stack](#technology-stack)
- [Project Folder Structure](#project-folder-structure)
- [Prerequisites](#prerequisites)
- [Installation and Setup](#installation-and-setup)
- [Environment Variables](#environment-variables)
- [MongoDB Atlas Configuration](#mongodb-atlas-configuration)
- [Database Schema](#database-schema)
- [Database Seeding](#database-seeding)
- [Running the Application](#running-the-application)
- [Application Workflow](#application-workflow)
- [API Documentation](#api-documentation)
- [Screenshots](#screenshots)
- [Error Handling and Troubleshooting](#error-handling-and-troubleshooting)
- [Security Considerations](#security-considerations)
- [Future Enhancements](#future-enhancements)
- [Contributing](#contributing)
- [License](#license)

## Project Overview

Wholesale teams often need to keep product details, bulk pack sizes, on-hand quantities, and stock changes consistent while serving multiple retail customers. This application brings those inventory tasks into one authenticated workspace. It stores inventory in MongoDB, records stock movements with before-and-after quantities, and summarizes the active catalog and low-stock items.

> **Data model note:** The application does not have a separate `stock` collection. Current on-hand quantity and low-stock threshold are fields on each product. Stock changes are recorded in the `stockmovements` collection.

The system is designed around inventory control, not retail checkout: it has no retailer order, point-of-sale, supplier purchasing, invoice, or sales-report workflow. The `unitPrice` field is catalog pricing information; the application does not use it to record sales.

## Application Architecture and Screens

```text
React browser app (Vite, development default :5173)
        │  JSON over /api; Bearer JWT on protected requests
        ▼
Express API (development default :4000)
        │  Mongoose models and queries
        ▼
MongoDB database (stockroom by default)
```

- **Frontend:** `client/src/App.jsx` contains the single-page workspace, page components, forms, API helper, client-side search/filter behavior, and login/invitation screens. `client/src/main.jsx` mounts the React application. Vite's development server proxies `/api` to the Express server.
- **API:** `server/server.js` validates required configuration, configures JSON parsing, CORS and error handling, mounts the routes, connects to MongoDB, and starts listening only after the database connection succeeds.
- **Persistence:** Mongoose models define categories, products, movements, users, and invitations. MongoDB is the source of truth; the application does not have a local sample-data fallback.
- **Authentication:** after login the browser holds the JWT in `localStorage`; protected API calls send it as a Bearer token. Every API request reloads its inventory data from the API rather than using a separate frontend database.

### Workspace pages

| Page | What it shows or does |
| --- | --- |
| Overview | Active product count, total on-hand quantity, inventory value at cost, low-stock count, products needing restock, recent activity, and a shortcut to record stock. |
| Products | Active product catalog with search by name/SKU/category, category or low-stock filtering, add/edit actions, and archive action. |
| Categories | Category list, number of active products assigned to each category, category creation, and deletion when unused. |
| Stock entry | Shortcuts for incoming, outgoing, and adjustment movements; a view of today's activity based on the recent movements loaded in the browser. |
| Movement history | Search and type-filter the movements currently loaded by the client (the latest 50 by default). |
| Team | Administrator list and invitation form. Invitation delivery requires server SMTP configuration. |

Low-stock status is displayed in the product list, overview and navigation badge. The notification icon is a navigation shortcut to products, not a push-notification or alert-delivery system.

Some login-page artwork and workspace-card text (including the displayed workspace name and plan) is static presentation content, not data read from a configurable workspace or subscription model.

## Key Features

- Administrator sign-in and invitation-based onboarding for additional administrators.
- Product creation, editing, and archiving, including SKU, category, brand, pack size, cost, price, on-hand quantity, and restock threshold.
- Category creation and deletion; categories with products cannot be deleted.
- Stock-in, stock-out, and quantity-adjustment entries, with movement history recording the affected product, before-and-after quantities, note, and administrator.
- Low-stock identification when a product's quantity is less than or equal to its threshold.
- Product search by name, SKU, or category name, plus category and low-stock filters in the frontend.
- Dashboard metrics for active products, total units, inventory value at unit cost, low-stock count, and today's movement count.
- Recent activity, movement history, and an administrator team list.

Search and filtering are performed in the frontend against the products or movements it has loaded; the products API does not implement search or pagination. The history and stock-page views are based on the latest 50 movements loaded by the client. The dashboard's `todayMovementCount`, by contrast, is counted server-side across movements created since local server midnight.

## Current Scope and Limitations

- The application manages a single shared inventory database. It does not implement multiple companies, warehouses, locations, or user-defined workspaces.
- Every account role is `admin`; there are no staff, read-only, or per-feature permissions.
- There is no retailer order entry, sales checkout, supplier/purchase-order management, invoicing, or sales analytics.
- Stock quantity is integer-based at movement entry. The API does not support fractional movement quantities.
- The product edit endpoint accepts a `quantity` field, but editing quantity there does not create a corresponding movement. Use the stock-entry screen and `POST /movements` when the change should be auditable.
- A stock movement updates the product document and then creates its history document. These writes are not wrapped in a MongoDB transaction.
- There is no movement-history pagination. The frontend loads the latest 50 entries, and the API allows a maximum of 200 per request.
- Product prices/costs are stored as numbers with no currency field. The frontend currently formats displayed prices in INR.
- There is no automated test script configured in either package.

## Technology Stack

| Area | Technologies |
| --- | --- |
| Frontend | React 19, JavaScript ES modules, Vite 8 |
| Backend | Node.js, Express 5 |
| Database / ODM | MongoDB (Atlas-supported), Mongoose 8 |
| Authentication | JSON Web Tokens (`jsonwebtoken`), `bcryptjs` password hashing |
| Other backend libraries | `cors`, `dotenv`, `express-rate-limit`, `nodemailer` |
| Frontend tooling | ESLint, React Hooks and React Refresh ESLint plugins |

The frontend uses native `fetch` for API requests; no frontend component library or client-side router is configured in the package manifest.

## Project Folder Structure

```text
.
├── README.md
├── client/
│   ├── index.html
│   ├── .gitignore
│   ├── package.json
│   ├── package-lock.json
│   ├── vite.config.js
│   ├── eslint.config.js
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   └── src/
│       ├── App.jsx                 # Screens, forms, API calls, and client-side filtering
│       ├── App.css                 # Application layout and component styles
│       ├── index.css               # Global styles
│       ├── main.jsx                # React entry point
│       └── assets/                 # Image and starter assets
└── server/
    ├── .env.example                # Safe configuration template
    ├── .gitignore
    ├── README.md                   # Existing server-specific setup notes
    ├── package.json
    ├── package-lock.json
    ├── server.js                   # Express setup, middleware, API mounting, DB connection
    ├── scripts/
    │   ├── seedAdmin.js            # Create or reset the first administrator
    │   └── seedGroceryInventory.js # Import sample categories, products, and movements
    └── src/
        ├── middleware/
        │   ├── auth.js             # Bearer-token authentication
        │   └── rateLimit.js        # Login and invitation rate limits
        ├── models/
        │   ├── Category.js
        │   ├── Invitation.js
        │   ├── Product.js
        │   ├── StockMovement.js
        │   └── User.js
        ├── routes/
        │   ├── authRoutes.js
        │   ├── categoryRoutes.js
        │   ├── dashboardRoutes.js
        │   ├── movementRoutes.js
        │   └── productRoutes.js
        └── utils/
            └── asyncHandler.js
```

Each application has its own `package.json` and lockfile. Run npm commands from the project root using `--prefix server` or `--prefix client`, or change into the corresponding directory first.

## Prerequisites

- Node.js **20.19 or later in the 20.x line**, **22.13 or later in the 22.x line**, or **24 or later**. This satisfies the current frontend toolchain's Node.js engine requirements.
- npm, included with Node.js.
- A MongoDB Atlas cluster, or a compatible MongoDB server reachable from the API.
- A modern browser.
- An SMTP provider only if administrator email invitations are needed.

## Installation and Setup

Run the following from the project root:

1. Create a MongoDB Atlas cluster and database user, and configure network access as described in [MongoDB Atlas Configuration](#mongodb-atlas-configuration).
2. Copy the existing server environment template:

   ```sh
   cp server/.env.example server/.env
   ```

3. Edit `server/.env`. Replace the MongoDB URI placeholders and set a private administrator password and a random JWT secret. See [Environment Variables](#environment-variables) for requirements. Keep this file private.
4. Install dependencies for both independent npm projects:

   ```sh
   npm --prefix server ci
   npm --prefix client ci
   ```

5. Create the first administrator account:

   ```sh
   npm --prefix server run seed:admin
   ```

6. Optionally import the sample grocery categories and products:

   ```sh
   npm --prefix server run seed:grocery
   ```

   Run this after creating the administrator because the seed script attributes opening stock movements to that user.

7. Start the frontend and backend as described in [Running the Application](#running-the-application), then sign in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` configured in `server/.env`.

## Environment Variables

The existing, non-secret template is [`server/.env.example`](server/.env.example). Copy it to `server/.env`; do not put server secrets in a `VITE_` variable, because frontend-prefixed variables are made available to browser code.

| Variable | Required? | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | Yes, for the API and seed scripts | MongoDB connection URI. The supplied template selects the `stockroom` database. |
| `JWT_SECRET` | Yes, for the API | Secret used to sign and verify tokens; the server requires at least 32 characters. |
| `JWT_EXPIRES_IN` | No | JWT lifetime accepted by `jsonwebtoken`; defaults to `12h`. |
| `PORT` | No | API port; defaults to `4000`. |
| `CLIENT_ORIGIN` | No | Comma-separated allowed browser origins for CORS; defaults to `http://localhost:5173`. |
| `ADMIN_NAME` | Required by `seed:admin` | Name for the initial administrator. |
| `ADMIN_EMAIL` | Required by `seed:admin` and `seed:grocery` | Email for the initial administrator and the user credited with imported movements. |
| `ADMIN_PASSWORD` | Required by `seed:admin` | Initial administrator password; must be at least 12 characters. |
| `SMTP_URL` | Optional; required for invitations | SMTP connection URL used by Nodemailer. |
| `MAIL_FROM` | Optional; required for invitations | Verified sender address used for invitation email. |
| `VITE_API_URL` | Optional; frontend only | API base URL, configured in `client/.env.local` if the API is not reachable through Vite's `/api` proxy. Defaults to `/api`. |

The API requires `MONGODB_URI` and `JWT_SECRET` at startup. The seed scripts require their own variables as noted above. Administrator invitation email is unavailable unless both SMTP settings are configured. Invitation links expire after 24 hours.

For a separately hosted API, set `VITE_API_URL` in `client/.env.local` to the API base URL (for example, `https://api.example.com/api`) and set `CLIENT_ORIGIN` on the server to the frontend's origin. Do not include secrets in `client/.env.local`.

## MongoDB Atlas Configuration

1. Create or select an Atlas project and cluster.
2. Create a **database user** with access limited to the application's database. Do not use an Atlas account password as the database credential.
3. Under **Network Access**, allow connections from the machine or hosting environment running the API. Avoid allowing access from all IP addresses except where strictly required for a temporary development setup.
4. In the cluster's **Connect** dialog, select the Node.js driver and copy its connection URI.
5. Put the URI in `MONGODB_URI` in `server/.env`. Keep the database path set to `stockroom`, replace the URI placeholders with the database username, password, and cluster host, and URL-encode reserved characters in the password.
6. Start the API or run a seed script. Mongoose connects using the configured URI. MongoDB creates the collections and indexes as records are written; there is no collection-creation command in this project.

The Mongoose models map to these collection names: `categories`, `products`, `stockmovements`, `users`, and `invitations`. The application does **not** define a separate `stock` collection.

## Database Schema

All schemas use Mongoose timestamps (`createdAt` and `updatedAt`). MongoDB document identifiers are ObjectIds. Fields marked as defaulted may be omitted when creating a document.

### `categories`

| Field | Type | Rules / default |
| --- | --- | --- |
| `name` | String | Required, trimmed, maximum 60 characters; unique case-insensitively. |
| `description` | String | Optional, trimmed, maximum 240 characters; defaults to `""`. |
| `createdAt`, `updatedAt` | Date | Added by Mongoose timestamps. |

### `products`

| Field | Type | Rules / default |
| --- | --- | --- |
| `name` | String | Required, trimmed, maximum 120 characters. |
| `sku` | String | Required, trimmed, uppercased, maximum 40 characters, unique. |
| `description` | String | Optional, trimmed, maximum 500 characters; defaults to `""`. |
| `brand` | String | Optional, trimmed, maximum 80 characters; defaults to `""`. |
| `unit` | String | Optional, trimmed, maximum 40 characters; defaults to `""`. |
| `packSize` | Number or null | Non-negative in the schema; defaults to `null`. Product creation/update routes reject a supplied value of zero. |
| `packUnit` | String | Optional, trimmed, maximum 40 characters; defaults to `""`. |
| `category` | ObjectId reference to `Category` or null | Optional; defaults to `null`. |
| `quantity` | Number | Non-negative; defaults to `0`. Product creation requires a whole-number starting quantity. This is the current on-hand stock. |
| `unitPrice` | Number | Required and non-negative. |
| `unitCost` | Number | Required and non-negative. |
| `lowStockThreshold` | Number | Non-negative; defaults to `5`. |
| `isArchived` | Boolean | Defaults to `false`. |
| `createdAt`, `updatedAt` | Date | Added by Mongoose timestamps. |

The schema defines a text index on product `name` and `sku`; the current API does not expose a database text-search endpoint.

### `stockmovements`

| Field | Type | Rules / default |
| --- | --- | --- |
| `product` | ObjectId reference to `Product` | Required. |
| `type` | String | Required; one of `in`, `out`, or `adjustment`. |
| `quantity` | Number | Required, non-negative. For adjustments the stored value is the absolute difference from the previous quantity. |
| `previousStock` | Number | Required, non-negative quantity before the movement. |
| `newStock` | Number | Required, non-negative quantity after the movement. |
| `note` | String | Optional, trimmed, maximum 240 characters; defaults to `""`. |
| `createdBy` | ObjectId reference to `User` | Required. |
| `createdAt`, `updatedAt` | Date | Added by Mongoose timestamps. |

The model has a descending `createdAt` index for recent movement queries.

### `users`

| Field | Type | Rules / default |
| --- | --- | --- |
| `name` | String | Required, trimmed, maximum 80 characters. |
| `email` | String | Required, trimmed, lowercased, unique. |
| `passwordHash` | String | Required bcrypt hash; excluded from normal query results. |
| `role` | String | Restricted to `admin`; defaults to `admin`. |
| `createdAt`, `updatedAt` | Date | Added by Mongoose timestamps. |

### `invitations`

| Field | Type | Rules / default |
| --- | --- | --- |
| `name` | String | Required, trimmed, maximum 80 characters. |
| `email` | String | Required, trimmed, lowercased, unique. |
| `tokenHash` | String | Required, unique SHA-256 hash of the invitation token. |
| `expiresAt` | Date | Required; indexed for TTL cleanup. Invitations expire after 24 hours. |
| `createdBy` | ObjectId reference to `User` | Required. |
| `createdAt`, `updatedAt` | Date | Added by Mongoose timestamps. |

### Relationships and inventory representation

- A product optionally references one category; the category API prevents deleting categories that are still assigned to products.
- A stock movement references one product and the administrator who recorded it.
- An invitation references the administrator who sent it.
- On-hand stock is `products.quantity`; movement documents preserve the change history. There is no `stocks` or `stock` model.
- Category names are unique case-insensitively. Product SKUs, user emails, and invitation emails have unique indexes.
- Product names and SKUs share a MongoDB text index. The current routes do not run text-index queries.
- Mongoose's default model-to-collection pluralization yields the lowercase collection names documented above.

### Example document shapes

These examples illustrate the model fields; ObjectIds and timestamps are generated by MongoDB/Mongoose. Passwords and invitation tokens are never stored in these forms.

```json
{
  "_id": "<category-object-id>",
  "name": "Grains & Flours",
  "description": "",
  "createdAt": "<date>",
  "updatedAt": "<date>"
}
```

```json
{
  "_id": "<product-object-id>",
  "name": "Basmati Rice",
  "sku": "GRA001",
  "description": "",
  "brand": "Generic",
  "unit": "bag",
  "packSize": 25,
  "packUnit": "kg",
  "category": "<category-object-id>",
  "quantity": 100,
  "unitPrice": 1650,
  "unitCost": 1500,
  "lowStockThreshold": 10,
  "isArchived": false,
  "createdAt": "<date>",
  "updatedAt": "<date>"
}
```

```json
{
  "_id": "<movement-object-id>",
  "product": "<product-object-id>",
  "type": "in",
  "quantity": 100,
  "previousStock": 0,
  "newStock": 100,
  "note": "Initial inventory",
  "createdBy": "<user-object-id>",
  "createdAt": "<date>",
  "updatedAt": "<date>"
}
```

## Database Seeding

The server package provides two scripts:

```sh
npm --prefix server run seed:admin
npm --prefix server run seed:grocery
```

- `seed:admin` reads `MONGODB_URI`, `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` from `server/.env`. It creates the initial administrator and hashes the password with bcrypt. It will not silently change an existing administrator's password.
- To intentionally change that administrator's password, update `ADMIN_PASSWORD` in `server/.env` and run:

  ```sh
  npm --prefix server run reset:admin
  ```

- `seed:grocery` reads `MONGODB_URI` and `ADMIN_EMAIL`. It adds the following categories when they do not already exist (name comparison is case-insensitive):

  `Grains & Flours`, `Pulses & Lentils`, `Edible Oils & Ghee`, `Spices & Masalas`, `Daily Essentials`, `Snacks & Packaged Food`, `Dairy Products`, and `Household & Personal Care`.

  It adds the following sample products when their SKUs do not already exist. All are assigned brand `Generic`; amounts are sample currency values because no currency setting is configured in the application.

  | SKU | Product | Category | Pack | Cost | Price | Opening quantity | Low-stock threshold |
  | --- | --- | --- | --- | ---: | ---: | ---: | ---: |
  | `GRA001` | Basmati Rice | Grains & Flours | 25 kg bag | 1500 | 1650 | 100 | 10 |
  | `GRA002` | Wheat Flour | Grains & Flours | 50 kg bag | 1600 | 1750 | 80 | 10 |
  | `PUL001` | Toor Dal | Pulses & Lentils | 30 kg bag | 3600 | 3900 | 50 | 5 |
  | `PUL002` | Moong Dal | Pulses & Lentils | 30 kg bag | 3000 | 3300 | 40 | 5 |
  | `OIL001` | Sunflower Oil | Edible Oils & Ghee | 15 litre tin | 1950 | 2100 | 40 | 5 |
  | `SPI001` | Turmeric Powder | Spices & Masalas | 10 kg carton | 1200 | 1400 | 25 | 3 |
  | `ESS001` | Sugar | Daily Essentials | 50 kg bag | 2100 | 2250 | 70 | 10 |
  | `ESS002` | Iodized Salt | Daily Essentials | 25 kg bag | 400 | 475 | 60 | 10 |
  | `SNK001` | Biscuits | Snacks & Packaged Food | 1 carton | 450 | 510 | 100 | 10 |
  | `HOU001` | Detergent Powder | Household & Personal Care | 1 carton | 900 | 1020 | 45 | 5 |

  Existing matching categories and SKUs are left unchanged. Opening movement records are attempted for `GRA001`, `GRA002`, `PUL001`, `OIL001`, and `ESS001` when the product still has the sample quantity; duplicate notes are skipped. Create the administrator first; the script uses that account as `createdBy`. Although the frontend formats prices in INR, the database has no currency field; the sample numeric prices are illustrative.

The seed script stores current quantity directly on each sample product. It does not create a `stock` collection or add an unusable sample user.

## Running the Application

Open two terminals at the project root.

**Terminal 1 — API:**

```sh
npm --prefix server run dev
```

This runs `node --watch server.js` and serves the API at `http://localhost:4000` by default. For a non-watch start, use `npm --prefix server start`.

**Terminal 2 — frontend:**

```sh
npm --prefix client run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`) and sign in with the configured administrator email and password. During development, Vite forwards `/api` requests to `http://localhost:4000`. The API health check is available at `http://localhost:4000/api/health`.

Frontend build and lint commands are available as:

```sh
npm --prefix client run build
npm --prefix client run lint
```

No server test or lint script is defined in the server package.

## Application Workflow

1. **Create the first administrator.** The seed command hashes the configured password and inserts a user document.
2. **Sign in.** The frontend sends credentials to the login endpoint. The API checks the bcrypt hash and returns a signed JWT; the frontend stores it in browser local storage and uses it as a Bearer token for protected requests.
3. **Organize the catalog.** Create categories and products. A product stores its SKU, descriptive details, pack information, category reference, price/cost, quantity, and low-stock threshold. Adding a product with a positive starting quantity also creates an `in` movement with the note `Initial inventory`.
4. **Record inventory changes.** Stock entry supports `in`, `out`, and `adjustment`. An adjustment's submitted quantity is the new on-hand quantity. Stock-out requests cannot reduce a product below zero. Each successful entry updates the product quantity and stores before/after values, movement type, quantity/delta, note, and administrator.
5. **Monitor inventory.** The dashboard calculates summary metrics from active products and today's movements. A product is considered low-stock when `quantity <= lowStockThreshold`; low-stock filtering is available on the product page.
6. **Review activity.** The stock page and movement history show recent saved movements. The API's movement list defaults to the most recent 50 records.

### Movement quantity semantics

| Movement type | Submitted `quantity` means | Resulting on-hand quantity | Stored movement `quantity` |
| --- | --- | --- | --- |
| `in` | Number of units received | Previous quantity + submitted quantity | Units received |
| `out` | Number of units removed | Previous quantity − submitted quantity; the result cannot be negative | Units removed |
| `adjustment` | New counted on-hand quantity | Submitted quantity | Absolute difference between old and new quantity |

For example, adjusting from 12 units to 9 submits `"quantity": 9`; the movement stores `previousStock: 12`, `newStock: 9`, and `quantity: 3`. This movement is a count correction, not a stock-out.

## API Documentation

The API base URL is `http://localhost:4000/api` by default. Responses are JSON. Except for `GET /health`, `POST /auth/login`, and `POST /auth/invitations/accept`, endpoints require:

```http
Authorization: Bearer <JWT>
```

The authenticated routes are mounted behind the server's `requireAuth` middleware. The invitation creation and administrator-list routes additionally check for the `admin` role.

### Endpoints

| Method | Endpoint | Authentication | Request / behavior | Success response |
| --- | --- | --- | --- | --- |
| `GET` | `/health` | No | Health check. | `{ "status": "ok" }` |
| `POST` | `/auth/login` | No | JSON body: `email`, `password`. | `{ "token": "...", "user": { "id", "name", "email", "role" } }` |
| `GET` | `/auth/me` | Yes | Current authenticated account. | `{ "user": { "id", "name", "email", "role" } }` |
| `GET` | `/auth/admins` | Admin | Lists administrator names, emails, and creation dates. | `{ "admins": [...] }` |
| `POST` | `/auth/invitations` | Admin | JSON body: `name`, `email`; requires configured SMTP. | `201` and `{ "message": "Administrator invitation sent." }` |
| `POST` | `/auth/invitations/accept` | No | JSON body: `token`, `password`; password must be at least 12 characters. | `201` and `{ "token": "...", "user": { "id", "name", "email", "role" } }` |
| `GET` | `/products` | Yes | Lists active products, sorted by update time; populates category name. `?includeArchived=true` lists archived products only. | `{ "products": [...] }` |
| `POST` | `/products` | Yes | Creates a product; required: `name`, `sku`, `quantity`, `unitPrice`, `unitCost`. Other supported fields are listed below. | `201` and `{ "product": {...} }` |
| `PATCH` | `/products/:id` | Yes | Updates supplied product fields. | `{ "product": {...} }` |
| `PATCH` | `/products/:id/archive` | Yes | Archives an active product. | `{ "product": {...} }` |
| `GET` | `/categories` | Yes | Lists categories sorted by name. | `{ "categories": [...] }` |
| `POST` | `/categories` | Yes | JSON body: `name` (required), optional `description`. | `201` and `{ "category": {...} }` |
| `DELETE` | `/categories/:id` | Yes | Deletes a category only if no product references it. | `{ "message": "Category deleted." }` |
| `GET` | `/movements` | Yes | Lists newest movements first; optional `?limit=N` is clamped to 1–200, default 50. | `{ "movements": [...] }` |
| `POST` | `/movements` | Yes | Records a stock change; see the request example below. | `201` and `{ "movement": {...} }` |
| `GET` | `/dashboard` | Yes | Returns active-inventory and today's movement metrics. | `{ "totalProducts", "totalUnits", "inventoryValue", "lowStockCount", "todayMovementCount" }` |

Product create/update fields follow the `products` schema: `name`, `sku`, `description`, `brand`, `unit`, `packSize`, `packUnit`, `category` (category ObjectId or `null`), `quantity`, `unitPrice`, `unitCost`, and `lowStockThreshold`. Product creation requires a non-negative whole-number `quantity`; price, cost, threshold, and pack size must be non-negative numbers, with a supplied pack size greater than zero.

For stock movement creation, `type` must be `in`, `out`, or `adjustment`; `product` is the product ObjectId; and `quantity` is a positive whole number for `in`/`out`. For `adjustment`, `quantity` is the requested new on-hand quantity and may be zero. `note` is optional and limited to 240 characters.

### Endpoint details

All paths in this section are relative to `http://localhost:4000/api`. Send JSON bodies with `Content-Type: application/json`. Protected endpoints use `Authorization: Bearer <JWT>`.

#### Authentication and team

- `POST /auth/login` accepts `{"email":"admin@example.com","password":"<password>"}`. Email is trimmed and lowercased. A successful response contains a signed token and the public user fields `id`, `name`, `email`, and `role`.
- `GET /auth/me` returns the authenticated user's public fields under `user`.
- `GET /auth/admins` returns `{ "admins": [...] }`, sorted by name; each result contains `name`, `email`, `createdAt`, and MongoDB's `_id`.
- `POST /auth/invitations` accepts `{"name":"New Administrator","email":"person@example.com"}`. It requires an authenticated administrator, a valid email, both SMTP variables, and a recipient email that is not already in use. On success it sends an invitation email and returns `201`.
- `POST /auth/invitations/accept` accepts `{"token":"<invitation-token>","password":"<new-password>"}`. The token must be valid and unexpired; the password must contain at least 12 characters. A successful acceptance creates the administrator, consumes the invitation, and returns `201` with a token and public user fields.

Login and invitation acceptance are rate-limited to 10 requests per 15 minutes per client IP. Sending invitations is limited to 10 requests per hour per client IP.

#### Products

- `GET /products` returns active products in descending `updatedAt` order, with the category populated as `{ "_id", "name" }` or `null`. `?includeArchived=true` returns archived products instead of active products. There is no API-side search, sort, or pagination.
- `POST /products` creates a product from the supported product fields. `name`, `sku`, `quantity`, `unitPrice`, and `unitCost` are required by this route. An optional `category` must identify an existing category. The API uppercases the SKU. If initial quantity is positive, it also records an `in` movement attributed to the current user.
- `PATCH /products/:id` updates the fields included in the request body; omitted fields are left unchanged. It updates only active products. Set `category` to `null` or an empty value to remove the category reference. The route does not create a stock movement when `quantity` is changed directly through this endpoint; use `POST /movements` for auditable stock changes.
- `PATCH /products/:id/archive` sets `isArchived` to `true`. It does not delete the product or its movement history. Archived products no longer appear in the normal active product list or dashboard metrics.

Example partial edit:

```json
{
  "unitPrice": 1725,
  "lowStockThreshold": 12
}
```

#### Categories

- `GET /categories` returns `{ "categories": [...] }` sorted by name.
- `POST /categories` accepts `{"name":"Grains & Flours","description":"Rice, flour, and other grains"}`. Only `name` is required; the model limits it to 60 characters and `description` to 240 characters. Category names are unique without case sensitivity.
- `DELETE /categories/:id` returns `404` if the category does not exist and `409` if a product still references it. Products must be reassigned before category deletion.

#### Stock movements

- `GET /movements?limit=50` returns newest-first `{ "movements": [...] }`, with each movement's `product` populated with its name and SKU. The limit defaults to 50 and is clamped to the inclusive range 1–200. No cursor or page parameter is implemented.
- `POST /movements` accepts `product` (product ObjectId), `type` (`in`, `out`, or `adjustment`), `quantity`, and optional `note`. The API rejects archived or missing products, invalid whole-number quantities, notes longer than 240 characters, and outgoing quantities greater than available stock. It checks the quantity at update time to prevent overwriting a concurrent quantity change; a conflict returns `409`.

#### Dashboard

- `GET /dashboard` returns `totalProducts`, `totalUnits`, `inventoryValue`, `lowStockCount`, and `todayMovementCount`.
- Product counts, units, value, and low-stock count include active products only. `inventoryValue` is the sum of `quantity * unitCost`, not retail value. `todayMovementCount` counts movements since midnight according to the API server's local timezone.

### Request examples

**Sign in**

```sh
curl -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@example.com","password":"<your-admin-password>"}'
```

The response has a `token` and a `user` object. Use the returned token in the `Authorization` header for protected requests.

Example successful login response:

```json
{
  "token": "<signed-jwt>",
  "user": {
    "id": "<user-object-id>",
    "name": "Workspace Administrator",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

**Create a product** (replace the category ID if assigning a category; omit `category` to leave it unassigned):

```sh
curl -X POST http://localhost:4000/api/products \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <JWT>' \
  -d '{
    "name": "Basmati Rice",
    "sku": "GRA001",
    "brand": "Generic",
    "unit": "bag",
    "packSize": 25,
    "packUnit": "kg",
    "quantity": 100,
    "unitCost": 1500,
    "unitPrice": 1650,
    "lowStockThreshold": 10
  }'
```

The response is `201` with a `product` object containing the saved document, including its generated `_id`, timestamps, and populated category (or `null`). The server creates an initial stock-in movement when the new product's quantity is greater than zero.

**Create a category**

```sh
curl -X POST http://localhost:4000/api/categories \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <JWT>' \
  -d '{"name":"Pulses & Lentils","description":"Bulk lentils and pulses"}'
```

The response is `201` with `{ "category": { ... } }`.

**Record a stock-out**

```sh
curl -X POST http://localhost:4000/api/movements \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <JWT>' \
  -d '{
    "product": "<product-object-id>",
    "type": "out",
    "quantity": 4,
    "note": "Wholesale dispatch"
  }'
```

The response is `201` with a `movement` object containing the populated product summary (`_id`, `name`, and `sku`), `type`, `quantity`, `previousStock`, `newStock`, `note`, `createdBy`, and timestamps.

**Record an adjustment**

```sh
curl -X POST http://localhost:4000/api/movements \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <JWT>' \
  -d '{
    "product": "<product-object-id>",
    "type": "adjustment",
    "quantity": 9,
    "note": "Physical stock count"
  }'
```

Here `quantity` is the new counted on-hand quantity, not the difference to add or remove.

**Read dashboard totals**

```sh
curl http://localhost:4000/api/dashboard \
  -H 'Authorization: Bearer <JWT>'
```

Example response shape:

```json
{
  "totalProducts": 10,
  "totalUnits": 610,
  "inventoryValue": 123450,
  "lowStockCount": 2,
  "todayMovementCount": 5
}
```

The values above are illustrative, not fixed seed output; they depend on the database state.

API errors use a JSON body with a `message` property. Common statuses include `400` for invalid input, `401` for missing/expired authentication, `403` for insufficient role, `404` for missing records, `409` for duplicate or conflicting inventory operations, and `500` for unexpected server errors.

Additional statuses include `413` for JSON request bodies exceeding the 20 KB limit, `429` for rate-limited requests, `502` when the invitation email cannot be sent, and `503` when invitation email configuration is missing. Duplicate-key errors return `409`; Mongoose validation and invalid ObjectId cast errors return `400`. Unknown API paths return `404` with `{ "message": "API endpoint not found." }`.

## Screenshots

Screenshots are not currently included in the project. Add images under `docs/screenshots/` and replace each placeholder when they are available.

| Screen | Screenshot |
| --- | --- |
| Dashboard | _Screenshot pending — `docs/screenshots/dashboard.png`_ |
| Product management | _Screenshot pending — `docs/screenshots/products.png`_ |
| Category management | _Screenshot pending — `docs/screenshots/categories.png`_ |
| Stock management | _Screenshot pending — `docs/screenshots/stock.png`_ |

## Error Handling and Troubleshooting

| Problem | Checks / resolution |
| --- | --- |
| API exits with missing environment variables | Confirm `server/.env` exists and contains `MONGODB_URI` and `JWT_SECRET`. The JWT secret must be at least 32 characters. |
| MongoDB connection fails or times out | Verify the URI, database username/password, cluster hostname, and Atlas Network Access allow-list. URL-encode reserved characters in the database password. Confirm the cluster is running and reachable from the API host. |
| `Authentication failed` from MongoDB | Use the Atlas **database user** credentials in `MONGODB_URI`, not the credentials used to sign in to the Atlas website. |
| Login is rejected | Run `npm --prefix server run seed:admin` after configuring `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. Use the matching email and password. If the admin already exists, update the password explicitly with `npm --prefix server run reset:admin`. |
| Browser cannot reach `/api` | Ensure the server is running on port 4000 and the frontend is using Vite's development server. For a separate API origin, set `VITE_API_URL` in `client/.env.local` and allow the frontend origin with `CLIENT_ORIGIN`. |
| CORS error from another frontend origin | Add that exact origin to `CLIENT_ORIGIN`; multiple allowed origins may be comma-separated. Restart the API after changing its environment. |
| Invitation endpoint returns service unavailable or email fails | Set both `SMTP_URL` and `MAIL_FROM` using valid provider settings. Check the server log for the SMTP delivery error. |
| `npm ci` fails | Confirm Node.js meets the version requirement, use a supported npm version bundled with Node.js, and run the command from the project root as shown. Client and server dependencies are installed separately. |
| Port is already in use | Set `PORT` to an available API port. The Vite proxy currently targets `http://localhost:4000`; if changing the API port for frontend development, update the proxy in `client/vite.config.js` to match. |
| A category cannot be deleted | Reassign or remove it from its products first; the API intentionally rejects deletion while referenced. |

## Security Considerations

- Keep `server/.env` and all deployed environment values private. Never commit MongoDB credentials, administrator passwords, SMTP credentials, or the JWT secret. Use the safe `server/.env.example` as a template.
- Set a unique, random `JWT_SECRET` of at least 32 characters and use a strong administrator password of at least 12 characters.
- Passwords are stored as bcrypt hashes, not plaintext. Password hashes are excluded from normal user queries and are not included in API user responses.
- Protected routes require a signed Bearer JWT. The frontend currently stores this token in browser `localStorage`; deployments should account for the XSS exposure associated with browser-accessible token storage and serve the application over HTTPS.
- Login attempts and invitation sends are rate-limited. Submitted data is checked by route-level validation and Mongoose schema constraints; Express also limits JSON request bodies to 20 KB.
- Configure Atlas Network Access narrowly and use a database account with only the access required by this application's database.
- Configure `CLIENT_ORIGIN` for the actual frontend origin when deploying. Do not use wildcard CORS access for a public deployment.
- All supported user roles are currently `admin`; the current implementation does not provide differentiated staff permissions.

## Future Enhancements

The following are **not implemented in the current application** and are possible future additions:

- Barcode scanning for product lookup and stock entry.
- Expiry-date and batch/lot tracking for perishable goods.
- Supplier records and purchase-order workflows.
- Retailer accounts, order management, and fulfillment tracking.
- Invoice generation and printable/exportable documents.
- Sales reports, historical trends, and downloadable analytics.

## Contributing

1. Fork the repository and create a focused feature branch.
2. Keep changes scoped to the intended feature or fix and avoid committing `.env` files or generated dependencies.
3. Install dependencies in both packages using `npm --prefix server ci` and `npm --prefix client ci`.
4. For frontend changes, run `npm --prefix client run lint` and `npm --prefix client run build`.
5. Describe the change, setup requirements, and any manual verification performed in your pull request.

There is no automated server test script currently defined in `server/package.json`.

## License

No license file or license declaration is present in the project. The project license has **not yet been specified**.
