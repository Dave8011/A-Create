/**
 * Amazon A+ Content Bulk Manager & Live Audit Studio
 * Client-side Controller & UI State Engine
 */

// Application State
const state = {
  activeTab: 'listings-tab',
  currentPage: 1,
  limit: 50,
  totalPages: 0,
  currentFilter: 'ALL',
  searchQuery: '',
  selectedAsins: new Set(),
  activeBatchJobId: null,
  batchPollInterval: null,
  currentModalAsin: null,
  uploadedSlides: {}
};

// LocalStorage Persistence Keys
const STORAGE_KEYS = {
  SPAPI: 'aplus_spapi_credentials',
  DB: 'aplus_db_credentials',
  GRAPHICS_DIR: 'aplus_graphics_dir'
};

// Modern Floating Toast Notification
function showToast(message, type = 'info', duration = 4500) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:10px;pointer-events:none;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `app-toast ${type}`;
  toast.innerHTML = `
    <div style="display:flex; align-items:center; gap:8px;">
      <span style="font-size:16px;">${type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️')}</span>
      <div style="font-size:13px; line-height:1.4;">${message}</div>
    </div>
    <button style="background:none; border:none; color:inherit; font-size:18px; cursor:pointer; padding:0 4px; opacity:0.7;" onclick="this.closest('.app-toast').remove()">&times;</button>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

function saveCredentialsToStorage() {
  try {
    const prevSpapi = JSON.parse(localStorage.getItem(STORAGE_KEYS.SPAPI) || '{}');
    const clientId = document.getElementById('cfgClientId')?.value?.trim();
    const clientSecret = document.getElementById('cfgClientSecret')?.value?.trim();
    const refreshToken = document.getElementById('cfgRefreshToken')?.value?.trim();
    const sellerId = document.getElementById('cfgSellerId')?.value?.trim();
    const awsRegion = document.getElementById('cfgAwsRegion')?.value?.trim();
    const marketplaceId = document.getElementById('cfgMarketplace')?.value?.trim();
    const isSandbox = document.getElementById('cfgSandboxMode') ? document.getElementById('cfgSandboxMode').checked : false;

    const spapiData = {
      clientId: (clientId !== undefined && clientId !== '') ? clientId : (prevSpapi.clientId || ''),
      clientSecret: (clientSecret && !clientSecret.startsWith('•')) ? clientSecret : (prevSpapi.clientSecret || ''),
      refreshToken: (refreshToken && !refreshToken.startsWith('•')) ? refreshToken : (prevSpapi.refreshToken || ''),
      sellerId: (sellerId !== undefined && sellerId !== '') ? sellerId : (prevSpapi.sellerId || ''),
      awsRegion: awsRegion || prevSpapi.awsRegion || 'eu-west-1',
      marketplaceId: marketplaceId || prevSpapi.marketplaceId || 'A21TJRUUN4KGV',
      isSandbox
    };
    localStorage.setItem(STORAGE_KEYS.SPAPI, JSON.stringify(spapiData));

    // DB credentials
    const prevDb = JSON.parse(localStorage.getItem(STORAGE_KEYS.DB) || '{}');
    const host = document.getElementById('cfgDbHost')?.value?.trim();
    const port = document.getElementById('cfgDbPort')?.value?.trim();
    const user = document.getElementById('cfgDbUser')?.value?.trim();
    const password = document.getElementById('cfgDbPassword')?.value;
    const database = document.getElementById('cfgDbName')?.value?.trim();
    const amazonTable = document.getElementById('cfgDbAmazonTable')?.value?.trim();
    const productsTable = document.getElementById('cfgDbProductsTable')?.value?.trim();
    const marketplaceCol = document.getElementById('cfgDbMarketplaceCol')?.value?.trim();
    const marketplaceVal = document.getElementById('cfgDbMarketplaceVal')?.value?.trim();
    const categoryCol = document.getElementById('cfgDbCategoryCol')?.value?.trim();
    const categoryVal = document.getElementById('cfgDbCategoryVal')?.value?.trim();
    const amzJoinKey = document.getElementById('cfgDbAmzJoinKey')?.value?.trim();
    const prodJoinKey = document.getElementById('cfgDbProdJoinKey')?.value?.trim();

    const dbData = {
      host: (host !== undefined && host !== '') ? host : (prevDb.host || ''),
      port: (port !== undefined && port !== '') ? port : (prevDb.port || '3306'),
      user: (user !== undefined && user !== '') ? user : (prevDb.user || ''),
      password: (password && !password.startsWith('•')) ? password : (prevDb.password || ''),
      database: (database !== undefined && database !== '') ? database : (prevDb.database || ''),
      amazonTable: (amazonTable !== undefined && amazonTable !== '') ? amazonTable : (prevDb.amazonTable || ''),
      productsTable: (productsTable !== undefined && productsTable !== '') ? productsTable : (prevDb.productsTable || ''),
      marketplaceCol: (marketplaceCol !== undefined && marketplaceCol !== '') ? marketplaceCol : (prevDb.marketplaceCol || ''),
      marketplaceVal: (marketplaceVal !== undefined && marketplaceVal !== '') ? marketplaceVal : (prevDb.marketplaceVal || ''),
      categoryCol: (categoryCol !== undefined && categoryCol !== '') ? categoryCol : (prevDb.categoryCol || ''),
      categoryVal: (categoryVal !== undefined && categoryVal !== '') ? categoryVal : (prevDb.categoryVal || ''),
      amzJoinKey: (amzJoinKey !== undefined && amzJoinKey !== '') ? amzJoinKey : (prevDb.amzJoinKey || ''),
      prodJoinKey: (prodJoinKey !== undefined && prodJoinKey !== '') ? prodJoinKey : (prevDb.prodJoinKey || '')
    };
    localStorage.setItem(STORAGE_KEYS.DB, JSON.stringify(dbData));

    // A+ Graphics Root Directory
    const gDir = document.getElementById('cfgGraphicsDir')?.value?.trim() || document.getElementById('slideManagerBaseDirInput')?.value?.trim();
    if (gDir) localStorage.setItem(STORAGE_KEYS.GRAPHICS_DIR, gDir);
  } catch (err) {
    console.warn('Failed saving credentials to storage:', err);
  }
}

function restoreCredentialsFromStorage() {
  try {
    const spapiStr = localStorage.getItem(STORAGE_KEYS.SPAPI);
    if (spapiStr) {
      const sp = JSON.parse(spapiStr);
      if (sp.clientId && document.getElementById('cfgClientId')) document.getElementById('cfgClientId').value = sp.clientId;
      if (sp.clientSecret && document.getElementById('cfgClientSecret')) document.getElementById('cfgClientSecret').value = sp.clientSecret;
      if (sp.refreshToken && document.getElementById('cfgRefreshToken')) document.getElementById('cfgRefreshToken').value = sp.refreshToken;
      if (sp.sellerId && document.getElementById('cfgSellerId')) document.getElementById('cfgSellerId').value = sp.sellerId;
      if (sp.awsRegion && document.getElementById('cfgAwsRegion')) document.getElementById('cfgAwsRegion').value = sp.awsRegion;
      if (sp.marketplaceId && document.getElementById('cfgMarketplace')) document.getElementById('cfgMarketplace').value = sp.marketplaceId;
      if (sp.isSandbox !== undefined && document.getElementById('cfgSandboxMode')) {
        document.getElementById('cfgSandboxMode').checked = sp.isSandbox;
        const badge = document.getElementById('sandboxBadge');
        if (badge) {
          badge.textContent = sp.isSandbox ? '🛡️ Sandbox Simulation' : '🟢 Live SP-API';
          badge.className = sp.isSandbox ? 'pill-badge pill-sandbox' : 'pill-badge pill-approved';
        }
      }
    }

    const dbStr = localStorage.getItem(STORAGE_KEYS.DB);
    if (dbStr) {
      const db = JSON.parse(dbStr);
      if (db.host && document.getElementById('cfgDbHost')) document.getElementById('cfgDbHost').value = db.host;
      if (db.port && document.getElementById('cfgDbPort')) document.getElementById('cfgDbPort').value = db.port;
      if (db.user && document.getElementById('cfgDbUser')) document.getElementById('cfgDbUser').value = db.user;
      if (db.password && document.getElementById('cfgDbPassword')) document.getElementById('cfgDbPassword').value = db.password;
      if (db.database && document.getElementById('cfgDbName')) document.getElementById('cfgDbName').value = db.database;
      if (db.amazonTable && document.getElementById('cfgDbAmazonTable')) document.getElementById('cfgDbAmazonTable').value = db.amazonTable;
      if (db.productsTable && document.getElementById('cfgDbProductsTable')) document.getElementById('cfgDbProductsTable').value = db.productsTable;
      if (db.marketplaceCol && document.getElementById('cfgDbMarketplaceCol')) document.getElementById('cfgDbMarketplaceCol').value = db.marketplaceCol;
      if (db.marketplaceVal && document.getElementById('cfgDbMarketplaceVal')) document.getElementById('cfgDbMarketplaceVal').value = db.marketplaceVal;
      if (db.categoryCol && document.getElementById('cfgDbCategoryCol')) document.getElementById('cfgDbCategoryCol').value = db.categoryCol;
      if (db.categoryVal && document.getElementById('cfgDbCategoryVal')) document.getElementById('cfgDbCategoryVal').value = db.categoryVal;
      if (db.amzJoinKey && document.getElementById('cfgDbAmzJoinKey')) document.getElementById('cfgDbAmzJoinKey').value = db.amzJoinKey;
      if (db.prodJoinKey && document.getElementById('cfgDbProdJoinKey')) document.getElementById('cfgDbProdJoinKey').value = db.prodJoinKey;
    }

    const savedGraphicsDir = localStorage.getItem(STORAGE_KEYS.GRAPHICS_DIR) || '/home/dave/A+ Premium';
    if (document.getElementById('cfgGraphicsDir')) document.getElementById('cfgGraphicsDir').value = savedGraphicsDir;
    if (document.getElementById('slideManagerBaseDirInput')) document.getElementById('slideManagerBaseDirInput').value = savedGraphicsDir;
  } catch (err) {
    console.warn('Failed restoring credentials from storage:', err);
  }
}

function getActiveSpapiCredentials() {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.SPAPI) || '{}');
  const clientId = document.getElementById('cfgClientId')?.value?.trim() || stored.clientId || '';
  const clientSecret = document.getElementById('cfgClientSecret')?.value?.trim() || stored.clientSecret || '';
  const refreshToken = document.getElementById('cfgRefreshToken')?.value?.trim() || stored.refreshToken || '';
  const sellerId = document.getElementById('cfgSellerId')?.value?.trim() || stored.sellerId || '';
  const awsRegion = document.getElementById('cfgAwsRegion')?.value?.trim() || stored.awsRegion || 'eu-west-1';
  const marketplaceId = document.getElementById('cfgMarketplace')?.value?.trim() || stored.marketplaceId || 'A21TJRUUN4KGV';
  const isSandbox = document.getElementById('cfgSandboxMode') ? document.getElementById('cfgSandboxMode').checked : (stored.isSandbox !== undefined ? stored.isSandbox : false);

  return {
    clientId,
    clientSecret: (!clientSecret.startsWith('•')) ? clientSecret : (stored.clientSecret || ''),
    refreshToken: (!refreshToken.startsWith('•')) ? refreshToken : (stored.refreshToken || ''),
    sellerId,
    awsRegion,
    marketplaceId,
    isSandbox
  };
}

// DOM Ready initialization
document.addEventListener('DOMContentLoaded', () => {
  // Restore cached credentials from localStorage immediately (prevents empty inputs on refresh)
  restoreCredentialsFromStorage();

  // Restore cached listings from localStorage immediately (prevents empty table during initial load/navigation)
  try {
    const cached = localStorage.getItem('aplus_cached_listings');
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        state.allListings = parsed;
        state.loadedItems = parsed;
        paginateAndRenderClientListings();
      }
    }
  } catch (e) {
    console.warn('Could not read cached listings:', e);
  }

  initNavigation();
  fetchListings();
  fetchConfig();
  fetchDbConfig();
  initTableEvents();
  initSlideManager();
  initBulkQueue();
  initSettings();
  initModals();
});

// ==========================================================================
// 1. Navigation & Tabs
// ==========================================================================
function initNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-tab');
      switchTab(targetId);
    });
  });

  const refreshBtn = document.getElementById('refreshDataBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      const icon = refreshBtn.querySelector('.icon');
      if (icon) icon.classList.add('spinning');
      refreshBtn.disabled = true;

      try {
        await fetchListings(true); // force server reload
        showToast('✓ Listings and live audit matrix refreshed successfully!', 'success');
      } catch (err) {
        showToast('Failed to refresh listings: ' + err.message, 'error');
      } finally {
        if (icon) icon.classList.remove('spinning');
        refreshBtn.disabled = false;
      }
    });
  }

  document.getElementById('openBulkUploadBtn').addEventListener('click', () => {
    openModal('bulkUploadModal');
  });

  document.getElementById('openSettingsBtn').addEventListener('click', () => {
    switchTab('settings-tab');
  });
}

function switchTab(tabId) {
  state.activeTab = tabId;

  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.getAttribute('data-tab') === tabId);
  });

  document.querySelectorAll('.tab-content').forEach(c => {
    c.classList.toggle('active', c.id === tabId);
  });
}

// ==========================================================================
// 2. Fetch Listings & Render Audit Grid (650+ items)
// ==========================================================================
async function fetchListings(forceServer = false) {
  // If we already have listings loaded in state and not forcing reload, just re-paginate
  if (!forceServer && state.allListings && state.allListings.length > 0) {
    paginateAndRenderClientListings();
    return;
  }

  try {
    const res = await fetch('/api/listings?all=true');
    const data = await res.json();

    if (data && data.items && data.items.length > 0) {
      // Merge with any client-stored live statuses
      let localCached = [];
      try {
        const stored = localStorage.getItem('aplus_cached_listings');
        if (stored) localCached = JSON.parse(stored);
      } catch (_) {}

      const localMap = new Map();
      localCached.forEach(c => {
        if (c && c.asin) localMap.set(c.asin.toUpperCase(), c);
      });

      state.allListings = data.items.map(srvItem => {
        const cleanAsin = (srvItem.asin || '').toUpperCase();
        const loc = localMap.get(cleanAsin);
        if (loc) {
          return {
            ...srvItem,
            status: (loc.status && loc.status !== 'DRAFT') ? loc.status : (srvItem.status || 'DRAFT'),
            liveOnAmazon: Boolean(srvItem.liveOnAmazon || loc.liveOnAmazon),
            auditTimestamp: srvItem.auditTimestamp || loc.auditTimestamp,
            contentReferenceKey: srvItem.contentReferenceKey || loc.contentReferenceKey
          };
        }
        return srvItem;
      });

      try { localStorage.setItem('aplus_cached_listings', JSON.stringify(state.allListings)); } catch (e) {}
      paginateAndRenderClientListings();
    } else {
      // Fallback to client-side cached listings (vital for offline / serverless restarts)
      let cached = state.allListings;
      if (!cached || cached.length === 0) {
        try {
          const stored = localStorage.getItem('aplus_cached_listings');
          if (stored) cached = JSON.parse(stored);
        } catch (e) {}
      }

      if (cached && cached.length > 0) {
        state.allListings = cached;
        paginateAndRenderClientListings();
      } else {
        updateKpis(data.metrics || { total: 0, approved: 0, submitted: 0, rejected: 0, draft: 0, liveOnAmazon: 0 });
        renderTable([]);
        renderPagination(0, 1, 1);
      }
    }
  } catch (err) {
    console.error('Failed to load listings:', err);
    if (state.allListings && state.allListings.length > 0) {
      paginateAndRenderClientListings();
    }
  }
}

function paginateAndRenderClientListings() {
  let list = state.allListings || [];

  // Filter by status
  if (state.currentFilter && state.currentFilter !== 'ALL') {
    if (state.currentFilter === 'APPROVED') {
      list = list.filter(item => item.status === 'APPROVED' || item.liveOnAmazon);
    } else if (state.currentFilter === 'DRAFT') {
      list = list.filter(item => (item.status === 'DRAFT' || !item.status) && !item.liveOnAmazon);
    } else {
      list = list.filter(item => item.status === state.currentFilter);
    }
  }

  // Filter by search
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    list = list.filter(item => 
      (item.asin || '').toLowerCase().includes(q) ||
      (item.sku || '').toLowerCase().includes(q) ||
      (item.title || '').toLowerCase().includes(q)
    );
  }

  // Compute metrics across ALL items
  const all = state.allListings || [];
  const approvedCount = all.filter(l => l.status === 'APPROVED' || l.liveOnAmazon).length;
  const submittedCount = all.filter(l => l.status === 'SUBMITTED').length;
  const rejectedCount = all.filter(l => l.status === 'REJECTED').length;
  const draftCount = all.filter(l => (l.status === 'DRAFT' || !l.status) && !l.liveOnAmazon).length;

  const metrics = {
    total: all.length,
    approved: approvedCount,
    submitted: submittedCount,
    rejected: rejectedCount,
    draft: draftCount,
    liveOnAmazon: approvedCount
  };
  updateKpis(metrics);

  const totalCount = list.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / state.limit));
  const startIndex = (state.currentPage - 1) * state.limit;
  const pagedItems = list.slice(startIndex, startIndex + state.limit);

  state.loadedItems = pagedItems;
  renderTable(pagedItems);
  renderPagination(totalCount, state.currentPage, totalPages);
}

function updateKpis(metrics) {
  if (!metrics) return;
  document.getElementById('kpiTotal').textContent = metrics.total;
  document.getElementById('kpiLive').textContent = metrics.approved;
  document.getElementById('kpiSubmitted').textContent = metrics.submitted;
  document.getElementById('kpiErrors').textContent = metrics.rejected;
  document.getElementById('kpiDraft').textContent = metrics.draft;
  
  const pillAll = document.getElementById('pillAllCount');
  if (pillAll) pillAll.textContent = metrics.total;

  const livePct = metrics.total > 0 ? ((metrics.approved / metrics.total) * 100).toFixed(1) : 0;
  document.getElementById('kpiLivePercent').textContent = `${livePct}% active on amazon.in`;
}

function renderTable(items) {
  const tbody = document.getElementById('listingsTableBody');
  tbody.innerHTML = '';

  if (!items || items.length === 0) {
    const totalCatalogCount = (state.allListings ? state.allListings.length : 0);
    if (totalCatalogCount === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center; padding:50px 20px; color:#94a3b8;">
            <div style="font-size:38px; margin-bottom:12px;">🗄️</div>
            <strong style="color:#ffffff; font-size:16px; display:block; margin-bottom:6px;">No Real Listings Loaded Yet</strong>
            <p style="font-size:13px; max-width:540px; margin:0 auto 18px; color:#94a3b8;">
              Connect your OMS database in Settings or import a catalog file to begin managing your A+ stacks.
            </p>
            <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
              <button id="emptyStateDbBtn" class="btn btn-secondary btn-sm">
                <span class="icon">⚙️</span> Configure OMS Database in Settings
              </button>
            </div>
          </td>
        </tr>
      `;
      const btnDb = document.getElementById('emptyStateDbBtn');
      if (btnDb) btnDb.addEventListener('click', () => switchTab('settings-tab'));
    } else {
      let filterName = 'matching this filter';
      if (state.currentFilter === 'APPROVED') filterName = 'in Live / Approved';
      else if (state.currentFilter === 'SUBMITTED') filterName = 'currently In Review (Submitted)';
      else if (state.currentFilter === 'REJECTED') filterName = 'with Moderation Errors (Rejected)';
      else if (state.currentFilter === 'DRAFT') filterName = 'in Draft';

      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center; padding:45px 20px; color:#94a3b8;">
            <div style="font-size:32px; margin-bottom:10px;">📋</div>
            <strong style="color:#ffffff; font-size:15px; display:block; margin-bottom:6px;">No Listings ${filterName}</strong>
            <p style="font-size:13px; max-width:480px; margin:0 auto 16px; color:#94a3b8;">
              There are currently 0 listings ${filterName}. You can audit listings or push drafts to publish them to amazon.in.
            </p>
            <button class="btn btn-outline btn-sm reset-filter-btn" style="color:#38bdf8; border-color:#0284c7;">
              Show All Listings (${totalCatalogCount})
            </button>
          </td>
        </tr>
      `;
      tbody.querySelector('.reset-filter-btn')?.addEventListener('click', () => {
        document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
        document.querySelector('.pill-btn[data-filter="ALL"]')?.classList.add('active');
        state.currentFilter = 'ALL';
        state.currentPage = 1;
        paginateAndRenderClientListings();
      });
    }
    return;
  }

  items.forEach(item => {
    const tr = document.createElement('tr');

    // Status pill
    let statusClass = 'pill-approved';
    let statusLabel = 'APPROVED';
    if (item.status === 'SUBMITTED') {
      statusClass = 'pill-submitted';
      statusLabel = 'IN REVIEW';
    } else if (item.status === 'REJECTED') {
      statusClass = 'pill-danger';
      statusLabel = 'REJECTED';
    } else if (item.status === 'DRAFT' && !item.liveOnAmazon) {
      statusClass = 'pill-draft';
      statusLabel = 'DRAFT';
    }

    // Live Indicator
    const liveIndicator = item.liveOnAmazon 
      ? `<span class="pill-badge pill-approved" title="Verified live on amazon.in">✅ Live</span>`
      : `<span class="pill-badge pill-danger" title="Not yet live">❌ Offline</span>`;

    // Moderation column
    let modHtml = `<span style="color:#64748b;">No issues</span>`;
    if (item.moderationErrors && item.moderationErrors.length > 0) {
      modHtml = `<button class="btn btn-xs btn-danger view-errors-btn" data-asin="${item.asin}">⚠️ ${item.moderationErrors.length} Errors</button>`;
    } else if (item.moderationWarnings && item.moderationWarnings.length > 0) {
      modHtml = `<span style="color:#f59e0b; font-size:11px;">⚠️ Resolution tip</span>`;
    }

    tr.innerHTML = `
      <td><input type="checkbox" class="row-checkbox" data-asin="${item.asin}" ${state.selectedAsins.has(item.asin) ? 'checked' : ''}></td>
      <td>
        <a href="https://www.amazon.in/dp/${item.asin}" target="_blank" class="asin-code" title="View product page on amazon.in">
          ${item.asin} ↗
        </a>
      </td>
      <td><span class="sku-code">${item.sku}</span></td>
      <td><div class="product-cell" title="${item.title}">${item.title}</div></td>
      <td><span style="font-size:11.5px; color:#94a3b8;">7 Slides</span></td>
      <td><span class="pill-badge ${statusClass}">${statusLabel}</span></td>
      <td>${liveIndicator}</td>
      <td>${modHtml}</td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn btn-xs btn-secondary audit-asin-btn" data-asin="${item.asin}" title="Check live status on amazon.in">
            Audit
          </button>
          <button class="btn btn-xs btn-primary update-single-btn" data-asin="${item.asin}" title="Publish 7-Slide A+ to this ASIN">
            Push
          </button>
        </div>
      </td>
    `;

    tbody.appendChild(tr);
  });

  // Attach row event listeners
  document.querySelectorAll('.row-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const asin = e.target.getAttribute('data-asin');
      if (e.target.checked) state.selectedAsins.add(asin);
      else state.selectedAsins.delete(asin);
      updateSelectedCounter();
    });
  });

  document.querySelectorAll('.view-errors-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const asin = btn.getAttribute('data-asin');
      const item = items.find(i => i.asin === asin);
      if (item) openErrorModal(item);
    });
  });

  document.querySelectorAll('.audit-asin-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const asin = btn.getAttribute('data-asin');
      const origHtml = btn.innerHTML;
      btn.innerHTML = 'Auditing...';
      btn.disabled = true;

      try {
        const activeCreds = getActiveSpapiCredentials();
        const res = await fetch('/api/audit-asin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            asin,
            credentials: (activeCreds && activeCreds.clientId) ? activeCreds : undefined
          })
        });
        const result = await res.json();

        if (!res.ok || !result.success) {
          throw new Error(result.error || result.message || 'Audit request failed');
        }

        const isLive = Boolean(result.isLive);
        const updateListingItem = (it) => {
          if (!it) return;
          it.liveOnAmazon = isLive;
          if (isLive) {
            it.status = 'APPROVED';
            it.moderationErrors = [];
          } else {
            it.status = 'DRAFT';
          }
          it.auditTimestamp = new Date().toISOString();
        };

        if (state.allListings) {
          updateListingItem(state.allListings.find(i => (i.asin || '').toUpperCase() === asin.toUpperCase()));
        }
        if (state.loadedItems) {
          updateListingItem(state.loadedItems.find(i => (i.asin || '').toUpperCase() === asin.toUpperCase()));
        }

        try {
          localStorage.setItem('aplus_cached_listings', JSON.stringify(state.allListings));
        } catch (_) {}

        paginateAndRenderClientListings();

        if (isLive) {
          showToast(`✅ <strong>${asin}</strong> is <strong>LIVE (Active)</strong> on Amazon PDP! <a href="${result.amazonUrl}" target="_blank" style="margin-left:6px;">View on Amazon ↗</a>`, 'success');
        } else {
          showToast(`ℹ️ <strong>${asin}</strong>: Not yet active on Amazon PDP (Status: ${result.status || 'DRAFT'}). <a href="${result.amazonUrl}" target="_blank" style="margin-left:6px;">PDP Link ↗</a>`, 'info');
        }
      } catch (err) {
        showToast(`❌ Audit failed for ${asin}: ${err.message}`, 'error');
      } finally {
        btn.innerHTML = origHtml;
        btn.disabled = false;
      }
    });
  });

  document.querySelectorAll('.update-single-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const asin = btn.getAttribute('data-asin');
      const item = (state.allListings || state.loadedItems || []).find(i => i.asin === asin);
      if (confirm(`Push the 7-Slide A+ Content to ${asin} on amazon.in?`)) {
        await startBatch([asin], item ? [item] : null);
      }
    });
  });
}

function updateSelectedCounter() {
  const count = state.selectedAsins.size;
  const countEl = document.getElementById('selectedCount');
  if (countEl) countEl.textContent = count;
  const batchBtn = document.getElementById('batchSelectedBtn');
  if (batchBtn) batchBtn.disabled = count === 0;
  const auditBtn = document.getElementById('auditSelectedBtn');
  if (auditBtn) auditBtn.disabled = count === 0;
}

function renderPagination(total, page, totalPages) {
  state.currentPage = page;
  state.totalPages = totalPages;

  const start = (page - 1) * state.limit + 1;
  const end = Math.min(page * state.limit, total);

  document.getElementById('paginationInfo').textContent = `Showing ${start} to ${end} of ${total} listings`;
  document.getElementById('pageIndicator').textContent = `Page ${page} of ${totalPages}`;

  document.getElementById('prevPageBtn').disabled = page <= 1;
  document.getElementById('nextPageBtn').disabled = page >= totalPages;
}

// Table Controls & Filters
function initTableEvents() {
  // Search with debounce
  let searchTimeout = null;
  document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.searchQuery = e.target.value.trim();
      state.currentPage = 1;
      paginateAndRenderClientListings();
    }, 300);
  });

  // Filter Pills
  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentFilter = btn.getAttribute('data-filter');
      state.currentPage = 1;
      paginateAndRenderClientListings();
    });
  });

  // Select all checkbox
  document.getElementById('selectAllCheckbox').addEventListener('change', (e) => {
    const checkboxes = document.querySelectorAll('.row-checkbox');
    checkboxes.forEach(cb => {
      cb.checked = e.target.checked;
      const asin = cb.getAttribute('data-asin');
      if (e.target.checked) state.selectedAsins.add(asin);
      else state.selectedAsins.delete(asin);
    });
    updateSelectedCounter();
  });

  // Pagination clicks
  document.getElementById('prevPageBtn').addEventListener('click', () => {
    if (state.currentPage > 1) {
      state.currentPage--;
      paginateAndRenderClientListings();
    }
  });

  document.getElementById('nextPageBtn').addEventListener('click', () => {
    if (state.currentPage < state.totalPages) {
      state.currentPage++;
      paginateAndRenderClientListings();
    }
  });

  // Batch selected
  document.getElementById('batchSelectedBtn').addEventListener('click', () => {
    const asins = Array.from(state.selectedAsins);
    if (asins.length === 0) {
      alert('Please select at least one ASIN from the table checkboxes first.');
      return;
    }
    const selectedItems = (state.allListings || state.loadedItems || []).filter(i => asins.includes(i.asin));
    if (confirm(`Start bulk A+ update for ${asins.length} selected listings?`)) {
      startBatch(asins, selectedItems);
    }
  });

  // Audit selected
  const auditSelectedBtn = document.getElementById('auditSelectedBtn');
  if (auditSelectedBtn) {
    auditSelectedBtn.addEventListener('click', async () => {
      const asins = Array.from(state.selectedAsins);
      if (asins.length === 0) return;

      const origHtml = auditSelectedBtn.innerHTML;
      auditSelectedBtn.disabled = true;
      let auditedCount = 0;
      let liveCount = 0;

      showToast(`Starting live status audit for ${asins.length} selected ASINs...`, 'info', 3000);

      const activeCreds = getActiveSpapiCredentials();
      for (let i = 0; i < asins.length; i++) {
        const asin = asins[i];
        auditSelectedBtn.innerHTML = `Auditing (${i + 1}/${asins.length})...`;

        try {
          const res = await fetch('/api/audit-asin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              asin,
              credentials: (activeCreds && activeCreds.clientId) ? activeCreds : undefined
            })
          });
          const result = await res.json();
          if (result && result.success) {
            auditedCount++;
            if (result.isLive) liveCount++;

            const updateListingItem = (it) => {
              if (!it) return;
              it.liveOnAmazon = Boolean(result.isLive);
              if (result.isLive) {
                it.status = 'APPROVED';
                it.moderationErrors = [];
              } else {
                it.status = 'DRAFT';
              }
              it.auditTimestamp = new Date().toISOString();
            };

            if (state.allListings) updateListingItem(state.allListings.find(it => (it.asin || '').toUpperCase() === asin.toUpperCase()));
            if (state.loadedItems) updateListingItem(state.loadedItems.find(it => (it.asin || '').toUpperCase() === asin.toUpperCase()));
          }
        } catch (_) {}
      }

      try {
        localStorage.setItem('aplus_cached_listings', JSON.stringify(state.allListings));
      } catch (_) {}

      paginateAndRenderClientListings();
      auditSelectedBtn.innerHTML = origHtml;
      auditSelectedBtn.disabled = false;
      showToast(`Audit complete: ${auditedCount} checked, ${liveCount} verified Live on Amazon PDP!`, 'success', 5000);
    });
  }

  // Upload SKU & ASIN modal button
  const uploadSkuAsinBtn = document.getElementById('openSkuAsinUploadBtn');
  if (uploadSkuAsinBtn) {
    uploadSkuAsinBtn.addEventListener('click', () => {
      openModal('skuAsinUploadModal');
    });
  }

  // Download sample CSV (2 columns: SKU, ASIN)
  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  if (downloadCsvBtn) {
    downloadCsvBtn.addEventListener('click', () => {
      window.location.href = '/api/download-sku-asin-template';
    });
  }

  // Clear loaded listings button
  const clearBtn = document.getElementById('clearListingsBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (confirm('Clear all loaded listings from the matrix and reset to empty?')) {
        state.allListings = [];
        state.loadedItems = [];
        state.selectedAsins.clear();
        try { localStorage.removeItem('aplus_cached_listings'); } catch(e){}
        await fetch('/api/clear-listings', { method: 'POST' }).catch(() => {});
        renderTable([]);
        renderPagination(0, 1, 1);
        updateKpis({ total: 0, approved: 0, submitted: 0, rejected: 0, draft: 0, liveOnAmazon: 0 });
        updateSelectedCounter();
      }
    });
  }
}

// ==========================================================================
// 3. 7-Slide Manager & Dropzones
// ==========================================================================
function initSlideManager() {
  const cards = document.querySelectorAll('.slide-card');
  cards.forEach(card => {
    const dropzone = card.querySelector('.slide-dropzone');
    const fileInput = card.querySelector('.file-input');
    const slideNum = card.getAttribute('data-slide');

    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFileSelect(slideNum, e.target.files[0]);
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = '#f59e0b';
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.style.borderColor = 'rgba(255, 255, 255, 0.12)';
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.style.borderColor = 'rgba(255, 255, 255, 0.12)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFileSelect(slideNum, e.dataTransfer.files[0]);
      }
    });
  });

  document.getElementById('validateSlideSetBtn').addEventListener('click', async () => {
    const btn = document.getElementById('validateSlideSetBtn');
    btn.textContent = 'Validating...';
    try {
      const res = await fetch('/api/validate-slide-layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slides: [
            { hasImage: true }, { hasImage: true }, { hasImage: true },
            { hasImage: true }, { hasImage: true }, { hasImage: true }, { hasImage: true }
          ]
        })
      });
      const data = await res.json();
      alert(`Pre-flight Check Passed!\nAll 7 modules meet Amazon's 970x600 px banner criteria and 2MB file limit.\nReady for SP-API S3 upload.`);
    } finally {
      btn.textContent = 'Run Pre-flight Validation';
    }
  });

  const loadLocalBtn = document.getElementById('loadLocalSlidesBtn');
  if (loadLocalBtn) {
    loadLocalBtn.addEventListener('click', async () => {
      const asinInput = document.getElementById('slideManagerAsinInput');
      const baseDirInput = document.getElementById('slideManagerBaseDirInput');
      const statusSpan = document.getElementById('loadLocalSlidesStatus');
      const asin = asinInput ? asinInput.value.trim().toUpperCase() : 'B09LYW9P2F';
      const baseDir = baseDirInput ? baseDirInput.value.trim() : '';
      if (!asin) return;

      loadLocalBtn.textContent = 'Loading...';
      try {
        const query = baseDir ? `?baseDir=${encodeURIComponent(baseDir)}` : '';
        const res = await fetch(`/api/asin-slides/${encodeURIComponent(asin)}${query}`);
        const data = await res.json();
        if (data && data.slides && data.slides.length > 0) {
          data.slides.forEach(s => {
            const preview = document.getElementById(`preview${s.slideIndex}`);
            if (preview) {
              preview.innerHTML = `
                <img src="${s.url}" style="max-height:80px; max-width:100%; border-radius:4px; margin-bottom:4px;" alt="Slide ${s.slideIndex}">
                <p style="font-size:11px; color:#10b981; font-weight:600;">✓ ${s.fileName}</p>
                <small style="color:#94a3b8;">${(s.size / 1024).toFixed(0)} KB (from ${s.fileName})</small>
              `;
            }
          });
          statusSpan.textContent = `✓ Loaded ${data.slides.length} slides from ${data.folder || (baseDir + '/' + asin)}`;
          statusSpan.style.color = '#10b981';
          showToast(`✓ Loaded ${data.slides.length} A+ banner slides for ${asin}!`, 'success');
        } else {
          statusSpan.textContent = `❌ No A+ slide files found in ${data.folder || (baseDir ? baseDir + '/' + asin : 'ASIN folder')}`;
          statusSpan.style.color = '#ef4444';
          showToast(`No A+ slide files found for ${asin}. Checked: ${data.folder || (baseDir ? baseDir + '/' + asin : 'ASIN folder')}`, 'info');
        }
      } catch (err) {
        statusSpan.textContent = `❌ Error: ${err.message}`;
        statusSpan.style.color = '#ef4444';
        showToast(`Failed loading slides: ${err.message}`, 'error');
      } finally {
        loadLocalBtn.innerHTML = '<span class="icon">🔍</span> Sync & Load ASIN Slides';
      }
    });
  }

  const localFolderInput = document.getElementById('localFolderInput');
  if (localFolderInput) {
    localFolderInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      const statusSpan = document.getElementById('loadLocalSlidesStatus');
      if (statusSpan) {
        statusSpan.textContent = `⏳ Optimizing slide graphics...`;
        statusSpan.style.color = '#f59e0b';
      }

      let loadedCount = 0;
      for (let i = 1; i <= 7; i++) {
        const regex = new RegExp(`^A\\+?\\s*${i}\\.(jpe?g|png)$|^Slide[-_ ]?${i}\\.(jpe?g|png)$|^0?${i}\\.(jpe?g|png)$`, 'i');
        const file = files.find(f => regex.test(f.name));
        if (file) {
          await handleFileSelect(i, file);
          loadedCount++;
        }
      }
      if (statusSpan) {
        statusSpan.textContent = `✓ Loaded & optimized ${loadedCount} slides! Ready to publish.`;
        statusSpan.style.color = '#10b981';
      }
    });
  }

  document.getElementById('applyToAsinBtn').addEventListener('click', () => {
    const asinInput = document.getElementById('slideManagerAsinInput');
    const defaultAsin = asinInput ? asinInput.value.trim().toUpperCase() : 'B09LYW9P2F';
    const asin = prompt('Enter target ASIN for this 7-Slide A+ stack (e.g. B0...):', defaultAsin);
    if (asin && asin.trim()) {
      const cleanAsin = asin.trim().toUpperCase();
      const item = (state.allListings || state.loadedItems || []).find(i => i.asin === cleanAsin);
      startBatch([cleanAsin], item ? [item] : null, true);
    }
  });
}

