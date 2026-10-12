# Amazon A+ Content Bulk Manager & Studio

A high-performance, white-labeled web application for bulk managing, auditing, and publishing Amazon A+ Content via the Selling Partner API (SP-API) and MySQL OMS databases.

---

## 🚀 Key Features

- **Direct Database Integration (MySQL / OMS)**:
  - Test database connectivity on-the-fly without saving credentials first.
  - Automatic table introspection (`SHOW TABLES`) with clean dropdown selection.
  - Intelligent schema matching (auto-detects SKU, ASIN, Title, and image columns).
  - High-speed query execution (~1.5s) with live progress feedback.
- **2-Column SKU & ASIN File Import**:
  - Drag-and-drop CSV, TSV, or TXT file with only `sku` and `asin`.
  - Built-in text paste area for rapid testing.
  - Sample 2-column CSV template download.
- **Visual 7-Slide A+ Stack Studio**:
  - Live interactive A+ module manager.
  - Responsive desktop and mobile previewer.
- **Amazon SP-API Integration**:
  - Supports any target marketplace ID (India, US, UK, EU, Japan, etc.).
  - Sandbox simulation mode for risk-free testing.
  - Real-time rate limiter (8 req/s) to prevent Amazon 429 throttling.
  - Live execution log terminal.

---

## 📦 Getting Started

### 1. Installation

```bash
git clone https://github.com/Dave8011/A-Create.git
cd A-Create
npm install
```

### 2. Run the Application

```bash
npm start
```

Open your browser and navigate to:
```
http://localhost:3000
```

---

## ⚙️ Configuration

### Database Setup
1. Open the **Database & SP-API Settings** tab in the UI.
2. Enter your MySQL Host, Port, Database Name, and Username.
3. Click **Test Database Connection** to test connectivity without saving.
4. Select your listing table and products master table from the clean dropdowns.
5. Click **Fetch Listings from Database** to load your catalog.

### File Upload (Optional)
If you prefer not to connect a database:
1. Navigate to the **Catalog Listings** tab.
2. Click **Upload SKU & ASIN File**.
3. Upload a 2-column CSV or paste your `sku,asin` list directly.

### Amazon SP-API EU / India Setup
You can configure credentials either directly in the Web UI (Settings tab) or in your `.env` file:
```ini
EU_REFRESH_TOKEN='Atzr|IwEBI...'
EU_SELLING_PARTNER_APP_CLIENT_ID='amzn1.application-oa2-client....'
EU_SELLING_PARTNER_APP_CLIENT_SECRET='amzn1.oa2-cs.v1....'
EU_SELLER_ID='A3XXXXXXXXXXXX'
EU_AWS_REGION='eu-west-1'
EU_MARKETPLACE_ID='A21TJRUUN4KGV'
```
- **Marketplace ID**: Default is `A21TJRUUN4KGV` for Amazon India (`amazon.in`), `A1F83G8C2ARO7P` for UK, `A1PA6795UKMFR9` for Germany.
- **Regional API Endpoint**: Automatically mapped to `https://sellingpartnerapi-eu.amazon.com` for EU & India.
- **Toggle Mode**: Toggle between **Sandbox Simulation** and **Live SP-API** mode at any time.

---

## 🔒 Security & Credential Protection

- **Zero Exposure**: Credentials (`EU_SELLING_PARTNER_APP_CLIENT_SECRET`, `EU_REFRESH_TOKEN`, DB passwords) are kept strictly server-side and never returned in API responses or browser inspector.
- **Safe Environment Storage**: Local `.env` file permissions are enforced to `0600` (`chmod 600`) so only the application process owner can read or write secrets.
- **Strict Git Guard**: All `.env*` files are strictly excluded via `.gitignore` to prevent accidental commits.
- **Sanitized Errors**: Authentication error handlers strip request payload metadata and never print or expose credentials in logs.
- See `.env.example` for the full reference template.

---

## 📄 License

MIT
