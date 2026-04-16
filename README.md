# LKC Accounting Software
### Professional Business Accounting — by LKC Accounting

---

## What is LKC Accounting?

A complete offline-first accounting application for business owners. Features include:

- **Income & Expense Tracking** — Record, edit, delete all transactions
- **Invoicing** — Create professional invoices with your business name, send to clients
- **Receipts** — Generate payment receipts for customers
- **Profit & Loss Reports** — Date-filtered financial reports, downloadable as PDF
- **Inventory / Stock Tracking** — Manage thousands of items, low stock alerts, auto-deduct on sale
- **Customer Management** — Maintain a full client database
- **PIN Lock** — Secure app access with a PIN code
- **Admin Password** — Prevents unauthorized installation sharing between businesses
- **Offline First** — Works 100% without internet; PDF downloads require internet

---

## Installation Guide

### METHOD 1 — Install as a Desktop/Mobile App (Recommended)

LKC Accounting is a **Progressive Web App (PWA)**. This means it installs like a native app on any device.

#### On Desktop (Chrome / Edge / Brave):
1. Open the `index.html` file using a local server (see below)
2. Look for the **"Install"** button in the browser address bar (a small computer icon)
3. Click **"Install LKC Accounting"**
4. The app will be added to your desktop and Start menu
5. It runs in its own window — no browser chrome

#### On Android:
1. Open the app in Chrome
2. Tap the **three-dot menu** → **"Add to Home Screen"** or **"Install App"**
3. Confirm — it appears on your home screen like a native app

#### On iPhone / iPad (Safari):
1. Open the app in Safari
2. Tap the **Share button** → **"Add to Home Screen"**
3. Confirm — it appears on your home screen

---

### How to Run Locally (Required for PWA install)

You need to serve the files over HTTP (not just double-click the HTML file).

#### Option A — Python (easiest, built into Mac/Linux):
```bash
cd /path/to/lkc-accounting
python3 -m http.server 8080
```
Then open: `http://localhost:8080`

#### Option B — Node.js:
```bash
npx serve .
```

#### Option C — VS Code Live Server extension:
Right-click `index.html` → "Open with Live Server"

---

## First-Time Setup

When you first open LKC Accounting, you will be asked to:

1. **Enter Business Name** — This appears on all invoices, receipts, and PDF reports
2. **Set Administration Password** — This is your **license protection password**. It is required when installing on any new device. If a client shares the software with another business, they will need this password — which you control.
3. **Set App PIN** — A 4-6 digit PIN used to unlock the app daily

### Admin Password — Important for LKC Resellers

> When you set up the software for a client, you set the **Administration Password**. Only you know this password. If the client tries to install the software on another business's computer, they will be prompted for the administration password and cannot proceed without it. This protects your licensing model.

---

## Features Reference

### Income
- Record income with date, description, category, customer, amount
- Edit or delete any entry
- Searchable list

### Expenses
- Record expenses with vendor, category, date, amount
- Edit or delete any entry
- Searchable list

### Invoices
- Create professional invoices with line items, tax, due dates
- Mark invoices as paid
- View & download PDF (internet required for PDF)
- Filter by paid/unpaid

### Receipts
- Generate payment receipts
- View & download PDF (internet required for PDF)

### Inventory
- Add unlimited stock items with SKU, category, unit price, quantity
- Set low stock alert levels per item
- Low stock notifications appear in the app banner
- Record a sale: deducts stock automatically and records income

### P&L Reports
- Filter by date range
- Revenue summary, income/expense breakdown by category
- Invoice summary
- Full transaction table
- Download as PDF (internet required for PDF)

### Customers
- Maintain customer database
- Customers auto-populate in invoices, receipts, and income records

### Settings
- Update business info (name, email, phone, address, currency)
- Change PIN
- Export all data as JSON backup
- Clear all data

---

## PDF Downloads

PDF downloads (reports, invoices, receipts) require an internet connection to load the PDF library. The app will show an error message if you try to download a PDF while offline. All other functions work 100% offline.

---

## Data Storage

All data is stored locally on the device using the browser's localStorage. No data is sent to any server. Data persists until:
- You clear the data from Settings
- You clear browser/app data from device settings

**Always export a backup** from Settings → Export All Data regularly.

---

## Currency Support

Supports KES, USD, EUR, GBP, UGX, TZS, ZAR, NGN, GHS and more. Set your currency in Settings.

---

## Support

LKC Accounting Software  
Developed exclusively by LKC Accounting  
For support, contact your LKC Accounting representative.

---

*Version 1.0 — LKC Accounting*