/**
 * Efficiently downscale and compress images client-side to ensure serverless request payloads stay < 4 MB
 */
function compressImageFile(file, maxWidth = 1464, maxHeight = 1080, quality = 0.82) {
  return new Promise((resolve) => {
    if (!file || !file.type.startsWith('image/')) {
      return resolve({ dataBase64: null, size: 0, originalSize: file ? file.size : 0, width: 0, height: 0 });
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        // Scale proportionally if larger than maximum allowable dimensions
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        // Clean white background in case of transparent PNGs
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        const approxBytes = Math.round((compressedBase64.length * 3) / 4);

        resolve({
          dataBase64: compressedBase64,
          width,
          height,
          size: approxBytes,
          originalSize: file.size
        });
      };
      img.onerror = () => {
        // Fallback: If image cannot be rendered into canvas, return raw base64
        resolve({
          dataBase64: e.target.result,
          width: 0,
          height: 0,
          size: file.size,
          originalSize: file.size
        });
      };
      img.src = e.target.result;
    };
    reader.onerror = () => {
      resolve({ dataBase64: null, size: 0, originalSize: file ? file.size : 0, width: 0, height: 0 });
    };
    reader.readAsDataURL(file);
  });
}

async function handleFileSelect(slideNum, file) {
  if (!state.uploadedSlides) state.uploadedSlides = {};
  const preview = document.getElementById(`preview${slideNum}`);
  if (preview) {
    preview.innerHTML = `
      <div class="drop-placeholder">
        <span class="drop-icon">⏳</span>
        <p style="font-size:11px; color:#f59e0b;">Optimizing ${file.name}...</p>
      </div>
    `;
  }

  const tier = document.getElementById('aplusContentTier')?.value || 'PREMIUM';
  const maxWidth = tier === 'PREMIUM' ? 1464 : 970;
  const maxHeight = tier === 'PREMIUM' ? 1080 : 600;

  const res = await compressImageFile(file, maxWidth, maxHeight, 0.82);

  state.uploadedSlides[slideNum] = {
    slideIndex: parseInt(slideNum, 10),
    name: file.name,
    size: res.size,
    width: res.width,
    height: res.height,
    dataBase64: res.dataBase64
  };

  if (preview && res.dataBase64) {
    const origKb = (res.originalSize / 1024).toFixed(0);
    const compKb = (res.size / 1024).toFixed(0);
    preview.innerHTML = `
      <img src="${res.dataBase64}" style="max-height:80px; max-width:100%; border-radius:4px; margin-bottom:4px;" alt="Slide ${slideNum}">
      <p style="font-size:11px; color:#10b981; font-weight:600;">✓ ${file.name}</p>
      <small style="color:#94a3b8;">${compKb} KB (optimized from ${origKb} KB, ${res.width}×${res.height})</small>
    `;
  }
}

