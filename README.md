# 🧯 FEMCS — Fire Extinguisher Management and Compliance System

A microservices-based system to track fire extinguishers, monitor expiration and maintenance dates, send automated reminders, schedule inspections, and ensure compliance with fire safety regulations.

---

## Architecture

```
┌─────────────┐     ┌──────────────────────────────────────────────────────┐
│   Frontend  │────▶│                   API Gateway :5000                  │
│  React :3000│     └──────┬──────────┬──────────┬──────────┬──────────────┘
└─────────────┘            │          │          │          │
                    :5001  │   :5002  │   :5003  │   :5004  │  :5005
              auth-service │ customer │extinguish│notificat.│ report
                           │ -service │ -service │ -service │ -service
                           └──────────┴──────────┴──────────┴──────────────┘
                                              │
                                       PostgreSQL :5432
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| `api-gateway` | 5000 | Reverse proxy, rate limiting, Swagger docs |
| `auth-service` | 5001 | Authentication, JWT, user management |
| `entry-service` (customer) | 5002 | Customer registration and management |
| `extinguisher-service` | 5003 | Extinguisher CRUD, inspections, maintenance |
| `notification-service` | 5004 | In-app + email notifications, escalations, cron scheduler |
| `report-service` | 5005 | Reports (expired, compliance, audit) with CSV export |
| `frontend` | 3000 | React dashboard |

## Quick Start

### With Docker Compose

```bash
# Copy and configure environment
cp api-gateway/.env.example api-gateway/.env
cp services/auth-service/.env.example services/auth-service/.env
cp services/entry-service/.env.example services/entry-service/.env
cp services/extinguisher-service/.env.example services/extinguisher-service/.env
cp services/notification-service/.env.example services/notification-service/.env
cp services/report-service/.env.example services/report-service/.env

# Start everything
docker-compose up --build
```

### Manual (Development)

```bash
# Start each service
cd services/auth-service && npm install && npm run dev
cd services/entry-service && npm install && npm run dev
cd services/extinguisher-service && npm install && npm run dev
cd services/notification-service && npm install && npm run dev
cd services/report-service && npm install && npm run dev
cd api-gateway && npm install && npm run dev
cd frontend && npm install && npm start
```

### Database

```bash
psql -U femcs -d femcs_db -f schema.sql
```

## Default Login

- **Email:** admin@femcs.rw
- **Password:** Admin@1234

## API Docs

Visit `http://localhost:5000/api/docs` after starting the gateway.

## Features

- ✅ Customer management (FR1)
- ✅ Fire extinguisher registration (FR2)
- ✅ Inventory dashboard with stats (FR3)
- ✅ Automatic expiry monitoring — 90/60/30/7 day alerts (FR4)
- ✅ Inspection management with pass/fail/requires service (FR5)
- ✅ Maintenance scheduling and tracking (FR6)
- ✅ In-app + email notifications (FR7)
- ✅ 5-stage escalation system (FR8)
- ✅ Reports: expired, expiring, customers, inspections, maintenance, compliance — CSV export (FR9)
- ✅ Full audit trail (FR10)
- ✅ Roles: admin, technician, inspector, safety_officer
- ✅ Responsive React frontend with dark theme

## Email Configuration

Set SMTP credentials in `services/notification-service/.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
```

If credentials are not set, email sending is skipped gracefully — in-app notifications still work.
