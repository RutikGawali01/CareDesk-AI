# Security hardening configuration

Set these values in the backend's local `.env` file or deployment secret manager. Never commit actual secrets.

```dotenv
# Allow AI to create bookings only when intentionally enabled.
AI_BOOKING_ENABLED=false

# Allow AI to cancel/reschedule appointments only when intentionally enabled.
AI_APPOINTMENT_CHANGES_ENABLED=false

# Meta app secret used to verify X-Hub-Signature-256 on webhook POSTs.
META_APP_SECRET=replace_with_meta_app_secret

# Map Meta WhatsApp phone-number IDs to clinic IDs.
# Keep this as valid JSON on one line. Add one entry per configured clinic number.
WHATSAPP_CLINIC_MAP={"1417503314772648":1}
```

The WhatsApp phone-number ID in the example is only a configuration example; verify it matches the number configured in your Meta app. The clinic ID must exist in the database.

After adding the `WhatsAppProcessedMessage` model, apply the migration from the server directory:

```bash
npx prisma migrate deploy
npx prisma generate
```

For local development, use the migration workflow your project already uses and verify the database schema before testing webhook handling.

Webhook POSTs without a valid Meta HMAC signature are rejected. Do not disable signature verification in production.
