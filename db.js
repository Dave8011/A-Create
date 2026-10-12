/**
 * OMS Database Client (MySQL)
 * Connects directly to the OMS database to fetch real ASINs, SKUs, and images.
 * Provides fully customizable table names, marketplace filters, category filters, and join keys.
 */

const mysql = require('mysql2/promise');

class OmsDatabase {
  constructor() {
    this.pool = null;
    this.currentConfig = {
      host: process.env.DB_HOST || '',
      port: parseInt(process.env.DB_PORT || '3306', 10),
      user: process.env.DB_USER || '',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || '',

      // Customizable Table & Filter Mapping
      amazonTable: process.env.DB_TABLE_AMAZON || '',
      productsTable: process.env.DB_TABLE_PRODUCTS || '',
      marketplaceCol: process.env.DB_MARKETPLACE_COL || '',
      marketplaceVal: process.env.DB_MARKETPLACE_VAL || '',
      categoryCol: process.env.DB_CATEGORY_COL || '',
      categoryVal: process.env.DB_CATEGORY_VAL || '',
      amzJoinKey: process.env.DB_AMZ_JOIN_KEY || '',
      prodJoinKey: process.env.DB_PROD_JOIN_KEY || '',
      joinKey: process.env.DB_JOIN_KEY || ''
    };
  }

  updateConfig(config = {}) {
    if (config.host !== undefined) this.currentConfig.host = config.host.trim();
    if (config.port !== undefined) this.currentConfig.port = parseInt(config.port, 10) || 3306;
    if (config.user !== undefined) this.currentConfig.user = config.user.trim();
    if (config.password !== undefined) this.currentConfig.password = config.password;
    if (config.database !== undefined) this.currentConfig.database = config.database.trim();

    // Customizable mappings
    if (config.amazonTable !== undefined) this.currentConfig.amazonTable = config.amazonTable.trim();
    if (config.productsTable !== undefined) this.currentConfig.productsTable = config.productsTable.trim();
    if (config.marketplaceCol !== undefined) this.currentConfig.marketplaceCol = config.marketplaceCol.trim();
    if (config.marketplaceVal !== undefined) this.currentConfig.marketplaceVal = config.marketplaceVal.trim();
    if (config.categoryCol !== undefined) this.currentConfig.categoryCol = config.categoryCol.trim();
    if (config.categoryVal !== undefined) this.currentConfig.categoryVal = config.categoryVal.trim();
    if (config.amzJoinKey !== undefined) this.currentConfig.amzJoinKey = config.amzJoinKey.trim();
    if (config.prodJoinKey !== undefined) this.currentConfig.prodJoinKey = config.prodJoinKey.trim();
    if (config.joinKey !== undefined) this.currentConfig.joinKey = config.joinKey.trim();

    // Reset pool on connection config change
    if (this.pool) {
      this.pool.end().catch(() => {});
      this.pool = null;
    }
  }

  getConfigSummary() {
    return {
      host: this.currentConfig.host || '',
      port: this.currentConfig.port || 3306,
      user: this.currentConfig.user || '',
      database: this.currentConfig.database || '',
      hasPassword: Boolean(this.currentConfig.password),
      isConfigured: Boolean(this.currentConfig.host && this.currentConfig.user && this.currentConfig.database),
      
      // Customizable mappings
      amazonTable: this.currentConfig.amazonTable,
      productsTable: this.currentConfig.productsTable,
      marketplaceCol: this.currentConfig.marketplaceCol,
      marketplaceVal: this.currentConfig.marketplaceVal,
      categoryCol: this.currentConfig.categoryCol,
      categoryVal: this.currentConfig.categoryVal,
      amzJoinKey: this.currentConfig.amzJoinKey,
      prodJoinKey: this.currentConfig.prodJoinKey,
      joinKey: this.currentConfig.joinKey
    };
  }

  getPool(customCreds = null) {
    const creds = customCreds || this.currentConfig;
    if (!creds.host || !creds.user || !creds.database) {
      throw new Error('Database credentials incomplete. Please configure DB Host, Database Name, and Username in Settings.');
    }

    if (!this.pool || customCreds) {
      if (this.pool && !customCreds) return this.pool;

      const newPool = mysql.createPool({
        host: creds.host,
        port: parseInt(creds.port || 3306, 10),
        user: creds.user,
        password: creds.password || '',
        database: creds.database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        connectTimeout: 10000
      });

      if (!customCreds) {
        this.pool = newPool;
      }
      return newPool;
    }
    return this.pool;
  }

