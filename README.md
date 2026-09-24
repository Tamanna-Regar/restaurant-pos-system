# 🍽️ Tamanna Restaurant — Full-Stack POS & ERP System

A complete, enterprise-grade Point-of-Sale and restaurant management system built for a **100% Pure Vegetarian** restaurant. Goes beyond basic billing into a full ERP with real-time order tracking, kitchen display, inventory, staff management, delivery integration, and more.

![Status](https://img.shields.io/badge/status-active-brightgreen) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## ✨ Features

### Core POS
- Order management (dine-in, takeaway, delivery) with real-time updates (Socket.io)
- Table management & reservations
- Menu & recipe management with ingredient-level costing
- Multi-payment support (Cash, Card, UPI, Razorpay online payments)
- Split billing / bill merge across tables

### Inventory & Operations
- Ingredient & stock tracking with batch/expiry management
- Barcode/QR code scanning for stock updates
- Purchase orders, supplier management & stock audits
- Low-stock alerts (automated, via cron jobs)

### Staff & HR
- Staff attendance, shift rostering, leave & overtime requests
- Role-based access control (RBAC)
- Salary/payroll processing

### Customer Experience
- Table QR self-ordering for customers
- Customer loyalty points & birthday offers
- WhatsApp & SMS/OTP notifications for orders and bills
- Multi-language UI (English / Hindi via i18next)

### Kitchen & Delivery
- Live Kitchen Display System (KDS) with station filters and wait-time alerts
- Delivery partner API integration (Zomato/Swiggy-style order simulation)
- Thermal printer (ESC/POS) support for KOTs and bills

### Reports & Documents
- PDF invoice generation (GST-compliant)
- Excel (multi-sheet) sales & inventory export
- Tally-compatible accounting export
- Advanced analytics dashboard

### Reliability & Security
- Automated database backups
- Two-Factor Authentication (2FA)
- Offline mode with request queueing (PWA-ready)
- JWT-based authentication, audit logging

### Developer Experience
- Swagger/OpenAPI documentation
- Automated tests (Jest + Supertest, React Testing Library)
- Dockerized (backend + frontend + Nginx) with `docker-compose`
- CI/CD pipeline via GitHub Actions
- Winston + Morgan logging

---

## 🛠️ Tech Stack

**Frontend:** React.js, Tailwind CSS, Socket.io-client, i18next, Recharts
**Backend:** Node.js, Express.js, MongoDB (Mongoose), Socket.io
**Integrations:** Razorpay, Meta WhatsApp Cloud API, Fast2SMS, Nodemailer
**DevOps:** Docker, GitHub Actions, Nginx

---

## 📸 Screenshots

> _Add screenshots/GIFs of the Dashboard, KDS, and Invoice here._

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- MongoDB (local or Atlas)

### Backend
```bash
cd restaurant-pos-backend
npm install
npm start
```

### Frontend
```bash
cd restaurant-pos-frontend
npm install
npm start
```

### Environment Variables
Create a `.env` file inside `restaurant-pos-backend/` (never commit this file):
```
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET_KEY=your_random_secret
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

### Run with Docker
```bash
docker-compose up --build
```

---

## 📖 API Documentation

Once the backend is running, interactive API docs are available at:
```
http://localhost:5000/api/docs
```

---

## 🧪 Testing

```bash
# Backend
cd restaurant-pos-backend
npm test

# Frontend
cd restaurant-pos-frontend
npm test
```

---

## 👤 Author

**Tamanna Regar**
[GitHub](https://github.com/Tamanna-Regar) | [LinkedIn](https://linkedin.com/in/tamanna-regar-139a21382)

---

## 📄 License

This project is licensed under the MIT License.