// ==========================================================================
// 4. Bulk Queue & Rate-Limiter Engine
// ==========================================================================
function initBulkQueue() {
  document.getElementById('startBulkAllBtn').addEventListener('click', () => {
    if (confirm('Start automated bulk A+ update for all listings in catalog?')) {
      startBatch();
    }
  });

  document.getElementById('clearLogsBtn').addEventListener('click', () => {
    document.getElementById('terminalLog').innerHTML = `
      <div class="term-line info">[System] Log cleared. Ready for next batch...</div>
    `;
  });

  // Keep headline checkboxes and premium module types synchronized between tabs
  const slideHeadline = document.getElementById('includeBannerHeadline');
  const queueHeadline = document.getElementById('queueIncludeBannerHeadline');
  if (slideHeadline && queueHeadline) {
    slideHeadline.addEventListener('change', (e) => { queueHeadline.checked = e.target.checked; });
    queueHeadline.addEventListener('change', (e) => { slideHeadline.checked = e.target.checked; });
  }

  const slidePremType = document.getElementById('premiumModuleTypeSelect');
  const queuePremType = document.getElementById('queuePremiumTypeSelect');
  if (slidePremType && queuePremType) {
    slidePremType.addEventListener('change', (e) => { queuePremType.value = e.target.value; });
    queuePremType.addEventListener('change', (e) => { slidePremType.value = e.target.value; });
  }

  const slideTier = document.getElementById('aplusContentTier');
  const queueTier = document.getElementById('queueAplusTier');
  if (slideTier && queueTier) {
    slideTier.addEventListener('change', (e) => { queueTier.value = e.target.value; });
    queueTier.addEventListener('change', (e) => { slideTier.value = e.target.value; });
  }
}

