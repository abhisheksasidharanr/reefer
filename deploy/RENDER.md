# Deploying Reefer Monitor to Render

The repository includes a Render Blueprint (`render.yaml`) that creates:
- **reefer-db**: a Render PostgreSQL database (Basic 256 MB).
- **reefer-monitor**: a Node web service on the **Starter** plan, which is always on. On the free plan the service sleeps after 15 minutes without web traffic, and then MQTT data and alerts stop.

## 1. Push the code
Push this folder to GitHub or GitLab. `.env` files are git-ignored and must never be committed.
If `reefer/` is a subfolder of the repository, uncomment `rootDir: reefer` in `render.yaml`.

## 2. Create the Blueprint
1. In the Render dashboard, go to **New → Blueprint** and select the repository.
2. Render reads `render.yaml` and asks for:
   - `SEED_ADMIN_EMAIL`: the first admin's email.
   - `SEED_ADMIN_PASSWORD`: the first admin's password (8 or more characters).
3. Click **Apply**. `AUTH_SECRET` is generated automatically, and `DATABASE_URL` is linked to the database.

Each deploy then does three things:
- Runs `npm ci && npm run build`.
- Runs `npx prisma db push` as the pre-deploy step. This creates or updates the tables, and refuses any change that would lose data.
- Runs `npm start`, which listens on Render's `$PORT`.

On first start the app creates the admin account and the default alert rules. It does not create demo reefers.

The health check is `/api/health`, which confirms the app is up and the database answers.

## 3. First sign-in
1. Open `https://reefer-monitor.onrender.com`, or your custom domain (**Settings → Custom Domains**; Render issues the SSL certificate).
2. Sign in with the admin account.
3. Create your team's accounts under **Settings → Users**.
4. Optionally, remove `SEED_ADMIN_PASSWORD` from the service's **Environment** settings. It is only used while there are no users.

## 4. MQTT: use an external broker
Render web services accept only HTTP(S) traffic, so reefer gateways cannot reach the built-in broker on port 1883.
1. Create a hosted MQTT broker, such as HiveMQ Cloud or EMQX Cloud. Both have free tiers.
2. In the app, go to **Settings → MQTT** and set:
   - Mode: **External broker**.
   - URL: e.g. `mqtts://xxxx.hivemq.cloud:8883`.
   - Your username and password.
   - Topic: `reefer/+/telemetry`.

   Then click **Save** and **Test**.
3. Point the gateways at the same broker. They publish JSON to `reefer/{deviceId}/telemetry`, and commands go to `reefer/{deviceId}/command`.

## Backups and updates
- Paid Render PostgreSQL plans include daily backups (Database → Recovery). For extra copies, run `pg_dump "<External Database URL>" > backup.sql`.
- To update, push to the connected branch and Render redeploys automatically. Schema changes are applied by the pre-deploy step.
