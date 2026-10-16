# Stockroom — Small-business inventory

A responsive inventory workspace with an administrator login, product and category management, stock-in/out/adjustment entries, movement history, and a MongoDB-backed REST API.

## Requirements

- Node.js 20.19+ or 22.12+
- MongoDB Atlas cluster (or MongoDB 6+ running locally)

## Set up

1. Create a MongoDB Atlas cluster, add a database user, and allow your server's IP address in Atlas **Network Access**. In **Database > Connect > Drivers**, copy the Node.js connection string. The app uses the `stockroom` database name in that URI; MongoDB creates the database and its collections when the first records are written.

2. Create the environment file and set a private administrator password and JWT secret:

   ```sh
   cp .env.example .env
   ```

   Replace `<db_username>`, `<db_password>`, and `<cluster-host>` in `MONGODB_URI` with your Atlas database user's credentials and cluster hostname. Keep `/stockroom` in the URI to select the app database. If your password contains reserved URI characters such as `@`, `:`, `/`, or `#`, URL-encode them before placing it in the URI. Set `JWT_SECRET` to a random value of at least 32 characters, and set `ADMIN_PASSWORD` to a password of at least 12 characters. Never commit `.env` or share the completed connection string.

   To invite additional administrators from the Team page, configure `SMTP_URL` with your email provider's SMTP connection URL and `MAIL_FROM` with the verified sender address. Invitation links expire after 24 hours.

3. Install the API dependencies and create the first admin account:

   ```sh
   npm install
   npm run seed:admin
   ```

   To reset an existing administrator's password, first update `ADMIN_PASSWORD` in `.env` to a new value of at least 12 characters, then run:

   ```sh
   npm run reset:admin
   ```

   To add the sample grocery categories, products, quantities, and opening movements to the `stockroom` database without overwriting existing products, run:

   ```sh
   npm run seed:grocery
   ```

   The app stores on-hand quantity on each product rather than in a separate `stock` collection. The sample user document is not inserted because it would not have a working password; the import attributes movement history to the administrator configured in `ADMIN_EMAIL`.

4. Start the API and frontend in separate terminals:

   ```sh
   npm run dev
   ```

   ```sh
   npm --prefix client install
   npm --prefix client run dev
   ```

5. Open the Vite URL (usually `http://localhost:5173`) and sign in using `ADMIN_EMAIL` and `ADMIN_PASSWORD` from `.env`.

The API listens on `http://localhost:4000`. During frontend development, Vite proxies `/api` requests to the API, so the frontend and backend work together without browser CORS configuration. Set `CLIENT_ORIGIN` to the frontend origin if you connect from a different origin. The frontend API URL can be set in `client/.env.local` as `VITE_API_URL` when the API is hosted separately.

## API

All routes except login and health check require `Authorization: Bearer <token>`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | API health check |
| `POST` | `/api/auth/login` | Administrator login |
| `GET` | `/api/auth/me` | Current administrator |
| `GET` | `/api/auth/admins` | List administrators (authenticated) |
| `POST` | `/api/auth/invitations` | Email an administrator invitation (authenticated) |
| `POST` | `/api/auth/invitations/accept` | Accept an invitation and set a password |
| `GET`, `POST` | `/api/products` | List or create products |
| `PATCH` | `/api/products/:id` | Update product details |
| `PATCH` | `/api/products/:id/archive` | Archive a product |
| `GET`, `POST` | `/api/categories` | List or create categories |
| `DELETE` | `/api/categories/:id` | Delete an unused category |
| `GET`, `POST` | `/api/movements` | List or record stock movements |
| `GET` | `/api/dashboard` | Inventory metrics |

Stock-out requests cannot reduce quantity below zero. Adjustments set the new on-hand quantity; movement history records the resulting delta.

## How the website works

1. **Sign in:** the browser sends the administrator's email and password to `POST /api/auth/login`. The API checks the bcrypt password hash and returns a signed JWT. The frontend stores that token in browser local storage and attaches it to protected API requests.
2. **Load the workspace:** `GET /api/auth/me` validates the session. The dashboard then fetches products, categories, recent movements, and summary metrics from the API. MongoDB is the source of truth; the frontend does not invent fallback inventory data.
3. **Manage products and categories:** create/edit/archive actions call the products endpoints; category actions call the categories endpoints. The API validates submitted data and writes the changes to MongoDB.
4. **Record stock changes:** stock-in, stock-out, and quantity-adjustment entries go to `POST /api/movements`. The API checks available stock, updates the product quantity, and records the before/after levels and administrator in movement history.
5. **Review activity:** dashboard and history screens read the saved movements and current product quantities from the API. Signing out removes the stored browser token.

The API and frontend need to be running in separate terminals. MongoDB Atlas must be reachable using `MONGODB_URI`, and the first administrator must be created with `npm run seed:admin` before sign-in can succeed.