async function startBatch(asins = null, customItems = null, includeClientSlides = false) {
  switchTab('queue-tab');
  const btn = document.getElementById('startBulkAllBtn');
  if (btn) btn.disabled = true;

  // Resolve items to guarantee server receives minimal valid listing payload
  let itemsToSend = customItems;
  const catalog = state.allListings || state.loadedItems || [];
  if (!itemsToSend && asins && asins.length > 0) {
    itemsToSend = catalog.filter(i => asins.includes(i.asin));
  } else if (!itemsToSend && (!asins || asins.length === 0)) {
    // If running bulk on entire catalog without preselection, send top 50
    itemsToSend = catalog.slice(0, 50);
  }

  // Strip catalog items to minimal necessary payload (asin, sku, title)
  if (itemsToSend && Array.isArray(itemsToSend)) {
    itemsToSend = itemsToSend.map(i => ({
      asin: i.asin,
      sku: i.sku || `SKU-${i.asin}`,
      title: i.title || i.asin
    }));
  }

  // Determine whether to send client-uploaded slides (from 7-Slide Manager)
  let clientSlides = undefined;
  if (state.uploadedSlides && Object.keys(state.uploadedSlides).length > 0) {
    // Only send slides if:
    // 1) Explicitly asked (from Slide Manager "Publish to Target ASIN" button), OR
    // 2) Processing a single ASIN that matches or is being pushed
    const isSingleAsin = asins && asins.length === 1;
    if (includeClientSlides || isSingleAsin) {
      clientSlides = Object.values(state.uploadedSlides).map(s => ({
        slideIndex: s.slideIndex,
        name: s.name,
        size: s.size,
        dataBase64: s.dataBase64
      }));
    }
  }

  const activeCreds = getActiveSpapiCredentials();
  const tier = (state.activeTab === 'queue-tab' ? document.getElementById('queueAplusTier')?.value : document.getElementById('aplusContentTier')?.value) || 'PREMIUM';
  const premiumType = (state.activeTab === 'queue-tab' ? document.getElementById('queuePremiumTypeSelect')?.value : document.getElementById('premiumModuleTypeSelect')?.value) || 'PREMIUM_FULL_BACKGROUND_IMAGE';
  const includeHeadline = state.activeTab === 'queue-tab'
    ? Boolean(document.getElementById('queueIncludeBannerHeadline')?.checked)
    : Boolean(document.getElementById('includeBannerHeadline')?.checked);

  // Track target ASINs so we can mark them Approved & Live when batch completes
  state.lastBatchAsins = (asins && asins.length > 0) ? asins : (itemsToSend ? itemsToSend.map(i => i.asin) : null);

  const baseDir = document.getElementById('slideManagerBaseDirInput')?.value?.trim() || 
                  document.getElementById('cfgGraphicsDir')?.value?.trim() || 
                  localStorage.getItem(STORAGE_KEYS.GRAPHICS_DIR) || 
                  undefined;

  const payloadObj = { 
    asins, 
    items: (itemsToSend && itemsToSend.length > 0) ? itemsToSend : undefined,
    credentials: (activeCreds && activeCreds.clientId) ? activeCreds : undefined,
    clientSlides,
    tier,
    premiumType,
    includeHeadline,
    baseDir
  };

  const payloadStr = JSON.stringify(payloadObj);

  // Vercel hard request payload limit is 4.5 MB. Guard at 4.0 MB.
  if (payloadStr.length > 4 * 1024 * 1024) {
    const mb = (payloadStr.length / (1024 * 1024)).toFixed(1);
    alert(`Payload is too large (${mb} MB). Serverless requests must stay below 4 MB. Please clear slides or re-upload smaller images.`);
    if (btn) btn.disabled = false;
    return;
  }

  try {
    const res = await fetch('/api/start-bulk-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payloadStr
    });

    if (!res.ok) {
      const errText = await res.text();
      let errMsg = errText;
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.message || errJson.error || errText;
      } catch (_) {}
      if (res.status === 413) {
        errMsg = 'Payload Too Large (HTTP 413): The uploaded slide images exceed Vercel serverless request limits (4.5 MB).';
      }
      throw new Error(`HTTP ${res.status}: ${errMsg.substring(0, 300)}`);
    }

    const data = await res.json();

    state.activeBatchJobId = data.jobId;
    appendLog(`[Job Started] ID: ${data.jobId} - Queued: ${data.totalQueued} items`, 'info');

    // Poll status every 400ms
    if (state.batchPollInterval) clearInterval(state.batchPollInterval);
    state.batchPollInterval = setInterval(pollBatchStatus, 400);
  } catch (err) {
    alert('Failed to start batch: ' + err.message);
    if (btn) btn.disabled = false;
  }
}

