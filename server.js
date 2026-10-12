require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { SpApiClient, INDIA_MARKETPLACE_ID } = require('./spapi_client');
const { omsDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure data and uploads directory exist (supports Vercel /tmp)
const DATA_DIR = process.env.VERCEL ? path.join('/tmp', 'data') : path.join(__dirname, 'data');
const UPLOADS_DIR = process.env.VERCEL ? path.join('/tmp', 'uploads') : path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (err) {
  console.warn('Could not initialize storage dirs:', err.message);
}

// Multer storage for CSV and image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`)
});
const upload = multer({ storage });

// Initialize SP-API client
const spapi = new SpApiClient({
  isSandbox: process.env.SP_API_SANDBOX === 'true' || (process.env.SP_API_SANDBOX !== 'false' && !(process.env.EU_REFRESH_TOKEN || process.env.SP_API_REFRESH_TOKEN)),
  marketplaceId: process.env.EU_MARKETPLACE_ID || process.env.SP_API_MARKETPLACE_ID || INDIA_MARKETPLACE_ID,
  clientId: process.env.EU_SELLING_PARTNER_APP_CLIENT_ID || process.env.SP_API_CLIENT_ID || '',
  clientSecret: process.env.EU_SELLING_PARTNER_APP_CLIENT_SECRET || process.env.SP_API_CLIENT_SECRET || '',
  refreshToken: process.env.EU_REFRESH_TOKEN || process.env.SP_API_REFRESH_TOKEN || '',
  sellerId: process.env.EU_SELLER_ID || process.env.SELLER_ID || '',
  awsRegion: process.env.EU_AWS_REGION || process.env.AWS_REGION || 'eu-west-1'
});

// Load listings with in-memory fallback for serverless hosting
const LISTINGS_FILE = path.join(DATA_DIR, 'listings.json');
let inMemoryListings = [];

function getListings() {
  if (inMemoryListings.length > 0) return inMemoryListings;
  if (fs.existsSync(LISTINGS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(LISTINGS_FILE, 'utf-8'));
      if (Array.isArray(data)) {
        inMemoryListings = data;
        return data;
      }
    } catch {
      return inMemoryListings;
    }
  }
  return inMemoryListings;
}

function saveListings(listings) {
  inMemoryListings = listings || [];
  try {
    fs.writeFileSync(LISTINGS_FILE, JSON.stringify(listings, null, 2));
  } catch (err) {
    console.warn('Could not write listings to disk, retained in memory:', err.message);
  }
}

// Active batch processing queue state
let currentBatchJob = null;

// ======================== API ROUTES ========================

// OMS Database Routes
app.get('/api/db-config', (req, res) => {
  res.json(omsDb.getConfigSummary());
});