  /**
   * Test connection to the OMS MySQL Database and list available tables.
   * Can accept transient credentials from the form directly without saving first!
   */
  async testConnection(creds = {}) {
    const host = (creds.host || this.currentConfig.host || '').trim();
    const port = parseInt(creds.port || this.currentConfig.port || 3306, 10);
    const user = (creds.user || this.currentConfig.user || '').trim();
    const password = (creds.password !== undefined && creds.password !== '') ? creds.password : this.currentConfig.password;
    const database = (creds.database || this.currentConfig.database || '').trim();

    if (!host || !user || !database) {
      return {
        success: false,
        message: 'Database credentials incomplete. Please fill in DB Host, Database Name, and Username in the fields above.'
      };
    }

    let tempConn = null;
    try {
      tempConn = await mysql.createConnection({
        host,
        port,
        user,
        password: password || '',
        database,
        connectTimeout: 12000
      });

      await tempConn.query('SELECT 1 AS ping');
      
      // Fetch all tables in database
      const [tables] = await tempConn.query('SHOW TABLES');
      const tableNames = tables.map(t => Object.values(t)[0]);

      // Cache active connection credentials in memory so subsequent sync requests can use them
      this.currentConfig.host = host;
      this.currentConfig.port = port;
      this.currentConfig.user = user;
      this.currentConfig.password = password;
      this.currentConfig.database = database;
      if (this.pool) {
        this.pool.end().catch(() => {});
        this.pool = null;
      }

      return {
        success: true,
        message: `Successfully connected to MySQL database '${database}' on ${host}!`,
        tables: tableNames
      };
    } catch (err) {
      return {
        success: false,
        message: `Database Connection Failed: ${err.message}`
      };
    } finally {
      if (tempConn) {
        await tempConn.end().catch(() => {});
      }
    }
  }

  /**
   * Introspect table columns to detect exact column names
   */
  async getTableColumns(connection, tableName) {
    try {
      const [cols] = await connection.query(`SHOW COLUMNS FROM \`${tableName}\``);
      return cols.map(c => c.Field);
    } catch (err) {
      console.warn(`Could not inspect table ${tableName}: ${err.message}`);
      return [];
    }
  }

  /**
   * Get columns for a specific table using active pool or provided credentials
   */
  async getColumnsForTable(tableName, creds = {}) {
    const host = (creds.host || this.currentConfig.host || '').trim();
    const port = parseInt(creds.port || this.currentConfig.port || 3306, 10);
    const user = (creds.user || this.currentConfig.user || '').trim();
    const password = (creds.password !== undefined && creds.password !== '') ? creds.password : this.currentConfig.password;
    const database = (creds.database || this.currentConfig.database || '').trim();

    if (!host || !user || !database || !tableName) {
      return { success: false, columns: [] };
    }

    let tempConn = null;
    try {
      tempConn = await mysql.createConnection({
        host,
        port,
        user,
        password: password || '',
        database,
        connectTimeout: 10000
      });

      const cols = await this.getTableColumns(tempConn, tableName);
      return { success: true, columns: cols };
    } catch (err) {
      return { success: false, error: err.message, columns: [] };
    } finally {
      if (tempConn) await tempConn.end().catch(() => {});
    }
  }