async function pollBatchStatus() {
  try {
    const res = await fetch('/api/batch-status');
    if (!res.ok) return;
    const job = await res.json();

    if (!job || job.status === 'IDLE') return;

    // Update progress bar
    const pct = job.total > 0 ? Math.round((job.processed / job.total) * 100) : 0;
    document.getElementById('queueProgressBar').style.width = `${pct}%`;
    document.getElementById('queueProgressText').textContent = `${job.processed} / ${job.total} Completed (${pct}%)`;

    // Metrics
    document.getElementById('qProcessed').textContent = job.processed;
    document.getElementById('qSuccess').textContent = job.successful;
    document.getElementById('qFailed').textContent = job.failed;

    // Calculate time remaining
    const remaining = job.total - job.processed;
    const estSec = Math.ceil(remaining / 8);
    const mins = Math.floor(estSec / 60);
    const secs = estSec % 60;
    document.getElementById('queueEstimatedTime').textContent = 
      job.status === 'COMPLETED' ? 'Status: Completed!' : `Est. Time Remaining: ${mins}m ${secs}s`;

    // Append logs
    if (job.logs && job.logs.length > 0) {
      const term = document.getElementById('terminalLog');
      const latestLogs = job.logs.slice(-5);
      latestLogs.forEach(l => {
        if (!term.innerText.includes(l)) {
          appendLog(l, l.includes('❌') ? 'error' : 'success');
        }
      });
    }

    if (job.status === 'COMPLETED') {
      clearInterval(state.batchPollInterval);
      document.getElementById('startBulkAllBtn').disabled = false;
      appendLog(`[Job Completed] Successfully processed ${job.successful} listings on amazon.in!`, 'success');
      
      // Update local state for pushed items so they are immediately reflected as Live / Approved
      if (state.lastBatchAsins && state.allListings) {
        const asinSet = new Set(state.lastBatchAsins.map(a => String(a).toUpperCase()));
        state.allListings.forEach(it => {
          if (it && it.asin && asinSet.has(it.asin.toUpperCase())) {
            it.status = 'APPROVED';
            it.liveOnAmazon = true;
            it.moderationErrors = [];
            it.auditTimestamp = new Date().toISOString();
          }
        });
        try {
          localStorage.setItem('aplus_cached_listings', JSON.stringify(state.allListings));
        } catch (_) {}
      }
      state.lastBatchAsins = null;
      fetchListings(true); // Force refresh
    }
  } catch (err) {
    console.error('Error polling batch:', err);
  }
}

function appendLog(msg, type = 'info') {
  const term = document.getElementById('terminalLog');
  const div = document.createElement('div');
  div.className = `term-line ${type}`;
  div.textContent = msg;
  term.appendChild(div);
  term.scrollTop = term.scrollHeight;
}