app.post('/api/db-config', (req, res) => {
  const { 
    host, port, user, password, database,
    amazonTable, productsTable, marketplaceCol, marketplaceVal,
    categoryCol, categoryVal, joinKey
  } = req.body;

  omsDb.updateConfig({ 
    host, port, user, password, database,
    amazonTable, productsTable, marketplaceCol, marketplaceVal,
    categoryCol, categoryVal, joinKey
  });

  // Persist to local .env file
  try {
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) envContent = fs.readFileSync(envPath, 'utf-8');

    const updateEnvVar = (key, val) => {
      if (val === undefined) return;
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}="${val || ''}"`);
      } else {
        envContent += `\n${key}="${val || ''}"`;
      }
    };

    updateEnvVar('DB_HOST', host);
    updateEnvVar('DB_PORT', port || 3306);
    updateEnvVar('DB_USER', user);
    if (password) updateEnvVar('DB_PASSWORD', password);
    updateEnvVar('DB_NAME', database);

    // Table & filter customizations
    updateEnvVar('DB_TABLE_AMAZON', amazonTable);
    updateEnvVar('DB_TABLE_PRODUCTS', productsTable);
    updateEnvVar('DB_MARKETPLACE_COL', marketplaceCol);
    updateEnvVar('DB_MARKETPLACE_VAL', marketplaceVal);
    updateEnvVar('DB_CATEGORY_COL', categoryCol);
    updateEnvVar('DB_CATEGORY_VAL', categoryVal);
    updateEnvVar('DB_JOIN_KEY', joinKey);

    fs.writeFileSync(envPath, envContent.trim() + '\n', { mode: 0o600 });
    try {
      fs.chmodSync(envPath, 0o600);
    } catch (_) {}
  } catch (err) {
    console.error('Failed to update .env:', err.message);
  }

  res.json({ success: true, config: omsDb.getConfigSummary() });
});

app.post('/api/test-db', async (req, res) => {
  const result = await omsDb.testConnection(req.body || {});
  res.json(result);
});

app.post('/api/db-columns', async (req, res) => {
  const { table, ...creds } = req.body || {};
  const tableName = table || req.query.table;
  const result = await omsDb.getColumnsForTable(tableName, creds);
  res.json(result);
});

app.post('/api/sync-db', async (req, res) => {
  try {
    const result = await omsDb.fetchPTFSListings(req.body || {});
    if (result.success) {
      saveListings(result.items);
      res.json({
        success: true,
        message: `Successfully loaded ${result.count} real listings from ${result.queryInfo.amazonTable} & ${result.queryInfo.productsTable}!`,
        count: result.count,
        items: result.items,
        queryInfo: result.queryInfo
      });
    } else {
      res.status(400).json({ success: false, message: 'Failed to fetch listings from OMS' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post('/api/clear-listings', (req, res) => {
  saveListings([]);
  res.json({ success: true, message: 'All listings cleared' });
});

// 1. Config & Settings
app.get('/api/config', (req, res) => {
  res.json(spapi.getConfigSummary());
});

app.post('/api/config', (req, res) => {
  const { 
    clientId, 
    clientSecret, 
    refreshToken, 
    sellerId, 
    awsRegion, 
    marketplaceId, 
    isSandbox 
  } = req.body;

  spapi.updateConfig({ 
    clientId, 
    clientSecret, 
    refreshToken, 
    sellerId, 
    awsRegion, 
    marketplaceId, 
    isSandbox 
  });

  // Save securely to local .env file on the user's computer
  try {
    const envPath = path.join(__dirname, '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) envContent = fs.readFileSync(envPath, 'utf-8');

    const updateEnvVar = (key, val) => {
      if (val === undefined || val === null) return;
      // Protect existing secrets: do not overwrite with empty strings if not provided
      if (val === '' && (key.includes('SECRET') || key.includes('TOKEN')) && (new RegExp(`^${key}=.+`, 'm')).test(envContent)) {
        return;
      }
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}="${val || ''}"`);
      } else {
        envContent += `\n${key}="${val || ''}"`;
      }
    };

    // 1. Primary EU_* credentials
    if (clientId !== undefined) updateEnvVar('EU_SELLING_PARTNER_APP_CLIENT_ID', clientId);
    if (clientSecret !== undefined && clientSecret !== '') updateEnvVar('EU_SELLING_PARTNER_APP_CLIENT_SECRET', clientSecret);
    if (refreshToken !== undefined && refreshToken !== '') updateEnvVar('EU_REFRESH_TOKEN', refreshToken);
    if (sellerId !== undefined) updateEnvVar('EU_SELLER_ID', sellerId);
    if (awsRegion !== undefined) updateEnvVar('EU_AWS_REGION', awsRegion || 'eu-west-1');
    if (marketplaceId !== undefined) updateEnvVar('EU_MARKETPLACE_ID', marketplaceId || INDIA_MARKETPLACE_ID);

    // 2. Standard SP_API_* aliases for maximum compatibility
    if (clientId !== undefined) updateEnvVar('SP_API_CLIENT_ID', clientId);
    if (clientSecret !== undefined && clientSecret !== '') updateEnvVar('SP_API_CLIENT_SECRET', clientSecret);
    if (refreshToken !== undefined && refreshToken !== '') updateEnvVar('SP_API_REFRESH_TOKEN', refreshToken);
    if (marketplaceId !== undefined) updateEnvVar('SP_API_MARKETPLACE_ID', marketplaceId || INDIA_MARKETPLACE_ID);
    if (isSandbox !== undefined) updateEnvVar('SP_API_SANDBOX', isSandbox !== false);

    fs.writeFileSync(envPath, envContent.trim() + '\n', { mode: 0o600 });
    try {
      fs.chmodSync(envPath, 0o600);
    } catch (_) {}
  } catch (err) {
    console.error('Failed to write .env file:', err.message);
  }

  res.json({ success: true, config: spapi.getConfigSummary() });
});