  /**
   * Fetch real listings using the configured or custom tables and filter options
   * Intelligently auto-detects join and identity columns so 'Unknown column' errors never occur!
   */
  async fetchPTFSListings(options = {}) {
    // If credentials are provided in request body, temporarily apply them
    if (options.host && options.user && options.database) {
      this.updateConfig({
        host: options.host,
        port: options.port,
        user: options.user,
        password: (options.password !== undefined && options.password !== '') ? options.password : this.currentConfig.password,
        database: options.database
      });
    }

    const pool = this.getPool();
    const connection = await pool.getConnection();

    const amazonTable = (options.amazonTable || this.currentConfig.amazonTable || '').trim();
    const productsTable = (options.productsTable || this.currentConfig.productsTable || '').trim();
    const marketplaceCol = (options.marketplaceCol || this.currentConfig.marketplaceCol || '').trim();
    const marketplaceVal = (options.marketplaceVal || this.currentConfig.marketplaceVal || '').trim();
    const categoryCol = (options.categoryCol || this.currentConfig.categoryCol || '').trim();
    const categoryVal = (options.categoryVal || this.currentConfig.categoryVal || '').trim();
    const amzJoinKey = (options.amzJoinKey || options.joinKey || this.currentConfig.amzJoinKey || '').trim();
    const prodJoinKey = (options.prodJoinKey || options.joinKey || this.currentConfig.prodJoinKey || '').trim();

    if (!amazonTable || !productsTable) {
      throw new Error('Please select both your Amazon listing table and Products master table.');
    }

    try {
      // 1. Inspect exact columns of both tables
      const amzCols = await this.getTableColumns(connection, amazonTable);
      const prodCols = await this.getTableColumns(connection, productsTable);

      if (amzCols.length === 0) {
        throw new Error(`Table '${amazonTable}' not found or has no columns in database '${this.currentConfig.database}'.`);
      }
      if (prodCols.length === 0) {
        throw new Error(`Table '${productsTable}' not found or has no columns in database '${this.currentConfig.database}'.`);
      }

      // 1. Detect ASIN column in amazonTable
      const asinCandidates = ['asin', 'amazon_asin', 'asin_number', 'asin_code'];
      const asinCol = amzCols.find(c => asinCandidates.includes(c.toLowerCase())) 
        || amzCols.find(c => c.toLowerCase().includes('asin'))
        || amzCols[0];

      // 2. Detect SKU column in Amazon table (for display)
      const skuCandidates = [
        'amazon_sku', 'seller_sku', 'sellersku', 'seller_sku_code', 'sku', 'sku_code', 
        'item_sku', 'product_sku', 'channel_sku', 'merchant_sku'
      ];
      const actualAmzSkuCol = amzCols.find(c => skuCandidates.includes(c.toLowerCase()))
        || amzCols.find(c => c.toLowerCase().includes('sku'))
        || asinCol;

      // 3. Detect Join Columns
      let actualAmzJoinCol = null;
      let actualProdJoinCol = null;

      if (amzJoinKey && amzCols.some(c => c.toLowerCase() === amzJoinKey.toLowerCase())) {
        actualAmzJoinCol = amzCols.find(c => c.toLowerCase() === amzJoinKey.toLowerCase());
      }
      if (prodJoinKey && prodCols.some(c => c.toLowerCase() === prodJoinKey.toLowerCase())) {
        actualProdJoinCol = prodCols.find(c => c.toLowerCase() === prodJoinKey.toLowerCase());
      }

      // If join keys not specified or not matched, use intelligent heuristic:
      if (!actualAmzJoinCol || !actualProdJoinCol) {
        const amzProdId = amzCols.find(c => ['product_id', 'productid', 'prod_id', 'id'].includes(c.toLowerCase()));
        const prodProdId = prodCols.find(c => ['productid', 'product_id', 'id'].includes(c.toLowerCase()));
        if (amzProdId && prodProdId) {
          actualAmzJoinCol = actualAmzJoinCol || amzProdId;
          actualProdJoinCol = actualProdJoinCol || prodProdId;
        } else {
          actualAmzJoinCol = actualAmzJoinCol || actualAmzSkuCol;
          actualProdJoinCol = actualProdJoinCol || prodCols.find(c => ['prodcode', 'sku', 'product_sku', 'sku_code'].includes(c.toLowerCase())) || prodCols[0];
        }
      }

      // 4. Detect Title column in products table (e.g. prodname)
      let titleColExpression = `'Product'`;
      const titleCandidates = ['prodname', 'title', 'product_name', 'name', 'item_name', 'product_title', 'description'];
      const prodTitle = prodCols.find(c => titleCandidates.includes(c.toLowerCase()));
      const amzTitle = amzCols.find(c => titleCandidates.includes(c.toLowerCase()));
      if (prodTitle) {
        titleColExpression = `p.\`${prodTitle}\``;
      } else if (amzTitle) {
        titleColExpression = `a.\`${amzTitle}\``;
      } else {
        titleColExpression = `a.\`${actualAmzSkuCol}\``;
      }

      // 5. Detect Image column in products or amazon table
      const imageCandidates = ['amazonimageurls', 'imageurls', 'images', 'image_url', 'image', 'photo'];
      const prodImageCol = prodCols.find(c => imageCandidates.includes(c.toLowerCase()))
        || prodCols.find(c => c.toLowerCase().includes('image'));
      const amzImageCol = amzCols.find(c => imageCandidates.includes(c.toLowerCase()))
        || amzCols.find(c => c.toLowerCase().includes('image'));

      // 6. Filters
      let whereClauses = [];
      let params = [];

      // Check marketplace filter
      if (marketplaceCol && marketplaceVal) {
        const actualMarketplaceCol = amzCols.find(c => c.toLowerCase() === marketplaceCol.toLowerCase());
        if (actualMarketplaceCol) {
          whereClauses.push(`a.\`${actualMarketplaceCol}\` = ?`);
          params.push(marketplaceVal);
        }
      }

      // Check category filter
      if (categoryCol && categoryVal) {
        let actualCategoryCol = prodCols.find(c => c.toLowerCase() === categoryCol.toLowerCase());
        if (!actualCategoryCol && categoryCol.toLowerCase() === 'category') {
          actualCategoryCol = prodCols.find(c => ['product_classification', 'category', 'prodtype', 'cat_id'].includes(c.toLowerCase()));
        }
        if (actualCategoryCol) {
          whereClauses.push(`p.\`${actualCategoryCol}\` = ?`);
          params.push(categoryVal);
        }
      }

      const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // Efficient SELECT: Avoid Cartesian text explosion
      const selectFields = [
        `a.\`${asinCol}\` AS asin`,
        `a.\`${actualAmzSkuCol}\` AS sku`,
        `${titleColExpression} AS title`
      ];
      if (prodImageCol) selectFields.push(`p.\`${prodImageCol}\` AS prod_images`);
      if (amzImageCol) selectFields.push(`a.\`${amzImageCol}\` AS amz_images`);

      const sql = `
        SELECT 
          ${selectFields.join(',\n          ')}
        FROM \`${amazonTable}\` a
        INNER JOIN \`${productsTable}\` p ON a.\`${actualAmzJoinCol}\` = p.\`${actualProdJoinCol}\`
        ${whereSql}
        LIMIT 5000
      `;

      const [rows] = await connection.query(sql, params);

      // Diagnostic message if 0 rows returned
      let diagnosticMsg = null;
      if (rows.length === 0) {
        const [amzCheck] = await connection.query(`SELECT COUNT(*) AS total FROM \`${amazonTable}\``);
        const [prodCheck] = await connection.query(`SELECT COUNT(*) AS total FROM \`${productsTable}\``);
        diagnosticMsg = `Found ${amzCheck[0].total} rows in ${amazonTable} and ${prodCheck[0].total} rows in ${productsTable}, but 0 matched the join (${amazonTable}.${actualAmzJoinCol} = ${productsTable}.${actualProdJoinCol}) with filters.`;
      }

      // 7. Format into clean listing objects
      const formattedListings = rows.map((row, index) => {
        // Extract images from image columns (supports pipe | separation)
        const rawImages = (row.prod_images || '') + '|' + (row.amz_images || '');
        const images = [];
        if (rawImages) {
          const parts = rawImages.split(/[|\r\n,]+/).map(u => u.trim());
          for (const u of parts) {
            if (u.startsWith('http') && !images.includes(u)) {
              images.push(u);
            }
          }
        }

        return {
          id: index + 1,
          asin: row.asin || `ASIN-${index + 1}`,
          sku: row.sku || `SKU-${index + 1}`,
          title: row.title || `Product ${row.sku || index + 1}`,
          category: categoryVal || 'Catalog',
          templateType: '7_SLIDE_STACK',
          slideCount: 7,
          status: 'DRAFT',
          liveOnAmazon: false,
          moderationErrors: [],
          moderationWarnings: [],
          images: images,
          contentReferenceKey: null,
          lastUpdated: new Date().toISOString().split('T')[0],
          auditTimestamp: null
        };
      });

      return {
        success: true,
        count: formattedListings.length,
        items: formattedListings,
        queryInfo: {
          amazonTable,
          productsTable,
          amazonSkuCol: actualAmzJoinCol,
          productsSkuCol: actualProdJoinCol,
          marketplaceFilter: marketplaceCol ? `${marketplaceCol} = '${marketplaceVal}'` : 'None',
          categoryFilter: categoryCol ? `${categoryCol} = '${categoryVal}'` : 'None',
          joinCondition: `${amazonTable}.${actualAmzJoinCol} = ${productsTable}.${actualProdJoinCol}`,
          diagnostics: diagnosticMsg
        }
      };
    } finally {
      connection.release();
    }
  }
}

const omsDb = new OmsDatabase();

module.exports = {
  omsDb,
  OmsDatabase
};