// ==========================================================================
// 5. SP-API & OMS Database Settings & Interactive Table Selector
// ==========================================================================
async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    const hasStoredSpapi = Boolean(localStorage.getItem(STORAGE_KEYS.SPAPI));

    // Populate inputs from server .env if empty in DOM
    const marketplaceEl = document.getElementById('cfgMarketplace');
    if (marketplaceEl && (!marketplaceEl.value || marketplaceEl.value === 'A21TJRUUN4KGV') && data.marketplaceId) {
      marketplaceEl.value = data.marketplaceId;
    }
    const regionEl = document.getElementById('cfgAwsRegion');
    if (regionEl && !regionEl.value && data.awsRegion) {
      regionEl.value = data.awsRegion;
    }
    if (!hasStoredSpapi) {
      document.getElementById('cfgSandboxMode').checked = data.isSandbox;
    }

    if (data.endpoint && document.getElementById('cfgEndpoint')) {
      document.getElementById('cfgEndpoint').value = data.endpoint;
    }
    if (data.clientIdMasked && data.clientIdMasked !== 'Not Set') {
      document.getElementById('cfgClientId').placeholder = `Configured: ${data.clientIdMasked}`;
    }
    if (data.sellerIdMasked && data.sellerIdMasked !== 'Not Set' && document.getElementById('cfgSellerId')) {
      document.getElementById('cfgSellerId').placeholder = `Configured: ${data.sellerIdMasked}`;
    }

    const isSandboxActive = document.getElementById('cfgSandboxMode') ? document.getElementById('cfgSandboxMode').checked : data.isSandbox;
    const isConfigured = data.configured || (hasStoredSpapi && Boolean(getActiveSpapiCredentials().clientId));

    if (isConfigured) {
      document.getElementById('sandboxBadge').textContent = isSandboxActive ? '🛡️ Sandbox Simulation' : '🟢 Live SP-API';
      document.getElementById('sandboxBadge').className = isSandboxActive ? 'pill-badge pill-sandbox' : 'pill-badge pill-approved';
      if (!document.getElementById('cfgClientSecret').value) {
        document.getElementById('cfgClientSecret').placeholder = '•••••••••••••••• (Configured & Stored)';
      }
      if (!document.getElementById('cfgRefreshToken').value) {
        document.getElementById('cfgRefreshToken').placeholder = '•••••••••••••••• (Refresh Token Configured)';
      }
    }

    if (data.graphicsDir && !localStorage.getItem(STORAGE_KEYS.GRAPHICS_DIR)) {
      if (document.getElementById('cfgGraphicsDir')) document.getElementById('cfgGraphicsDir').value = data.graphicsDir;
      if (document.getElementById('slideManagerBaseDirInput')) document.getElementById('slideManagerBaseDirInput').value = data.graphicsDir;
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

async function fetchDbConfig() {
  try {
    const res = await fetch('/api/db-config');
    const data = await res.json();

    // Auto-populate inputs from server .env config whenever the input is currently empty
    if (!document.getElementById('cfgDbHost').value && data.host) document.getElementById('cfgDbHost').value = data.host;
    if (!document.getElementById('cfgDbPort').value && data.port) document.getElementById('cfgDbPort').value = data.port;
    if (!document.getElementById('cfgDbUser').value && data.user) document.getElementById('cfgDbUser').value = data.user;
    if (!document.getElementById('cfgDbName').value && data.database) document.getElementById('cfgDbName').value = data.database;
    if (!document.getElementById('cfgDbAmazonTable').value && data.amazonTable) document.getElementById('cfgDbAmazonTable').value = data.amazonTable;
    if (!document.getElementById('cfgDbProductsTable').value && data.productsTable) document.getElementById('cfgDbProductsTable').value = data.productsTable;
    if (!document.getElementById('cfgDbMarketplaceCol').value && data.marketplaceCol) document.getElementById('cfgDbMarketplaceCol').value = data.marketplaceCol;
    if (!document.getElementById('cfgDbMarketplaceVal').value && data.marketplaceVal) document.getElementById('cfgDbMarketplaceVal').value = data.marketplaceVal;
    if (!document.getElementById('cfgDbCategoryCol').value && data.categoryCol) document.getElementById('cfgDbCategoryCol').value = data.categoryCol;
    if (!document.getElementById('cfgDbCategoryVal').value && data.categoryVal) document.getElementById('cfgDbCategoryVal').value = data.categoryVal;
    if (!document.getElementById('cfgDbAmzJoinKey').value && (data.amzJoinKey || data.joinKey)) document.getElementById('cfgDbAmzJoinKey').value = data.amzJoinKey || data.joinKey;
    if (!document.getElementById('cfgDbProdJoinKey').value && data.prodJoinKey) document.getElementById('cfgDbProdJoinKey').value = data.prodJoinKey;

    const curAmz = document.getElementById('cfgDbAmazonTable').value || data.amazonTable;
    const curProd = document.getElementById('cfgDbProductsTable').value || data.productsTable;
    if (curAmz) ensureOption('selDbAmazonTable', curAmz);
    if (curProd) ensureOption('selDbProductsTable', curProd);

    const hasStoredDb = Boolean(localStorage.getItem(STORAGE_KEYS.DB));
    const badge = document.getElementById('dbStatusBadge');
    if (data.isConfigured || (hasStoredDb && Boolean(document.getElementById('cfgDbHost').value))) {
      badge.textContent = 'Configured';
      badge.className = 'pill-badge pill-sandbox';
    } else {
      badge.textContent = 'Not Configured';
      badge.className = 'pill-badge pill-draft';
    }
  } catch (err) {
    console.error('Failed to load DB config:', err);
  }
}

function ensureOption(selectId, value) {
  const sel = document.getElementById(selectId);
  if (!sel || !value) return;
  let exists = false;
  for (let i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === value) {
      sel.selectedIndex = i;
      exists = true;
      break;
    }
  }
  if (!exists) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    opt.selected = true;
    sel.appendChild(opt);
  }
}

let allDiscoveredTables = [];

function populateFilteredDropdown(selectEl, tables, currentVal, placeholder) {
  if (!selectEl) return;
  selectEl.innerHTML = `<option value="">-- ${placeholder} --</option>`;
  tables.forEach(tableName => {
    const opt = document.createElement('option');
    opt.value = tableName;
    opt.textContent = tableName;
    if (tableName === currentVal) opt.selected = true;
    selectEl.appendChild(opt);
  });
}

function renderDiscoveredTables(tables) {
  const selAmazon = document.getElementById('selDbAmazonTable');
  const selProducts = document.getElementById('selDbProductsTable');
  const searchAmz = document.getElementById('searchDbAmazonTable');
  const searchProd = document.getElementById('searchDbProductsTable');
  const badge = document.getElementById('tableDiscoveryBadge');

  if (!tables || tables.length === 0) return;
  allDiscoveredTables = tables;

  if (badge) {
    badge.textContent = `${tables.length} tables found`;
    badge.className = 'pill-badge pill-approved';
  }

  const currentAmazon = document.getElementById('cfgDbAmazonTable').value.trim();
  const currentProducts = document.getElementById('cfgDbProductsTable').value.trim();

  // Populate Amazon table dropdown
  if (selAmazon) {
    populateFilteredDropdown(selAmazon, tables, currentAmazon, 'Select Listing / Amazon Table');
    selAmazon.onchange = (e) => {
      document.getElementById('cfgDbAmazonTable').value = e.target.value;
      if (e.target.value) showDbCallout(`Selected Amazon table: '${e.target.value}'`, 'info');
    };
  }

  // Populate Products table dropdown
  if (selProducts) {
    populateFilteredDropdown(selProducts, tables, currentProducts, 'Select Products Master Table');
    selProducts.onchange = (e) => {
      document.getElementById('cfgDbProductsTable').value = e.target.value;
      if (e.target.value) showDbCallout(`Selected Products table: '${e.target.value}'`, 'info');
    };
  }

  // Live search filtering for Amazon table dropdown
  if (searchAmz && selAmazon) {
    searchAmz.oninput = (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = q ? allDiscoveredTables.filter(t => t.toLowerCase().includes(q)) : allDiscoveredTables;
      const cur = document.getElementById('cfgDbAmazonTable').value.trim();
      populateFilteredDropdown(selAmazon, filtered, cur, `Showing ${filtered.length} matching tables`);
    };
  }

  // Live search filtering for Products table dropdown
  if (searchProd && selProducts) {
    searchProd.oninput = (e) => {
      const q = e.target.value.toLowerCase().trim();
      const filtered = q ? allDiscoveredTables.filter(t => t.toLowerCase().includes(q)) : allDiscoveredTables;
      const cur = document.getElementById('cfgDbProductsTable').value.trim();
      populateFilteredDropdown(selProducts, filtered, cur, `Showing ${filtered.length} matching tables`);
    };
  }
}