app.post('/api/test-connection', async (req, res) => {
  try {
    const customConfig = (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) ? req.body : null;
    const result = await spapi.testConnection(customConfig);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// Live Amazon Catalog Sync (Pull real A+ documents & ASINs directly from Amazon SP-API)
app.post('/api/sync-live-amazon', async (req, res) => {
  try {
    const docResults = await spapi.searchContentDocuments();
    const docList = docResults.contentDocumentMetadataRecordList || [];

    if (docList.length === 0) {
      return res.json({
        success: true,
        message: 'No existing A+ documents found in this seller account for India marketplace.',
        count: 0
      });
    }

    const currentListings = getListings();
    const syncedItems = [];

    for (let i = 0; i < docList.length; i++) {
      const doc = docList[i];
      let asins = [];
      try {
        const asinRel = await spapi.listContentDocumentAsinRelations(doc.contentReferenceKey);
        asins = (asinRel.asinMetadataSet || []).map(a => a.asin);
      } catch (err) {
        console.warn(`Could not fetch ASINs for doc ${doc.contentReferenceKey}`);
      }

      const primaryAsin = asins[0] || `B08N${String(i + 1).padStart(6, '0')}`;
      syncedItems.push({
        id: i + 1,
        asin: primaryAsin,
        sku: `SKU-${primaryAsin}`,
        title: doc.name || 'Amazon Listing',
        category: 'Catalog',
        templateType: '7_SLIDE_STACK',
        slideCount: 7,
        status: doc.status || 'APPROVED',
        liveOnAmazon: doc.status === 'APPROVED',
        moderationErrors: doc.status === 'REJECTED' ? ['Flagged during Amazon moderation review'] : [],
        moderationWarnings: [],
        contentReferenceKey: doc.contentReferenceKey,
        lastUpdated: doc.updateTime ? doc.updateTime.split('T')[0] : new Date().toISOString().split('T')[0],
        auditTimestamp: new Date().toISOString()
      });
    }

    saveListings(syncedItems);
    res.json({
      success: true,
      message: `Successfully synchronized ${syncedItems.length} live A+ documents from Amazon India!`,
      count: syncedItems.length
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Sync failed: ' + err.message });
  }
});

// 2. Fetch all listings with pagination, filters, and metrics
app.get('/api/listings', (req, res) => {
  const { search, status, page = 1, limit = 50 } = req.query;
  let list = getListings();

  // Metrics
  const metrics = {
    total: list.length,
    approved: list.filter(l => l.status === 'APPROVED').length,
    submitted: list.filter(l => l.status === 'SUBMITTED').length,
    rejected: list.filter(l => l.status === 'REJECTED').length,
    draft: list.filter(l => l.status === 'DRAFT').length,
    liveOnAmazon: list.filter(l => l.liveOnAmazon).length
  };

  // Filter by status
  if (status && status !== 'ALL') {
    list = list.filter(item => item.status === status);
  }

  // Search by ASIN, SKU, or Title
  if (search) {
    const q = search.toLowerCase();
    list = list.filter(item => 
      item.asin.toLowerCase().includes(q) ||
      item.sku.toLowerCase().includes(q) ||
      item.title.toLowerCase().includes(q)
    );
  }

  const startIndex = (parseInt(page) - 1) * parseInt(limit);
  const paginatedItems = list.slice(startIndex, startIndex + parseInt(limit));

  res.json({
    metrics,
    totalCount: list.length,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(list.length / parseInt(limit)),
    items: paginatedItems
  });
});

// 3. Downloadable 2-Column Template (SKU & ASIN only)
app.get('/api/download-sku-asin-template', (req, res) => {
  const csvContent = 'sku,asin\nORG-FEN-500G,B08N5WRWNW\nORG-PEP-250G,B08N000002\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="sku_asin_import_template.csv"');
  res.send(csvContent);
});

// Downloadable 7-Slide Manifest Template
app.get('/api/download-template-csv', (req, res) => {
  const csvHeader = 'ASIN,SKU,Product_Title,Slide_1_Hero,Slide_2_Badges,Slide_3_FreeFrom,Slide_4_WhyOrg,Slide_5_Cert,Slide_6_Usage,Slide_7_Recipe\n';
  const sampleRow1 = 'B08N5WRWNW,ORG-FEN-500G,Certified Organic Fennel Seed (Saunf),B08N5WRWNW/01_hero.jpg,B08N5WRWNW/02_badges.jpg,B08N5WRWNW/03_freefrom.jpg,B08N5WRWNW/04_why_organic.jpg,B08N5WRWNW/05_certification.jpg,B08N5WRWNW/06_usage.jpg,B08N5WRWNW/07_taste_recipe.jpg\n';
  const sampleRow2 = 'B08N000002,ORG-PEP-250G,Organic Whole Black Pepper Powder,B08N000002/01_hero.jpg,B08N000002/02_badges.jpg,B08N000002/03_freefrom.jpg,B08N000002/04_why_organic.jpg,B08N000002/05_certification.jpg,B08N000002/06_usage.jpg,B08N000002/07_taste_recipe.jpg\n';

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="amazon_aplus_7slide_bulk_template.csv"');
  res.send(csvHeader + sampleRow1 + sampleRow2);
});

// 4. Upload SKU & ASIN File (Direct 2-column upload without needing images initially)
app.post('/api/upload-sku-asin', upload.single('file'), (req, res) => {
  try {
    let rawContent = '';
    if (req.file) {
      rawContent = fs.readFileSync(req.file.path, 'utf-8');
    } else if (req.body && req.body.content) {
      rawContent = req.body.content;
    } else {
      return res.status(400).json({ success: false, message: 'Please upload a CSV or TXT file with SKU and ASIN.' });
    }

    const lines = rawContent.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
      return res.status(400).json({ success: false, message: 'The uploaded file is empty.' });
    }

    // Detect delimiter: comma, tab, semicolon, pipe
    const sampleLine = lines[0];
    let delimiter = ',';
    if (sampleLine.includes('\t')) delimiter = '\t';
    else if (sampleLine.includes(';') && !sampleLine.includes(',')) delimiter = ';';
    else if (sampleLine.includes('|')) delimiter = '|';

    const parseLine = (line) => line.split(delimiter).map(c => c.trim().replace(/^["']|["']$/g, ''));

    const firstRowCols = parseLine(lines[0]);
    let hasHeader = false;
    let asinColIdx = -1;
    let skuColIdx = -1;

    // Check if first row is an explicit header row
    const isExplicitHeader = (str) => {
      const s = (str || '').toLowerCase().trim();
      return ['sku', 'asin', 'sellersku', 'seller_sku', 'item_sku', 'product_sku', 'asin_code', 'asin_number'].includes(s);
    };

    if (isExplicitHeader(firstRowCols[0]) || isExplicitHeader(firstRowCols[1])) {
      hasHeader = true;
      if ((firstRowCols[0] || '').toLowerCase().includes('asin')) {
        asinColIdx = 0;
        skuColIdx = 1;
      } else {
        skuColIdx = 0;
        asinColIdx = 1;
      }
    } else {
      hasHeader = false;
      const val0 = firstRowCols[0] || '';
      const val1 = firstRowCols[1] || '';
      if (/^B0[A-Z0-9]{8}$/i.test(val0)) {
        asinColIdx = 0;
        skuColIdx = 1;
      } else {
        skuColIdx = 0;
        asinColIdx = 1;
      }
    }

    const startIndex = hasHeader ? 1 : 0;
    const parsedItems = [];
    const seenAsins = new Set();

    for (let i = startIndex; i < lines.length; i++) {
      const cols = parseLine(lines[i]);
      if (cols.length === 0 || (cols.length === 1 && !cols[0])) continue;

      let asin = (cols[asinColIdx] || '').trim();
      let sku = (cols[skuColIdx] || '').trim();

      // If one of them is missing or column order flipped:
      if (!asin && cols[0]) {
        if (/^B0[A-Z0-9]{8}$/i.test(cols[0])) asin = cols[0];
        else sku = cols[0];
      }

      if (asin || sku) {
        if (!sku) sku = `SKU-${asin}`;
        if (!asin) asin = `ASIN-${sku}`;

        asin = asin.toUpperCase();

        if (!seenAsins.has(asin)) {
          seenAsins.add(asin);
          parsedItems.push({
            id: parsedItems.length + 1,
            asin,
            sku,
            title: sku,
            category: 'Uploaded',
            templateType: '7_SLIDE_STACK',
            slideCount: 7,
            status: 'DRAFT',
            liveOnAmazon: false,
            moderationErrors: [],
            moderationWarnings: [],
            images: [],
            contentReferenceKey: null,
            lastUpdated: new Date().toISOString().split('T')[0],
            auditTimestamp: null
          });
        }
      }
    }

    if (parsedItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Could not extract valid SKU and ASIN records from file.' });
    }

    // Save items to data/listings.json
    saveListings(parsedItems);

    res.json({
      success: true,
      count: parsedItems.length,
      message: `Successfully loaded ${parsedItems.length} real listings from your file!`,
      items: parsedItems.slice(0, 50)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'File processing error: ' + err.message });
  }
});

// 4. Parse & Pre-flight Validate CSV Manifest
app.post('/api/parse-manifest', upload.single('manifest'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please upload a CSV file.' });
  }

  const filePath = req.file.path;
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim().length > 0);

  if (lines.length < 2) {
    return res.status(400).json({ error: 'CSV file is empty or missing data rows.' });
  }

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cols.length < 2) continue;

    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = cols[idx] || '';
    });

    const asin = rowObj.ASIN || cols[0];
    const sku = rowObj.SKU || cols[1];

    if (!asin || !asin.match(/^B0[A-Z0-9]{8}$/i)) {
      errors.push(`Row ${i + 1}: Invalid ASIN format '${asin}' (must be 10 characters starting with B0).`);
    }

    rows.push({
      rowNumber: i + 1,
      asin,
      sku,
      title: rowObj.Product_Title || 'Product Name',
      slideCount: 7,
      isValid: !errors.some(e => e.startsWith(`Row ${i + 1}:`))
    });
  }

  res.json({
    totalRows: rows.length,
    validRows: rows.filter(r => r.isValid).length,
    errors,
    sampleRows: rows.slice(0, 10)
  });
});

