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

class SpApiClient {
  constructor(config = {}) {
    // Support EU_* environment variables first, falling back to standard SP_API_* names
    this.clientId = (config.clientId || process.env.EU_SELLING_PARTNER_APP_CLIENT_ID || process.env.SP_API_CLIENT_ID || '').trim();
    this.clientSecret = (config.clientSecret || process.env.EU_SELLING_PARTNER_APP_CLIENT_SECRET || process.env.SP_API_CLIENT_SECRET || '').trim();
    this.refreshToken = (config.refreshToken || process.env.EU_REFRESH_TOKEN || process.env.SP_API_REFRESH_TOKEN || '').trim();
    this.sellerId = (config.sellerId || process.env.EU_SELLER_ID || process.env.SELLER_ID || '').trim();
    this.awsRegion = (config.awsRegion || process.env.EU_AWS_REGION || process.env.AWS_REGION || 'eu-west-1').trim();
    this.marketplaceId = (config.marketplaceId || process.env.EU_MARKETPLACE_ID || process.env.SP_API_MARKETPLACE_ID || INDIA_MARKETPLACE_ID).trim();
    
    this.endpoint = config.endpoint || REGION_BY_AWS_REGION[this.awsRegion.toLowerCase()] || REGIONS.eu;
    this.isSandbox = config.isSandbox !== undefined ? config.isSandbox : (process.env.SP_API_SANDBOX === 'true' || (process.env.SP_API_SANDBOX !== 'false' && !this.clientId));

    this.cachedToken = null;
    this.tokenExpiresAt = 0;
  }

  updateConfig(config = {}) {
    if (config.clientId !== undefined) this.clientId = config.clientId.trim();
    if (config.clientSecret !== undefined && config.clientSecret !== '') this.clientSecret = config.clientSecret.trim();
    if (config.refreshToken !== undefined && config.refreshToken !== '') this.refreshToken = config.refreshToken.trim();
    if (config.sellerId !== undefined) this.sellerId = config.sellerId.trim();
    if (config.awsRegion !== undefined) {
      this.awsRegion = config.awsRegion.trim();
      this.endpoint = REGION_BY_AWS_REGION[this.awsRegion.toLowerCase()] || REGIONS.eu;
    }
    if (config.marketplaceId !== undefined && config.marketplaceId !== '') this.marketplaceId = config.marketplaceId.trim();
    if (config.endpoint !== undefined) this.endpoint = config.endpoint;
    if (config.isSandbox !== undefined) this.isSandbox = config.isSandbox;
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
   * Fetch LWA (Login with Amazon) Access Token with caching
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

    try {
      // Primary LWA token endpoint: https://api.amazon.com/auth/o2/token
      const lwaEndpoint = 'https://api.amazon.com/auth/o2/token';
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
      // Security: never echo or log err.config (which contains client_secret and refresh_token in request body)
      const errorDesc = err.response?.data?.error_description;
      const errCode = err.response?.data?.error;
      let msg = errorDesc ? `${errorDesc} (${errCode || 'OAuth Error'})` : (errCode || err.message);
      if (err.response?.status) {
        msg = `HTTP ${err.response.status}: ${msg}`;
      }
      throw new Error(`Amazon LWA Authentication failed: ${msg}`);
    }
  }

  /**
   * Test connection to Amazon SP-API
   */
  async testConnection() {
    if (this.isSandbox && !this.clientId) {
      return {
        success: true,
        mode: 'sandbox',
        message: 'Sandbox / Simulation mode is active. Ready to simulate workflows without live credentials.'
      };
    }

    await this.getAccessToken();
    return {
      success: true,
      mode: 'live',
      message: 'Successfully authenticated with Amazon LWA! SP-API credentials are valid and active.'
    };
  }

  /**
   * Request an image upload destination
   * In SP-API, this provides an S3 pre-signed URL and an uploadDestinationId
   */
  async createUploadDestination(imageContentType = 'image/jpeg') {
    if (this.isSandbox) {
      const mockId = 'dest_' + Math.random().toString(36).substring(2, 12);
      return {
        uploadDestinationId: mockId,
        url: `https://amazon-spapi-mock-upload.s3.amazonaws.com/aplus/${mockId}`,
        headers: { 'Content-Type': imageContentType }
      };
    }

    const token = await this.getAccessToken();
    const response = await axios.post(
      `${this.endpoint}/uploads/2020-11-01/uploadDestinations/aplus/content`,
      {
        resource: 'aplus/content',
        contentType: imageContentType
      },
      {
        headers: {
          'x-amz-access-token': token,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data.payload;
  }

  /**
   * Upload binary image to Amazon's pre-signed destination
   */
  async uploadImageBinary(uploadUrl, imageBuffer, contentType = 'image/jpeg') {
    if (this.isSandbox) {
      // Simulate network upload latency
      await new Promise(r => setTimeout(r, 120));
      return { success: true };
    }

    await axios.put(uploadUrl, imageBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': imageBuffer.length
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    return { success: true };
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