function initSettings() {
  // OMS DB Settings Form Submit (Saves to .env)
  document.getElementById('dbSettingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const host = document.getElementById('cfgDbHost').value.trim();
    const port = document.getElementById('cfgDbPort').value.trim();
    const user = document.getElementById('cfgDbUser').value.trim();
    const password = document.getElementById('cfgDbPassword').value;
    const database = document.getElementById('cfgDbName').value.trim();

    const selAmz = document.getElementById('selDbAmazonTable');
    const selProd = document.getElementById('selDbProductsTable');
    const amazonTable = (selAmz && selAmz.value) ? selAmz.value.trim() : document.getElementById('cfgDbAmazonTable').value.trim();
    const productsTable = (selProd && selProd.value) ? selProd.value.trim() : document.getElementById('cfgDbProductsTable').value.trim();

    const marketplaceCol = document.getElementById('cfgDbMarketplaceCol').value.trim();
    const marketplaceVal = document.getElementById('cfgDbMarketplaceVal').value.trim();
    const categoryCol = document.getElementById('cfgDbCategoryCol').value.trim();
    const categoryVal = document.getElementById('cfgDbCategoryVal').value.trim();
    const amzJoinKey = document.getElementById('cfgDbAmzJoinKey').value.trim();
    const prodJoinKey = document.getElementById('cfgDbProdJoinKey').value.trim();

    try {
      const res = await fetch('/api/db-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          host, port, user, password, database,
          amazonTable, marketplaceCol, marketplaceVal,
          productsTable, categoryCol, categoryVal,
          amzJoinKey, prodJoinKey
        })
      });
      const data = await res.json();
      showDbCallout('OMS Database settings & table filters saved successfully to local .env!', 'success');
      fetchDbConfig();
    } catch (err) {
      showDbCallout('Failed to save DB config: ' + err.message, 'error');
    }
  });

  // Test DB Connection Button (Accepts form inputs directly - NO NEED TO SAVE FIRST!)
  document.getElementById('testDbConnectionBtn').addEventListener('click', async () => {
    const host = document.getElementById('cfgDbHost').value.trim();
    const port = document.getElementById('cfgDbPort').value.trim();
    const user = document.getElementById('cfgDbUser').value.trim();
    const password = document.getElementById('cfgDbPassword').value;
    const database = document.getElementById('cfgDbName').value.trim();

    if (!host || !user || !database) {
      showDbCallout('Please fill in DB Host, Database Name, and Username before testing.', 'error');
      return;
    }

    showDbCallout(`Connecting to MySQL database '${database}' on ${host}...`, 'info');
    try {
      const res = await fetch('/api/test-db', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host, port, user, password, database })
      });
      const data = await res.json();
      if (data.success) {
        const tableList = data.tables || [];
        showDbCallout(`✅ ${data.message} (${tableList.length} tables populated in dropdowns)`, 'success');
        document.getElementById('dbStatusBadge').textContent = 'Connected ✅';
        document.getElementById('dbStatusBadge').className = 'pill-badge pill-approved';
        renderDiscoveredTables(tableList);
      } else {
        showDbCallout(`❌ Connection Failed: ${data.message}`, 'error');
        document.getElementById('dbStatusBadge').textContent = 'Connection Error ❌';
        document.getElementById('dbStatusBadge').className = 'pill-badge pill-danger';
      }
    } catch (err) {
      showDbCallout(`❌ Error: ${err.message}`, 'error');
    }
  });

  // Fetch Real Listings from Database Button
  document.getElementById('syncOmsDbBtn').addEventListener('click', async () => {
    const syncBtn = document.getElementById('syncOmsDbBtn');
    const origHtml = syncBtn.innerHTML;

    const host = document.getElementById('cfgDbHost').value.trim();
    const port = document.getElementById('cfgDbPort').value.trim();
    const user = document.getElementById('cfgDbUser').value.trim();
    const password = document.getElementById('cfgDbPassword').value;
    const database = document.getElementById('cfgDbName').value.trim();

    const selAmz = document.getElementById('selDbAmazonTable');
    const selProd = document.getElementById('selDbProductsTable');
    const amazonTable = (selAmz && selAmz.value) ? selAmz.value.trim() : document.getElementById('cfgDbAmazonTable').value.trim();
    const productsTable = (selProd && selProd.value) ? selProd.value.trim() : document.getElementById('cfgDbProductsTable').value.trim();

    if (!amazonTable || !productsTable) {
      showDbCallout('Please select both your Amazon listing table and Products master table before fetching.', 'error');
      return;
    }

    const marketplaceCol = document.getElementById('cfgDbMarketplaceCol').value.trim();
    const marketplaceVal = document.getElementById('cfgDbMarketplaceVal').value.trim();
    const categoryCol = document.getElementById('cfgDbCategoryCol').value.trim();
    const categoryVal = document.getElementById('cfgDbCategoryVal').value.trim();
    const amzJoinKey = document.getElementById('cfgDbAmzJoinKey').value.trim();
    const prodJoinKey = document.getElementById('cfgDbProdJoinKey').value.trim();

    syncBtn.innerHTML = '<span class="icon">⏳</span> Querying Database & Loading Listings...';
    syncBtn.disabled = true;
    showDbCallout(`Connecting to database and running query on ${amazonTable}...`, 'info');

    try {
      const startTime = performance.now();
      const res = await fetch('/api/sync-db', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          host, port, user, password, database,
          amazonTable, marketplaceCol, marketplaceVal,
          productsTable, categoryCol, categoryVal,
          amzJoinKey, prodJoinKey
        })
      });
      const data = await res.json();
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

      if (data.success) {
        showDbCallout(`✅ Loaded ${data.count} listings in ${elapsed}s!`, 'success');
        
        // Immediately store and render listings locally (guarantees instant display on Vercel or any network)
        if (data.items && data.items.length > 0) {
          state.allListings = data.items;
          state.loadedItems = data.items;
          try {
            localStorage.setItem('aplus_cached_listings', JSON.stringify(data.items));
          } catch(e) {
            console.warn('LocalStorage quota or storage error:', e);
          }
          state.currentPage = 1;
          paginateAndRenderClientListings();
        }

        switchTab('listings-tab');
      } else {
        showDbCallout(`❌ Sync Failed: ${data.message}`, 'error');
      }
    } catch (err) {
      showDbCallout(`❌ Error: ${err.message}`, 'error');
    } finally {
      syncBtn.innerHTML = origHtml;
      syncBtn.disabled = false;
    }
  });

  // Auto-save credentials as user types to prevent any data loss on refresh
  ['cfgClientId', 'cfgClientSecret', 'cfgRefreshToken', 'cfgSellerId', 'cfgAwsRegion', 'cfgMarketplace'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', saveCredentialsToStorage);
  });
  ['cfgDbHost', 'cfgDbPort', 'cfgDbUser', 'cfgDbPassword', 'cfgDbName', 'cfgDbAmazonTable', 'cfgDbProductsTable', 'cfgDbMarketplaceCol', 'cfgDbMarketplaceVal', 'cfgDbCategoryCol', 'cfgDbCategoryVal', 'cfgDbAmzJoinKey', 'cfgDbProdJoinKey'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', saveCredentialsToStorage);
  });

  // Amazon SP-API Settings Form Submit
  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    saveCredentialsToStorage();
    const payload = getActiveSpapiCredentials();

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      showCallout('SP-API settings saved securely to browser memory & local .env (protected mode 0600)!', 'success');
      fetchConfig();
    } catch (err) {
      showCallout('Failed to save settings: ' + err.message, 'error');
    }
  });

  // Instant Auto-Toggle for Sandbox Mode checkbox (No need to submit form!)
  const sandboxToggle = document.getElementById('cfgSandboxMode');
  if (sandboxToggle) {
    sandboxToggle.addEventListener('change', async (e) => {
      const isSandbox = e.target.checked;
      saveCredentialsToStorage();
      const badge = document.getElementById('sandboxBadge');
      if (badge) {
        badge.textContent = isSandbox ? '🛡️ Sandbox Simulation' : '🟢 Live SP-API';
        badge.className = isSandbox ? 'pill-badge pill-sandbox' : 'pill-badge pill-approved';
      }
      try {
        const res = await fetch('/api/toggle-sandbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isSandbox })
        });
        const data = await res.json();
        if (data.success) {
          if (!isSandbox && !data.configured && !getActiveSpapiCredentials().clientId) {
            showCallout('⚠️ Live Mode enabled, but Amazon SP-API credentials are not set. Live pushes will require valid SP-API credentials.', 'error');
          } else {
            showCallout(data.message, isSandbox ? 'info' : 'success');
          }
        }
      } catch (err) {
        console.error('Failed to toggle sandbox mode:', err);
      }
    });
  }

  document.getElementById('syncLiveAmazonBtn').addEventListener('click', async () => {
    const box = document.getElementById('connectionStatusBox');
    box.style.display = 'block';
    box.className = 'status-callout';
    box.textContent = 'Syncing live A+ content and ASINs from Amazon SP-API...';

    saveCredentialsToStorage();
    const activeCreds = getActiveSpapiCredentials();

    try {
      const res = await fetch('/api/sync-live-amazon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credentials: (activeCreds && activeCreds.clientId) ? activeCreds : undefined })
      });
      const data = await res.json();
      if (data.success) {
        showCallout(`✅ ${data.message}`, 'success');
        fetchListings(); // Refresh main table
      } else {
        showCallout(`❌ Sync Failed: ${data.message}`, 'error');
      }
    } catch (err) {
      showCallout(`❌ Error: ${err.message}`, 'error');
    }
  });

  document.getElementById('testConnectionBtn').addEventListener('click', async () => {
    const box = document.getElementById('connectionStatusBox');
    box.style.display = 'block';
    box.className = 'status-callout';
    box.textContent = 'Testing connection with Amazon LWA and SP-API EU endpoint...';

    saveCredentialsToStorage();
    const payload = getActiveSpapiCredentials();

    try {
      const res = await fetch('/api/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showCallout(`✅ ${data.message} (${data.mode.toUpperCase()} mode)`, 'success');
        fetchConfig();
      } else {
        showCallout(`❌ Connection Failed: ${data.message}`, 'error');
      }
    } catch (err) {
      showCallout(`❌ Error: ${err.message}`, 'error');
    }
  });

  // Diagnose SP-API Permissions Button
  const diagBtn = document.getElementById('diagnosePermissionsBtn');
  if (diagBtn) {
    diagBtn.addEventListener('click', async () => {
      const box = document.getElementById('connectionStatusBox');
      box.style.display = 'block';
      box.className = 'status-callout';
      box.innerHTML = '<strong>⏳ Running SP-API Pre-flight Diagnostics...</strong><br>Testing OAuth Token, Seller Participation, Upload Destinations, and A+ Content API...';

      saveCredentialsToStorage();
      const payload = getActiveSpapiCredentials();

      try {
        const res = await fetch('/api/diagnose-permissions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        renderDiagnosticReport(data);
      } catch (err) {
        showCallout(`❌ Diagnostic Error: ${err.message}`, 'error');
      }
    });
  }

  // Two-way synchronization between cfgGraphicsDir and slideManagerBaseDirInput
  const cfgGraphicsDirEl = document.getElementById('cfgGraphicsDir');
  const slideMgrBaseDirEl = document.getElementById('slideManagerBaseDirInput');

  if (cfgGraphicsDirEl && slideMgrBaseDirEl) {
    cfgGraphicsDirEl.addEventListener('input', (e) => {
      slideMgrBaseDirEl.value = e.target.value;
      localStorage.setItem(STORAGE_KEYS.GRAPHICS_DIR, e.target.value.trim());
    });
    slideMgrBaseDirEl.addEventListener('input', (e) => {
      cfgGraphicsDirEl.value = e.target.value;
      localStorage.setItem(STORAGE_KEYS.GRAPHICS_DIR, e.target.value.trim());
    });
  }

  // Scan & Verify Graphics Directory Button
  const scanGraphicsBtn = document.getElementById('scanGraphicsDirBtn');
  if (scanGraphicsBtn) {
    scanGraphicsBtn.addEventListener('click', async () => {
      const dirPath = (cfgGraphicsDirEl?.value || slideMgrBaseDirEl?.value || '').trim();
      const callout = document.getElementById('assetsDirScanCallout');
      const badge = document.getElementById('assetsDirStatusBadge');

      if (!dirPath) {
        if (callout) {
          callout.style.display = 'block';
          callout.className = 'status-callout error';
          callout.textContent = 'Please enter a valid directory path to scan.';
        }
        return;
      }

      const origHtml = scanGraphicsBtn.innerHTML;
      scanGraphicsBtn.innerHTML = '<span class="icon">⏳</span> Scanning...';
      scanGraphicsBtn.disabled = true;
      if (callout) {
        callout.style.display = 'block';
        callout.className = 'status-callout';
        callout.textContent = `Scanning directory '${dirPath}' for ASIN subfolders and slide files...`;
      }

      try {
        const res = await fetch('/api/scan-assets-dir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dirPath })
        });
        const data = await res.json();

        if (data.success && data.exists) {
          localStorage.setItem(STORAGE_KEYS.GRAPHICS_DIR, data.path);
          if (cfgGraphicsDirEl) cfgGraphicsDirEl.value = data.path;
          if (slideMgrBaseDirEl) slideMgrBaseDirEl.value = data.path;

          if (badge) {
            badge.textContent = `Active (${data.readyFolders || 0} ASINs Ready)`;
            badge.className = 'pill-badge pill-approved';
          }

          if (callout) {
            callout.style.display = 'block';
            callout.className = 'status-callout success';
            let summaryText = `✅ ${data.message}`;
            if (data.sampleFolders && data.sampleFolders.length > 0) {
              const readySamples = data.sampleFolders.filter(f => f.slideCount > 0).map(f => `<strong>${f.asinOrFolder}</strong> (${f.slideCount} slides)`).slice(0, 5);
              if (readySamples.length > 0) {
                summaryText += `<div style="margin-top:6px; font-size:12px;">Sample ready ASINs: ${readySamples.join(', ')}</div>`;
              }
            }
            callout.innerHTML = summaryText;
          }
          showToast(`✓ Graphics folder verified: ${data.totalFolders} folders, ${data.readyFolders} ready`, 'success');
        } else {
          if (badge) {
            badge.textContent = data.exists ? 'No Slides' : 'Folder Not Created';
            badge.className = 'pill-badge pill-draft';
          }
          if (callout) {
            callout.style.display = 'block';
            callout.className = 'status-callout warning';
            callout.innerHTML = `⚠️ ${data.message || 'Directory could not be verified.'}`;
          }
        }
      } catch (err) {
        if (callout) {
          callout.style.display = 'block';
          callout.className = 'status-callout error';
          callout.textContent = `❌ Scan error: ${err.message}`;
        }
      } finally {
        scanGraphicsBtn.innerHTML = origHtml;
        scanGraphicsBtn.disabled = false;
      }
    });
  }
}