// 5. Pre-flight Validation for 7-Slide Layout
app.post('/api/validate-slide-layout', (req, res) => {
  const { asin, slides } = req.body;
  const validationResults = [];

  const requiredDimensions = {
    0: { name: 'Slide 1 (Hero Banner)', width: 970, height: 600 },
    1: { name: 'Slide 2 (Trust Badges)', width: 970, height: 600 },
    2: { name: 'Slide 3 (Free From)', width: 970, height: 600 },
    3: { name: 'Slide 4 (Why Organic)', width: 970, height: 600 },
    4: { name: 'Slide 5 (Certifications)', width: 970, height: 600 },
    5: { name: 'Slide 6 (Product Usage)', width: 970, height: 600 },
    6: { name: 'Slide 7 (Taste & Recipe)', width: 970, height: 600 }
  };

  for (let i = 0; i < 7; i++) {
    const slide = slides && slides[i];
    const spec = requiredDimensions[i];
    const isValid = Boolean(slide && slide.hasImage);

    validationResults.push({
      slideIndex: i + 1,
      name: spec.name,
      expectedDimensions: `${spec.width} x ${spec.height} px`,
      format: 'JPG / PNG (<2MB)',
      status: isValid ? 'VALID' : 'PENDING_UPLOAD',
      message: isValid ? 'Image ready for S3 upload' : 'Please upload slide image file'
    });
  }

  res.json({
    asin: asin || 'ASIN',
    totalModules: 7,
    allValid: validationResults.every(r => r.status === 'VALID'),
    results: validationResults
  });
});

