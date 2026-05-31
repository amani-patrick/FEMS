# XWZ Parking Management System
### Microservices-based Car Parking Management | Kigali, Rwanda

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                   FRONTEND (React)               │
│                  http://localhost:3000           │
└────────────────────────┬────────────────────────┘
                         │
┌────────────────────────▼────────────────────────┐
│              API GATEWAY  :5000                  │
│         (Routing, CORS, Rate Limiting)           │
└──┬─────────────┬──────────────┬──────────┬──────┘
   │             │              │          │
   ▼             ▼              ▼          ▼
:5001         :5002           :5003      :5004
Auth            
Service       Service         Service    Service
   │             │              │          │
   └─────────────┴──────────────┴──────────┘
                         │
              ┌──────────▼──────────┐
              │   PostgreSQL :5432xwz_parking 
              └─────────────────────┘
```

## 📦 Services

| Service | Port | Responsibility |
|---------|------|----------------|
| API Gateway | 5000 | Request routing, CORS, Rate limiting |
| Auth Service | 5001 | User registration, login, JWT tokens |
| Entry Service | 5003 | Car entry/exit, tickets, bills |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Docker & Docker Compose (recommended)


#### 1. Setup PostgreSQL
```bash
psql -U postgres
CREATE DATABASE xwz_parking;
\q

psql -U postgres -d <project_name> -f schema.sql
```

#### 2. Start API Gateway
```bash
cd api-gateway
npm install
cp .env.example .env  
npm start
```

#### 3. Start Auth Service
```bash
cd services/auth-service
npm install
npm start
```

#### . Start Entry Service
```bash
cd services/entry-service
npm install
npm start
```

#### . Start Frontend
```bash
cd frontend
npm install
npm start
```

---



## 📚 API Documentation

Swagger UI available at: **http://localhost:5000/api/docs**

---

## 🔐 Authentication

All API endpoints (except `/auth/register` and `/auth/login`) require a JWT token:

```
Authorization: Bearer <jwt_token>
```

---

## 👥 User Roles

---

## 📋 Key Features

---

## 🛡️ Security

- Helmet.js headers on all services
- CORS configured (whitelist-based)
- Rate limiting: 200 requests/15min per IP
- Input validation with Joi (server-side)
- Client-side validation on all forms
- SQL injection prevention via parameterized queries
- JWT token expiry enforcement

---

## 🗄️ Database Schema


---

## 📁 Project Structure

```
xwz-parking/
├── docker-compose.yml
├── schema.sql
├── swagger.yaml
├── README.md
├── api-gateway/
│   └── src/index.js
├── services/
│   ├── auth-service/
│   ├── entry-service/
└── frontend/
    └── src/
        ├── pages/
        ├── components/
        ├── services/
        └── context/
```