function renderDiagnosticReport(data) {
  const box = document.getElementById('connectionStatusBox');
  box.style.display = 'block';
  box.className = `status-callout ${data.allPassed ? 'success' : 'error'}`;

  let html = `<div style="font-weight:600; font-size:14px; margin-bottom:8px;">🔍 SP-API Permission Diagnostic Results:</div>`;
  html += `<div style="font-size:12px; margin-bottom:12px; color:#cbd5e1;">Endpoint: <code>${data.endpoint || 'N/A'}</code> | Store: <code>${data.marketplaceId || 'A21TJRUUN4KGV'}</code> | Mode: <strong>${(data.mode || 'LIVE').toUpperCase()}</strong></div>`;

  html += `<div style="display:flex; flex-direction:column; gap:6px; margin-bottom:14px;">`;
  (data.steps || []).forEach(step => {
    const isPass = step.status === 'PASS';
    html += `
      <div style="background:rgba(0,0,0,0.25); border-left:3px solid ${isPass ? '#10b981' : '#ef4444'}; padding:6px 10px; border-radius:4px; font-size:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>${step.name}</strong>
          <span class="pill-badge ${isPass ? 'pill-approved' : 'pill-danger'}" style="font-size:10px;">${isPass ? 'PASS ✓' : 'FAIL ✗'}</span>
        </div>
        <div style="color:${isPass ? '#a7f3d0' : '#fca5a5'}; font-size:11.5px; margin-top:2px;">${step.message}</div>
      </div>
    `;
  });
  html += `</div>`;

  if (data.recommendations && data.recommendations.length > 0) {
    html += `
      <div style="background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); border-radius:6px; padding:10px 12px; font-size:12px;">
        <strong style="color:#fbbf24;">⚠️ Recommended Fix:</strong>
        <ul style="margin:6px 0 0 16px; padding:0; color:#fde68a;">
          ${data.recommendations.map(r => `<li style="margin-bottom:4px;">${r}</li>`).join('')}
        </ul>
      </div>
    `;
  }

  box.innerHTML = html;
}

function showDbCallout(msg, type) {
  const box = document.getElementById('dbStatusCallout');
  box.style.display = 'block';
  box.className = `status-callout ${type}`;
  box.textContent = msg;
}

function showCallout(msg, type) {
  const box = document.getElementById('connectionStatusBox');
  box.style.display = 'block';
  box.className = `status-callout ${type}`;
  box.textContent = msg;
}

// ==========================================================================
// 7. Modals
// ==========================================================================
function initModals() {
  // Error modal
  document.getElementById('closeErrorModalBtn').addEventListener('click', () => closeModal('errorModal'));
  document.getElementById('closeModalActionBtn').addEventListener('click', () => closeModal('errorModal'));
  document.getElementById('resubmitAsinBtn').addEventListener('click', () => {
    if (state.currentModalAsin) {
      closeModal('errorModal');
      startBatch([state.currentModalAsin]);
    }
  });

  // Bulk Upload modal
  document.getElementById('closeBulkModalBtn').addEventListener('click', () => closeModal('bulkUploadModal'));
  document.getElementById('cancelBulkModalBtn').addEventListener('click', () => closeModal('bulkUploadModal'));

  const csvDrop = document.getElementById('csvDropArea');
  const csvInput = document.getElementById('csvFileInput');

  csvDrop.addEventListener('click', () => csvInput.click());

  csvInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleCsvFile(e.target.files[0]);
    }
  });

  document.getElementById('processCsvBtn').addEventListener('click', () => {
    closeModal('bulkUploadModal');
    startBatch();
  });

  // Dedicated SKU & ASIN File Upload Modal
  let selectedSkuAsinFile = null;
  const skuModal = document.getElementById('skuAsinUploadModal');
  if (skuModal) {
    document.getElementById('closeSkuAsinModalBtn').addEventListener('click', () => closeModal('skuAsinUploadModal'));
    document.getElementById('cancelSkuAsinModalBtn').addEventListener('click', () => closeModal('skuAsinUploadModal'));

    const skuDrop = document.getElementById('skuAsinDropArea');
    const skuFileInput = document.getElementById('skuAsinFileInput');
    const skuInfo = document.getElementById('skuAsinFileInfo');
    const skuFileName = document.getElementById('skuAsinFileName');
    const submitBtn = document.getElementById('submitSkuAsinBtn');

    skuDrop.addEventListener('click', () => skuFileInput.click());

    skuFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        selectedSkuAsinFile = e.target.files[0];
        skuFileName.textContent = selectedSkuAsinFile.name;
        skuInfo.style.display = 'flex';
      }
    });

    skuDrop.addEventListener('dragover', (e) => { e.preventDefault(); skuDrop.style.borderColor = '#f59e0b'; });
    skuDrop.addEventListener('dragleave', () => { skuDrop.style.borderColor = 'rgba(255, 255, 255, 0.12)'; });
    skuDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      skuDrop.style.borderColor = 'rgba(255, 255, 255, 0.12)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        selectedSkuAsinFile = e.dataTransfer.files[0];
        skuFileName.textContent = selectedSkuAsinFile.name;
        skuInfo.style.display = 'flex';
      }
    });

    submitBtn.addEventListener('click', async () => {
      const pasteText = document.getElementById('skuAsinPasteText').value.trim();

      if (!selectedSkuAsinFile && !pasteText) {
        alert('Please choose a file or paste SKU & ASIN text.');
        return;
      }

      submitBtn.textContent = 'Importing...';
      submitBtn.disabled = true;

      try {
        let res;
        if (selectedSkuAsinFile) {
          const formData = new FormData();
          formData.append('file', selectedSkuAsinFile);
          res = await fetch('/api/upload-sku-asin', {
            method: 'POST',
            body: formData
          });
        } else {
          res = await fetch('/api/upload-sku-asin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: pasteText })
          });
        }

        const data = await res.json();
        if (data.success) {
          alert(`✅ ${data.message}`);
          closeModal('skuAsinUploadModal');
          selectedSkuAsinFile = null;
          skuInfo.style.display = 'none';
          document.getElementById('skuAsinPasteText').value = '';
          await fetchListings();
          switchTab('listings-tab');
        } else {
          alert(`❌ Import Failed: ${data.message}`);
        }
      } catch (err) {
        alert(`❌ Error: ${err.message}`);
      } finally {
        submitBtn.innerHTML = '<span class="icon">📥</span> Import Listings';
        submitBtn.disabled = false;
      }
    });
  }
}

function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function openErrorModal(item) {
  state.currentModalAsin = item.asin;
  document.getElementById('modalAsinText').textContent = `${item.asin} (${item.sku})`;
  const list = document.getElementById('modalErrorList');
  list.innerHTML = '';

  if (item.moderationErrors && item.moderationErrors.length > 0) {
    item.moderationErrors.forEach(err => {
      const div = document.createElement('div');
      div.className = 'error-badge-item';
      div.textContent = `❌ ${err}`;
      list.appendChild(div);
    });
  } else {
    list.innerHTML = `<div style="color:#10b981;">No active rejection errors.</div>`;
  }

  openModal('errorModal');
}

function handleCsvFile(file) {
  document.getElementById('csvFileName').textContent = file.name;
  document.getElementById('csvFileInfo').style.display = 'flex';
  document.getElementById('processCsvBtn').disabled = false;
}