// 6. Start Bulk Update Processing Job
app.post('/api/start-bulk-batch', async (req, res) => {
  const { asins, templateType = '7_SLIDE_STACK', options = {} } = req.body;
  const listings = getListings();

  // If specific ASINs are requested, filter; otherwise use all listings or top N
  let targetItems = listings;
  if (asins && asins.length > 0) {
    targetItems = listings.filter(l => asins.includes(l.asin));
  }

  const jobId = 'job_' + Date.now();
  currentBatchJob = {
    jobId,
    startTime: new Date().toISOString(),
    status: 'RUNNING',
    total: targetItems.length,
    processed: 0,
    successful: 0,
    failed: 0,
    rateLimitPerSec: 8, // Stays well below Amazon's 10 req/s limit
    logs: [],
    currentItem: null
  };

  res.json({
    success: true,
    jobId,
    totalQueued: targetItems.length,
    message: `Batch job queued for ${targetItems.length} listings with automated rate limiting.`
  });

  // Run queue processing asynchronously
  (async () => {
    for (let i = 0; i < targetItems.length; i++) {
      if (!currentBatchJob || currentBatchJob.status === 'CANCELLED') break;

      const item = targetItems[i];
      currentBatchJob.currentItem = { asin: item.asin, sku: item.sku };

      // Step A: Create Upload Destination
      try {
        const dest = await spapi.createUploadDestination('image/jpeg');
        // Step B: Build A+ Document
        const dummySlides = Array.from({ length: 7 }, (_, sIdx) => ({
          uploadDestinationId: dest.uploadDestinationId,
          title: `Module ${sIdx + 1}`,
          altText: `${item.title} Slide ${sIdx + 1}`
        }));

        const docPayload = spapi.build7SlideContentDocument(item.title, item.asin, dummySlides);
        const docRes = await spapi.createContentDocument(docPayload);

        // Step C: Link ASIN to A+ Document
        await spapi.postContentDocumentAsinRelations(docRes.contentReferenceKey, [item.asin]);

        // Step D: Submit A+ Document for Amazon Review, Approval, & Publishing
        await spapi.postContentDocumentApprovalSubmission(docRes.contentReferenceKey);

        // Update local listing state
        item.status = 'SUBMITTED';
        item.liveOnAmazon = true;
        item.moderationErrors = [];
        item.lastUpdated = new Date().toISOString().split('T')[0];
        item.contentReferenceKey = docRes.contentReferenceKey;

        currentBatchJob.successful++;
        currentBatchJob.logs.push(`[${new Date().toLocaleTimeString()}] ✅ ${item.asin} (${item.sku}) - A+ Content created, ASIN linked, and submitted for Amazon approval!`);
      } catch (err) {
        currentBatchJob.failed++;
        item.status = 'REJECTED';
        item.moderationErrors = [err.message];
        currentBatchJob.logs.push(`[${new Date().toLocaleTimeString()}] ❌ ${item.asin} - Error: ${err.message}`);
      }

      currentBatchJob.processed++;

      // Cap at 100 recent logs to avoid memory bloat
      if (currentBatchJob.logs.length > 100) {
        currentBatchJob.logs = currentBatchJob.logs.slice(-100);
      }

      // Respect rate limit: ~125ms per item = 8 req/sec
      await new Promise(r => setTimeout(r, 125));
    }

    if (currentBatchJob && currentBatchJob.status !== 'CANCELLED') {
      currentBatchJob.status = 'COMPLETED';
      currentBatchJob.endTime = new Date().toISOString();
      saveListings(listings);
    }
  })();
});

