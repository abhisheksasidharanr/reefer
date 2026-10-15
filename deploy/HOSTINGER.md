# Deploying Reefer Monitor to Hostinger (Node.js web app on a subdomain)

You need a Hostinger **Business** web hosting plan or any **Cloud** plan. These plans include Node.js web apps.

## 1. Create the database
1. In hPanel, go to **Databases → MySQL Databases**. Create a database and a user (for example `u123456789_reefer`), and save the password.
2. Open **phpMyAdmin** for that database, choose **Import**, select `deploy/schema.sql` and click **Go**. This creates the 10 tables.

## 2. Create the Node.js app
1. In hPanel, go to **Websites → Add website → Node.js Apps**.
2. Pick a source:
   - **Import Git repository** (recommended): connect GitHub and select `abhisheksasidharanr/reefer`, branch `main`.
   - **Upload files**: upload a zip of the project. Leave out `node_modules`, `.next` and `.env`.
3. Enter the build settings:
   | Setting | Value |
   |---|---|
   | Framework | Next.js |
   | Node.js version | 20.x (or 22.x) |
   | Root directory | `/` |
   | Build command | `npm run build` |
   | Start command | `npm start` |
4. Add each of these **environment variables**:
   | Name | Value |
   |---|---|
   | `DATABASE_URL` | `mysql://DB_USER:DB_PASSWORD@localhost:3306/DB_NAME`. URL-encode special characters in the password, for example `@` becomes `%40` and `#` becomes `%23`. |
   | `AUTH_SECRET` | A random string of 32 or more characters, for example from `openssl rand -hex 32`. |
   | `SEED_ADMIN_EMAIL` | The first admin's email. |
   | `SEED_ADMIN_PASSWORD` | The first admin's password, 8 or more characters. |
5. Attach your **subdomain** (for example `reefer.yourdomain.com`) and turn on **SSL** for it.
6. Deploy. On first start, the app creates the admin account and the default alert rules. It does not create demo reefers.

To check the deployment, open `https://reefer.yourdomain.com/api/health`. It should return `{"ok":true}`, which means the app is running and connected to the database.

## 3. First sign-in
Open `https://reefer.yourdomain.com` and sign in with the admin email and password. Then:
- Under **Settings → Users**, create accounts for your team.
- Optionally, delete `SEED_ADMIN_PASSWORD` from the environment variables. The app only uses it when there are no users.

## 4. MQTT: use an external broker
Shared hosting does not open custom ports, so reefer gateways **cannot reach the built-in broker on port 1883**.
1. Create a hosted MQTT broker, such as HiveMQ Cloud or EMQX Cloud. Both have free tiers. Note its URL (`mqtts://xxxx:8883`), username and password.
2. In the app, go to **Settings → MQTT**, set the mode to **External broker**, and enter the URL, username and password. Use the topic `reefer/+/telemetry`. Click **Save**, then **Test**.
3. Point the reefer gateways at the same broker and topic (`reefer/{deviceId}/telemetry`). Commands are published to `reefer/{deviceId}/command`.

## 5. Check that it keeps running
Live data, alerts and reminders only work while the app process is running. A few hours after deploying, open **Settings → MQTT** and the dashboard and confirm readings are still arriving. If they stop because the host puts idle apps to sleep, move to a Hostinger **VPS**. The build is the same: run it with `npm start` under PM2 behind Nginx, and the built-in broker works there too.

## Updating
- **Code changes:** push to `main` (or upload the new zip) and redeploy in hPanel.
- **Database changes:** generate the SQL for the change and run it in phpMyAdmin *before* you deploy:
  `npx prisma migrate diff --from-url "<production DATABASE_URL>" --to-schema-datamodel prisma/schema.prisma --script`
  This needs **Remote MySQL** enabled in hPanel for your IP address. For a fresh, empty database, import the output of `npm run db:sql` instead.
