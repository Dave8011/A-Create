/**
 * Amazon Selling Partner API (SP-API) Client
 * Handles A+ Content Management API (v2020-11-01), LWA Authentication,
 * S3 Upload Destinations, and Status Verification for amazon.in (Marketplace: "").
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Default Amazon SP-API regional endpoints
const REGIONS = {
  eu: 'https://sellingpartnerapi-eu.amazon.com', // Covers Europe & India (amazon.in)
  na: 'https://sellingpartnerapi-na.amazon.com', // North America
  fe: 'https://sellingpartnerapi-fe.amazon.com'  // Far East
};

const REGION_BY_AWS_REGION = {
  'eu-west-1': REGIONS.eu,
  'eu': REGIONS.eu,
  'us-east-1': REGIONS.na,
  'na': REGIONS.na,
  'us-west-2': REGIONS.fe,
  'fe': REGIONS.fe
};

const KNOWN_MARKETPLACES = {
  'A21TJRUUN4KGV': 'Amazon India (amazon.in)',
  'A1F83G8C2ARO7P': 'Amazon UK (amazon.co.uk)',
  'A1PA6795UKMFR9': 'Amazon Germany (amazon.de)',
  'A13V1IB3VIYZZH': 'Amazon France (amazon.fr)',
  'APJ6JRA9NG5V4': 'Amazon Italy (amazon.it)',
  'A1RKKUPIHCS9HS': 'Amazon Spain (amazon.es)',
  'A1805IZSGTT6HS': 'Amazon Netherlands (amazon.nl)',
  'A2NODRKZP88ZB9': 'Amazon Sweden (amazon.se)',
  'A1C3SOZRARQ6R3': 'Amazon Poland (amazon.pl)',
  'ATVPDKIKX0DER': 'Amazon US (amazon.com)',
  'A2EUQ1WTGCTBG2': 'Amazon Canada (amazon.ca)',
  'A1AM78C64UM0Y8': 'Amazon Mexico (amazon.com.mx)',
  'A1VC38T7YXB528': 'Amazon Japan (amazon.co.jp)',
  'A39IBJ37TRP1C6': 'Amazon Australia (amazon.com.au)'
};

const INDIA_MARKETPLACE_ID = 'A21TJRUUN4KGV';

function cleanValue(val) {
  if (!val || typeof val !== 'string') return '';
  let str = val.trim();
  if ((str.startsWith("'") && str.endsWith("'")) || (str.startsWith('"') && str.endsWith('"'))) {
    str = str.slice(1, -1).trim();
  }
  return str;
}

function createMinimalJpeg(width = 970, height = 600) {
  const wHigh = (width >> 8) & 0xff;
  const wLow = width & 0xff;
  const hHigh = (height >> 8) & 0xff;
  const hLow = height & 0xff;

  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xdb, 0x00, 0x43, 0x00,
    ...new Array(64).fill(1),
    0xff, 0xc0, 0x00, 0x11, 0x08, hHigh, hLow, wHigh, wLow, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
    0xff, 0xda, 0x00, 0x0c, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3f, 0x00,
    0x00,
    0xff, 0xd9
  ]);
}

class SpApiClient {
  constructor(config = {}) {
    // Support EU_* environment variables first, falling back to standard SP_API_* names
    this.clientId = cleanValue(config.clientId || process.env.EU_SELLING_PARTNER_APP_CLIENT_ID || process.env.SP_API_CLIENT_ID);
    this.clientSecret = cleanValue(config.clientSecret || process.env.EU_SELLING_PARTNER_APP_CLIENT_SECRET || process.env.SP_API_CLIENT_SECRET);
    this.refreshToken = cleanValue(config.refreshToken || process.env.EU_REFRESH_TOKEN || process.env.SP_API_REFRESH_TOKEN);
    this.sellerId = cleanValue(config.sellerId || process.env.EU_SELLER_ID || process.env.SELLER_ID);
    this.awsRegion = cleanValue(config.awsRegion || process.env.EU_AWS_REGION || process.env.AWS_REGION || 'eu-west-1');
    this.marketplaceId = cleanValue(config.marketplaceId || process.env.EU_MARKETPLACE_ID || process.env.SP_API_MARKETPLACE_ID || INDIA_MARKETPLACE_ID);
    
    this.endpoint = config.endpoint || REGION_BY_AWS_REGION[this.awsRegion.toLowerCase()] || REGIONS.eu;
    this.isSandbox = config.isSandbox !== undefined ? config.isSandbox : (process.env.SP_API_SANDBOX === 'true' || (process.env.SP_API_SANDBOX !== 'false' && !this.clientId));

    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }

  updateConfig(config = {}) {
    if (config.clientId !== undefined && config.clientId !== '') this.clientId = cleanValue(config.clientId);
    if (config.clientSecret !== undefined && config.clientSecret !== '') this.clientSecret = cleanValue(config.clientSecret);
    if (config.refreshToken !== undefined && config.refreshToken !== '') this.refreshToken = cleanValue(config.refreshToken);
    if (config.sellerId !== undefined && config.sellerId !== '') this.sellerId = cleanValue(config.sellerId);
    if (config.awsRegion !== undefined && config.awsRegion !== '') {
      this.awsRegion = cleanValue(config.awsRegion);
      this.endpoint = REGION_BY_AWS_REGION[this.awsRegion.toLowerCase()] || REGIONS.eu;
    }
    if (config.marketplaceId !== undefined && config.marketplaceId !== '') this.marketplaceId = cleanValue(config.marketplaceId);
    if (config.endpoint !== undefined && config.endpoint !== '') this.endpoint = config.endpoint;
    if (config.isSandbox !== undefined) this.isSandbox = Boolean(config.isSandbox);
    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }

  getConfigSummary() {
    return {
      configured: Boolean(this.clientId && this.clientSecret && this.refreshToken),
      clientIdMasked: this.clientId ? `${this.clientId.slice(0, 8)}...${this.clientId.slice(-4)}` : 'Not Set',
      sellerIdMasked: this.sellerId ? `${this.sellerId.slice(0, 4)}...${this.sellerId.slice(-3)}` : 'Not Set',
      awsRegion: this.awsRegion || 'eu-west-1',
      marketplaceId: this.marketplaceId || INDIA_MARKETPLACE_ID,
      marketplaceName: KNOWN_MARKETPLACES[this.marketplaceId] || (this.marketplaceId === INDIA_MARKETPLACE_ID ? 'Amazon India (amazon.in)' : this.marketplaceId),
      endpoint: this.endpoint,
      isSandbox: this.isSandbox
    };
  }

  /**
   * Fetch LWA (Login with Amazon) Access Token with caching and multi-endpoint fallback
   */
  async getAccessToken() {
    if (this.isSandbox && !this.clientId) {
      return 'mock-sandbox-access-token-' + Date.now();
    }

    if (this.cachedToken && Date.now() < this.tokenExpiresAt - 60000) {
      return this.cachedToken;
    }

    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error('SP-API credentials missing. Please configure Client ID (EU_SELLING_PARTNER_APP_CLIENT_ID), Client Secret, and Refresh Token (EU_REFRESH_TOKEN) in Settings.');
    }

    // Candidate Amazon LWA token endpoints (Primary global and regional EU fallback)
    const lwaEndpoints = [
      'https://api.amazon.com/auth/o2/token',
      'https://api.amazon.co.uk/auth/o2/token'
    ];

    let lastError = null;

    for (const lwaEndpoint of lwaEndpoints) {
      try {
        const response = await axios.post(
          lwaEndpoint,
          new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: this.clientId,
            client_secret: this.clientSecret,
            refresh_token: this.refreshToken
          }).toString(),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
            timeout: 10000
          }
        );

        this.cachedToken = response.data.access_token;
        this.tokenExpiresAt = Date.now() + (response.data.expires_in || 3600) * 1000;
        return this.cachedToken;
      } catch (err) {
        lastError = err;
        // If Amazon LWA explicitly returns 400, 401, or 403 with an OAuth error, it reached the server;
        // don't mask the error by trying another endpoint unless it was a 404 or network error
        if (err.response && [400, 401, 403].includes(err.response.status)) {
          break;
        }
      }
    }

    // Security: never echo or log err.config (which contains client_secret and refresh_token in request body)
    const errorDesc = lastError?.response?.data?.error_description;
    const errCode = lastError?.response?.data?.error;
    let msg = errorDesc ? `${errorDesc} (${errCode || 'OAuth Error'})` : (errCode || lastError?.message || 'Authentication failed');
    if (lastError?.response?.status) {
      msg = `HTTP ${lastError.response.status}: ${msg}`;
    }
    throw new Error(`Amazon LWA Authentication failed: ${msg}`);
  }

  /**
   * Test connection to Amazon SP-API
   * Supports testing ad-hoc config without overwriting active credentials unless valid
   */
  async testConnection(customConfig = null) {
    let clientToTest = this;
    if (customConfig && typeof customConfig === 'object') {
      const mergedConfig = {
        clientId: cleanValue(customConfig.clientId) || this.clientId,
        clientSecret: cleanValue(customConfig.clientSecret) || this.clientSecret,
        refreshToken: cleanValue(customConfig.refreshToken) || this.refreshToken,
        sellerId: cleanValue(customConfig.sellerId) || this.sellerId,
        awsRegion: cleanValue(customConfig.awsRegion) || this.awsRegion,
        marketplaceId: cleanValue(customConfig.marketplaceId) || this.marketplaceId,
        isSandbox: customConfig.isSandbox !== undefined ? customConfig.isSandbox : this.isSandbox
      };
      clientToTest = new SpApiClient(mergedConfig);
    }

    if (clientToTest.isSandbox && !clientToTest.clientId) {
      return {
        success: true,
        mode: 'sandbox',
        message: 'Sandbox / Simulation mode is active. Ready to simulate workflows without live credentials.'
      };
    }

    await clientToTest.getAccessToken();

    // If ad-hoc config was passed and successfully authenticated, sync active client
    if (customConfig && clientToTest !== this) {
      this.updateConfig(customConfig);
    }

    return {
      success: true,
      mode: 'live',
      message: 'Successfully authenticated with Amazon LWA! SP-API credentials are valid and active.'
    };
  }

  /**
   * Request an image upload destination
   * Follows official SP-API Uploads API (v2020-11-01) for resource 'aplus/2020-11-01/contentDocuments'
   * Calculates contentMD5, calls uploadDestinations, and uploads binary to pre-signed S3 URL
   */
  async createUploadDestination(imageBuffer = null, imageContentType = 'image/jpeg') {
    if (this.isSandbox) {
      const mockId = 'dest_' + Math.random().toString(36).substring(2, 12);
      return {
        uploadDestinationId: mockId,
        url: `https://amazon-spapi-mock-upload.s3.amazonaws.com/aplus/${mockId}`,
        headers: { 'Content-Type': imageContentType }
      };
    }

    const token = await this.getAccessToken();
    const crypto = require('crypto');
    const buf = (imageBuffer && Buffer.isBuffer(imageBuffer) && imageBuffer.length > 0)
      ? imageBuffer
      : createMinimalJpeg(970, 600);
    const md5 = crypto.createHash('md5').update(buf).digest('base64');

    const resource = encodeURIComponent('aplus/2020-11-01/contentDocuments');
    const params = new URLSearchParams();
    params.set('marketplaceIds', this.marketplaceId);
    params.set('contentMD5', md5);
    if (imageContentType) {
      params.set('contentType', imageContentType);
    }

    try {
      const response = await axios.post(
        `${this.endpoint}/uploads/2020-11-01/uploadDestinations/${resource}?${params.toString()}`,
        null,
        {
          headers: {
            'x-amz-access-token': token
          }
        }
      );

      const payload = response.data.payload || response.data;
      if (payload.url) {
        await this.uploadImageBinary(payload.url, buf, payload.headers || { 'Content-Type': imageContentType });
      }

      return payload;
    } catch (err) {
      let errorMsg = err.message;
      if (err.response?.data) {
        if (err.response.data.errors && Array.isArray(err.response.data.errors)) {
          errorMsg = err.response.data.errors.map(e => `${e.code || ''}: ${e.message || ''} ${e.details || ''}`.trim()).join('; ');
        } else if (err.response.data.message) {
          errorMsg = err.response.data.message;
        } else {
          try { errorMsg = JSON.stringify(err.response.data); } catch (_) {}
        }
      }
      throw new Error(`Amazon Upload Destination creation failed: ${errorMsg}`);
    }
  }

  /**
   * Upload binary image to Amazon's pre-signed destination
   */
  async uploadImageBinary(uploadUrl, imageBuffer, headers = {}) {
    if (this.isSandbox) {
      // Simulate network upload latency
      await new Promise(r => setTimeout(r, 120));
      return { success: true };
    }

    let putHeaders = {};
    if (headers && typeof headers === 'object') {
      if (Array.isArray(headers)) {
        headers.forEach(h => {
          if (h && h.name) putHeaders[h.name] = h.value;
        });
      } else {
        Object.assign(putHeaders, headers);
      }
    }
    putHeaders['Content-Length'] = imageBuffer.length;
    // S3 pre-signed URLs must not carry SP-API auth tokens
    delete putHeaders['x-amz-access-token'];
    delete putHeaders['Authorization'];

    try {
      await axios.put(uploadUrl, imageBuffer, {
        headers: putHeaders,
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });
      return { success: true };
    } catch (err) {
      const s3Msg = err.response?.data ? String(err.response.data) : err.message;
      throw new Error(`Amazon S3 image upload failed: ${s3Msg}`);
    }
  }

  /**
   * Create A+ Content Document in Amazon SP-API
   * Operation: createContentDocument
   */
  async createContentDocument(contentDocumentPayload) {
    if (this.isSandbox) {
      await new Promise(r => setTimeout(r, 180));
      const refKey = 'aplus_ref_' + Math.random().toString(36).substring(2, 10);
      return {
        contentReferenceKey: refKey,
        status: 'SUBMITTED',
        message: 'A+ Content document created successfully in Amazon SP-API sandbox.'
      };
    }

    const token = await this.getAccessToken();
    try {
      const response = await axios.post(
        `${this.endpoint}/aplus/2020-11-01/contentDocuments?marketplaceId=${this.marketplaceId}`,
        contentDocumentPayload,
        {
          headers: {
            'x-amz-access-token': token,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (err) {
      const msg = err.response?.data?.errors?.[0]?.message || err.response?.data?.message || err.message;
      throw new Error(`Amazon createContentDocument failed: ${msg}`);
    }
  }

  /**
   * Update ASIN relations for A+ Content Document
   * Operation: postContentDocumentAsinRelations
   * Note: This replaces all previous ASIN associations for this document.
   */
  async postContentDocumentAsinRelations(contentReferenceKey, asinSet = []) {
    if (this.isSandbox) {
      await new Promise(r => setTimeout(r, 150));
      return {
        contentReferenceKey,
        asinSet,
        status: 'LINKED',
        marketplaceId: this.marketplaceId
      };
    }

    const token = await this.getAccessToken();
    try {
      const response = await axios.post(
        `${this.endpoint}/aplus/2020-11-01/contentDocuments/${contentReferenceKey}/asins?marketplaceId=${this.marketplaceId}`,
        { asinSet },
        {
          headers: {
            'x-amz-access-token': token,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (err) {
      const msg = err.response?.data?.errors?.[0]?.message || err.response?.data?.message || err.message;
      throw new Error(`Amazon postContentDocumentAsinRelations failed: ${msg}`);
    }
  }

  /**
   * Get Content Document status & moderation errors
   * Operation: getContentDocument
   */
  async getContentDocument(contentReferenceKey) {
    if (this.isSandbox) {
      return {
        contentReferenceKey,
        contentStatus: 'APPROVED',
        contentBadgeSet: ['STANDARD'],
        asinRelations: ['B08N5WRWNW']
      };
    }

    const token = await this.getAccessToken();
    const response = await axios.get(
      `${this.endpoint}/aplus/2020-11-01/contentDocuments/${contentReferenceKey}?marketplaceId=${this.marketplaceId}&includedDataSet=METADATA&includedDataSet=CONTENTS`,
      {
        headers: { 'x-amz-access-token': token }
      }
    );

    return response.data.contentRecord;
  }

  /**
   * Search all A+ Content Documents in Seller account
   * Operation: searchContentDocuments
   */
  async searchContentDocuments(pageToken = null) {
    if (this.isSandbox) {
      return {
        contentDocumentMetadataRecordList: [
          {
            contentReferenceKey: 'ref_doc_sample1',
            name: 'Certified Organic Fennel Seed (Saunf)',
            contentType: 'EBC',
            contentSubType: 'STANDARD',
            status: 'APPROVED',
            locale: 'en_IN',
            updateTime: new Date().toISOString()
          }
        ]
      };
    }

    const token = await this.getAccessToken();
    let url = `${this.endpoint}/aplus/2020-11-01/contentDocuments?marketplaceId=${this.marketplaceId}`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;

    const response = await axios.get(url, {
      headers: { 'x-amz-access-token': token }
    });

    return response.data;
  }

  /**
   * List ASINs associated with content document
   * Operation: listContentDocumentAsinRelations
   */
  async listContentDocumentAsinRelations(contentReferenceKey) {
    if (this.isSandbox) {
      return {
        asinMetadataSet: [
          { asin: 'B08N5WRWNW', title: 'Certified Organic Fennel Seed', badgeSet: ['STANDARD'] }
        ]
      };
    }

    const token = await this.getAccessToken();
    const response = await axios.get(
      `${this.endpoint}/aplus/2020-11-01/contentDocuments/${contentReferenceKey}/asins?marketplaceId=${this.marketplaceId}`,
      {
        headers: { 'x-amz-access-token': token }
      }
    );

    return response.data;
  }

  /**
   * Search publish records for an ASIN to verify if A+ is live
   * Operation: searchContentPublishRecords
   */
  async searchContentPublishRecords(asin) {
    if (this.isSandbox) {
      return {
        publishRecordList: [
          {
            contentReferenceKey: 'aplus_ref_sample',
            asin,
            marketplaceId: this.marketplaceId,
            contentSubType: 'STANDARD',
            contentType: 'A_PLUS',
            publishedAt: new Date().toISOString()
          }
        ]
      };
    }

    const token = await this.getAccessToken();
    const response = await axios.get(
      `${this.endpoint}/aplus/2020-11-01/contentPublishRecords?marketplaceId=${this.marketplaceId}&asin=${asin}`,
      {
        headers: { 'x-amz-access-token': token }
      }
    );

    return response.data;
  }

  /**
   * Submit A+ Content Document for Amazon review, moderation, and publishing
   * Operation: postContentDocumentApprovalSubmission
   */
  async postContentDocumentApprovalSubmission(contentReferenceKey) {
    if (this.isSandbox) {
      await new Promise(r => setTimeout(r, 120));
      return {
        warnings: [],
        status: 'SUBMITTED',
        message: 'A+ Content successfully submitted for Amazon review and publishing (Simulation mode).'
      };
    }

    const token = await this.getAccessToken();
    try {
      const response = await axios.post(
        `${this.endpoint}/aplus/2020-11-01/contentDocuments/${contentReferenceKey}/approvalSubmissions?marketplaceId=${this.marketplaceId}`,
        {},
        {
          headers: {
            'x-amz-access-token': token,
            'Content-Type': 'application/json'
          }
        }
      );
      return response.data;
    } catch (err) {
      const msg = err.response?.data?.errors?.[0]?.message || err.response?.data?.message || err.message;
      throw new Error(`Amazon approval submission failed: ${msg}`);
    }
  }

  /**
   * Update an existing A+ Content document
   * Operation: updateContentDocument
   */
  async updateContentDocument(contentReferenceKey, contentDocumentPayload) {
    if (this.isSandbox) {
      await new Promise(r => setTimeout(r, 150));
      return {
        contentReferenceKey,
        status: 'SUBMITTED',
        message: 'A+ Content document updated successfully in Amazon SP-API sandbox.'
      };
    }

    const token = await this.getAccessToken();
    const response = await axios.post(
      `${this.endpoint}/aplus/2020-11-01/contentDocuments/${contentReferenceKey}?marketplaceId=${this.marketplaceId}`,
      contentDocumentPayload,
      {
        headers: {
          'x-amz-access-token': token,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  }

  /**
   * Validate A+ Content document for use on a set of ASINs
   * Operation: validateContentDocumentAsinRelations
   */
  async validateContentDocumentAsinRelations(asinSet, contentDocumentPayload) {
    if (this.isSandbox) {
      return {
        warnings: [],
        errors: []
      };
    }

    const token = await this.getAccessToken();
    let url = `${this.endpoint}/aplus/2020-11-01/contentAsinValidations?marketplaceId=${this.marketplaceId}`;
    if (asinSet && asinSet.length > 0) {
      url += `&asinSet=${encodeURIComponent(asinSet.join(','))}`;
    }

    const response = await axios.post(
      url,
      contentDocumentPayload,
      {
        headers: {
          'x-amz-access-token': token,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  }

  /**
   * Suspend visible A+ Content
   * Operation: postContentDocumentSuspendSubmission
   */
  async postContentDocumentSuspendSubmission(contentReferenceKey) {
    if (this.isSandbox) {
      return { warnings: [] };
    }

    const token = await this.getAccessToken();
    const response = await axios.post(
      `${this.endpoint}/aplus/2020-11-01/contentDocuments/${contentReferenceKey}/suspendSubmissions?marketplaceId=${this.marketplaceId}`,
      {},
      {
        headers: {
          'x-amz-access-token': token,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  }

  /**
   * Build the A+ Content Document JSON for the "7-Slide Seamless Graphic Stack"
   * Constructs 7 STANDARD_HEADER_IMAGE_TEXT modules with standard 970x600 px dimensions
   */
  build7SlideContentDocument(name, asin, slides = []) {
    const MARKETPLACE_LOCALES = {
      'A21TJRUUN4KGV': 'en_IN',
      'ATVPDKIKX0DER': 'en_US',
      'A1F83G8C2ARO7P': 'en_GB',
      'A1PA6795UKMFR9': 'de_DE',
      'A13V1IB3VIYZZH': 'fr_FR',
      'APJ6JRA9NG5V4': 'it_IT',
      'A1RKKUPIHCS9HS': 'es_ES',
      'A1805IZSGTT6HS': 'nl_NL',
      'A2NODRKZP88ZB9': 'sv_SE',
      'A1C3SOZRARQ6R3': 'pl_PL',
      'A2EUQ1WTGCTBG2': 'en_CA',
      'A1AM78C64UM0Y8': 'es_MX',
      'A1VC38T7YXB528': 'ja_JP',
      'A39IBJ37TRP1C6': 'en_AU'
    };

    const targetLocale = MARKETPLACE_LOCALES[this.marketplaceId] || 'en_IN';

    const contentModuleList = slides.map((slide, index) => {
      return {
        contentModuleType: 'STANDARD_HEADER_IMAGE_TEXT',
        standardHeaderImageText: {
          headline: {
            value: slide.title || `Slide ${index + 1}`,
            decoratorSet: []
          },
          block: {
            image: {
              uploadDestinationId: slide.uploadDestinationId,
              imageCropSpecification: {
                size: {
                  width: { value: 970, units: 'pixels' },
                  height: { value: 600, units: 'pixels' }
                }
              },
              alternativeText: slide.altText || `${name || 'Product'} feature ${index + 1}`
            }
          }
        }
      };
    });

    return {
      contentDocument: {
        name: `${name || asin} - A+ Enhanced Brand Content`,
        contentType: 'EBC',
        contentSubType: 'STANDARD',
        locale: targetLocale,
        contentModuleList
      }
    };
  }
}

module.exports = {
  SpApiClient,
  INDIA_MARKETPLACE_ID,
  REGIONS
};