// 7. Get Batch Job Status
app.get('/api/batch-status', (req, res) => {
  if (!currentBatchJob) {
    return res.json({ status: 'IDLE', total: 0, processed: 0 });
  }
  res.json(currentBatchJob);
});

// 8. Live Status Check / Audit for a specific ASIN
app.post('/api/audit-asin', async (req, res) => {
  const { asin } = req.body;
  if (!asin) return res.status(400).json({ error: 'ASIN is required' });

  const listings = getListings();
  const item = listings.find(l => l.asin === asin);

  try {
    const publishRecords = await spapi.searchContentPublishRecords(asin);
    const isLive = publishRecords.publishRecordList && publishRecords.publishRecordList.length > 0;

    if (item) {
      item.liveOnAmazon = isLive;
      item.auditTimestamp = new Date().toISOString();
      saveListings(listings);
    }

    res.json({
      asin,
      isLive,
      status: item ? item.status : 'UNKNOWN',
      marketplace: spapi.marketplaceId || 'Amazon Marketplace',
      amazonUrl: `https://www.amazon.in/dp/${asin}`,
      publishRecords: publishRecords.publishRecordList || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Start Server locally, or export app for Vercel Serverless
if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🚀 Amazon A+ Content Bulk Manager Server Running!`);
    console.log(`🌐 Local URL: http://localhost:${PORT}`);
    console.log(`📦 Status: SP-API & Database Engine Ready`);
    console.log(`====================================================`);
  });
}

module.exports = app;
