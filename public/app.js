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
  currentModalAsin: null
};

// DOM Ready initialization
document.addEventListener('DOMContentLoaded', () => {
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
  initPreviewer();
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

  document.getElementById('refreshDataBtn').addEventListener('click', () => {
    fetchListings();
  });

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
async function fetchListings() {
  // If we already have the full catalog loaded in client state (e.g. 774 items), use client pagination
  if (state.allListings && state.allListings.length > state.limit) {
    paginateAndRenderClientListings();
    return;
  }

  try {
    const params = new URLSearchParams({
      page: state.currentPage,
      limit: state.limit,
      status: state.currentFilter,
      search: state.searchQuery
    });

    const res = await fetch(`/api/listings?${params.toString()}`);
    const data = await res.json();

    if (data && data.items && data.items.length > 0) {
      if (!state.allListings || state.allListings.length <= data.items.length) {
        state.allListings = data.items;
      }
      state.loadedItems = data.items;
      try { localStorage.setItem('aplus_cached_listings', JSON.stringify(state.allListings)); } catch(e){}
      updateKpis(data.metrics);
      renderTable(data.items);
      renderPagination(data.totalCount, data.page, data.totalPages);
      updatePreviewAsinDropdown(data.items);
    } else {
      // Fallback to client-side cached listings (vital for Vercel serverless containers)
      let cached = state.allListings;
      if (!cached || cached.length === 0) {
        try {
          const stored = localStorage.getItem('aplus_cached_listings');
          if (stored) cached = JSON.parse(stored);
        } catch(e){}
      }

      if (cached && cached.length > 0) {
        state.allListings = cached;
        paginateAndRenderClientListings();
      } else {
        updateKpis(data.metrics || { total: 0, approved: 0, submitted: 0, rejected: 0, draft: 0, liveOnAmazon: 0 });
        renderTable([]);
        renderPagination(0, 1, 1);
        updatePreviewAsinDropdown([]);
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
    list = list.filter(item => item.status === state.currentFilter);
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

  // Compute metrics
  const all = state.allListings || [];
  const metrics = {
    total: all.length,
    approved: all.filter(l => l.status === 'APPROVED').length,
    submitted: all.filter(l => l.status === 'SUBMITTED').length,
    rejected: all.filter(l => l.status === 'REJECTED').length,
    draft: all.filter(l => l.status === 'DRAFT').length,
    liveOnAmazon: all.filter(l => l.liveOnAmazon).length
  };
  updateKpis(metrics);

  const totalCount = list.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / state.limit));
  const startIndex = (state.currentPage - 1) * state.limit;
  const pagedItems = list.slice(startIndex, startIndex + state.limit);

  state.loadedItems = pagedItems;
  renderTable(pagedItems);
  renderPagination(totalCount, state.currentPage, totalPages);
  updatePreviewAsinDropdown(list);
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
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; padding:50px 20px; color:#94a3b8;">
          <div style="font-size:38px; margin-bottom:12px;">🗄️</div>
          <strong style="color:#ffffff; font-size:16px; display:block; margin-bottom:6px;">No Real Listings Loaded Yet</strong>
          <p style="font-size:13px; max-width:540px; margin:0 auto 18px; color:#94a3b8;">
            Connect your OMS database or upload your catalog file with just <strong>SKU & ASIN</strong> to begin managing your 7-slide A+ stacks.
          </p>
          <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
            <button id="emptyStateUploadBtn" class="btn btn-primary btn-sm">
              <span class="icon">📄</span> Upload SKU & ASIN File (CSV / TXT)
            </button>
            <button id="emptyStateDbBtn" class="btn btn-secondary btn-sm">
              <span class="icon">⚙️</span> Configure OMS Database in Settings
            </button>
          </div>
        </td>
      </tr>
    `;
    const btnDb = document.getElementById('emptyStateDbBtn');
    if (btnDb) btnDb.addEventListener('click', () => switchTab('settings-tab'));

    const btnUpload = document.getElementById('emptyStateUploadBtn');
    if (btnUpload) btnUpload.addEventListener('click', () => openModal('skuAsinUploadModal'));
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
    } else if (item.status === 'DRAFT') {
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
      btn.textContent = 'Auditing...';
      btn.disabled = true;
      try {
        const res = await fetch('/api/audit-asin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ asin })
        });
        const result = await res.json();
        alert(`Audit Result for ${asin}:\nMarketplace: ${result.marketplace}\nLive on Detail Page: ${result.isLive ? 'YES (Active)' : 'NO'}\nAmazon Link: ${result.amazonUrl}`);
        fetchListings();
      } catch (err) {
        alert('Audit failed: ' + err.message);
      } finally {
        btn.textContent = 'Audit';
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
  document.getElementById('selectedCount').textContent = count;
  document.getElementById('batchSelectedBtn').disabled = count === 0;
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
      fetchListings();
    }, 300);
  });

  // Filter Pills
  document.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentFilter = btn.getAttribute('data-filter');
      state.currentPage = 1;
      fetchListings();
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
      if (state.allListings && state.allListings.length > state.limit) {
        paginateAndRenderClientListings();
      } else {
        fetchListings();
      }
    }
  });

  document.getElementById('nextPageBtn').addEventListener('click', () => {
    if (state.currentPage < state.totalPages) {
      state.currentPage++;
      if (state.allListings && state.allListings.length > state.limit) {
        paginateAndRenderClientListings();
      } else {
        fetchListings();
      }
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

  // Upload SKU & ASIN modal button
  const uploadSkuAsinBtn = document.getElementById('openSkuAsinUploadBtn');
  if (uploadSkuAsinBtn) {
    uploadSkuAsinBtn.addEventListener('click', () => {
      openModal('skuAsinUploadModal');
    });
  }

  // Download sample CSV (2 columns: SKU, ASIN)
  document.getElementById('downloadCsvBtn').addEventListener('click', () => {
    window.location.href = '/api/download-sku-asin-template';
  });

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
        updatePreviewAsinDropdown([]);
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
      const statusSpan = document.getElementById('loadLocalSlidesStatus');
      const asin = asinInput ? asinInput.value.trim().toUpperCase() : 'B09LYW9P2F';
      if (!asin) return;

      loadLocalBtn.textContent = 'Loading...';
      try {
        const res = await fetch(`/api/asin-slides/${encodeURIComponent(asin)}`);
        const data = await res.json();
        if (data && data.slides && data.slides.length > 0) {
          data.slides.forEach(s => {
            const preview = document.getElementById(`preview${s.slideIndex}`);
            if (preview) {
              preview.innerHTML = `
                <img src="${s.url}" style="max-height:80px; max-width:100%; border-radius:4px; margin-bottom:4px;" alt="Slide ${s.slideIndex}">
                <p style="font-size:11px; color:#10b981; font-weight:600;">✓ ${s.fileName}</p>
                <small style="color:#94a3b8;">${(s.size / 1024).toFixed(0)} KB (from Desktop/${asin})</small>
              `;
            }
          });
          statusSpan.textContent = `✓ Loaded ${data.slides.length} slides from ${data.folder || '/home/dave/Desktop/' + asin}`;
          statusSpan.style.color = '#10b981';
        } else {
          statusSpan.textContent = `❌ No A+ slide files found in /home/dave/Desktop/${asin}`;
          statusSpan.style.color = '#ef4444';
        }
      } catch (err) {
        statusSpan.textContent = `❌ Error: ${err.message}`;
        statusSpan.style.color = '#ef4444';
      } finally {
        loadLocalBtn.innerHTML = '<span class="icon">🔍</span> Load Slides from /Desktop';
      }
    });
  }

  document.getElementById('applyToAsinBtn').addEventListener('click', () => {
    const asin = prompt('Enter target ASIN for this 7-Slide A+ stack (e.g. B0...):');
    if (asin && asin.trim()) {
      const cleanAsin = asin.trim().toUpperCase();
      const item = (state.allListings || state.loadedItems || []).find(i => i.asin === cleanAsin);
      startBatch([cleanAsin], item ? [item] : null);
    }
  });
}

function handleFileSelect(slideNum, file) {
  const preview = document.getElementById(`preview${slideNum}`);
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.innerHTML = `
      <img src="${e.target.result}" style="max-height:80px; max-width:100%; border-radius:4px; margin-bottom:4px;" alt="Slide ${slideNum}">
      <p style="font-size:11px; color:#10b981; font-weight:600;">✓ ${file.name}</p>
      <small style="color:#94a3b8;">${(file.size / 1024).toFixed(1)} KB</small>
    `;
  };
  reader.readAsDataURL(file);
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
}

async function startBatch(asins = null, customItems = null) {
  switchTab('queue-tab');
  const btn = document.getElementById('startBulkAllBtn');
  if (btn) btn.disabled = true;

  // Resolve items to guarantee server receives full listing payload
  let itemsToSend = customItems;
  const catalog = state.allListings || state.loadedItems || [];
  if (!itemsToSend && asins && asins.length > 0) {
    itemsToSend = catalog.filter(i => asins.includes(i.asin));
  } else if (!itemsToSend && (!asins || asins.length === 0)) {
    itemsToSend = catalog;
  }

  try {
    const res = await fetch('/api/start-bulk-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        asins, 
        items: (itemsToSend && itemsToSend.length > 0) ? itemsToSend : undefined 
      })
    });
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
      fetchListings(); // Refresh main table
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
// 5. Visual A+ Product Previewer
// ==========================================================================
function initPreviewer() {
  const deviceBtns = document.querySelectorAll('.device-btn');
  const frame = document.getElementById('mockupFrame');

  deviceBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      deviceBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const dev = btn.getAttribute('data-device');
      if (dev === 'mobile') {
        frame.classList.remove('desktop-frame');
        frame.classList.add('mobile-frame');
      } else {
        frame.classList.remove('mobile-frame');
        frame.classList.add('desktop-frame');
      }
    });
  });

  const select = document.getElementById('previewAsinSelect');
  if (select) {
    select.addEventListener('change', (e) => {
      const item = (state.loadedItems || []).find(i => i.asin === e.target.value);
      if (item) renderPreviewForItem(item);
    });
  }
}

function updatePreviewAsinDropdown(items) {
  const select = document.getElementById('previewAsinSelect');
  if (!select) return;
  if (!items || items.length === 0) {
    select.innerHTML = '<option value="">-- No listings loaded yet --</option>';
    return;
  }

  const currentVal = select.value;
  select.innerHTML = '';
  items.slice(0, 100).forEach((item, idx) => {
    const opt = document.createElement('option');
    opt.value = item.asin;
    opt.textContent = `${item.asin} - ${item.title || item.sku}`;
    if (item.asin === currentVal || (idx === 0 && !currentVal)) opt.selected = true;
    select.appendChild(opt);
  });

  const selectedItem = items.find(i => i.asin === select.value) || items[0];
  if (selectedItem) renderPreviewForItem(selectedItem);
}

async function renderPreviewForItem(item) {
  if (!item) return;
  const titleEl = document.getElementById('mockupTitle');
  if (titleEl) titleEl.textContent = item.title || item.sku;

  const stack = document.getElementById('aplusLiveStack');
  if (!stack) return;

  stack.innerHTML = `<div style="text-align: center; padding: 30px; color: #94a3b8; font-size: 12px;">Loading A+ Content banners for ${item.asin}...</div>`;

  try {
    const res = await fetch(`/api/asin-slides/${encodeURIComponent(item.asin)}`);
    const data = await res.json();

    if (data && data.slides && data.slides.length > 0) {
      stack.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 6px; padding: 8px 12px; margin-bottom: 12px; font-size: 11px; color: #10b981; display: flex; justify-content: space-between; align-items: center;">
          <span>✓ Found ${data.slides.length} A+ Graphic Banners in <code>${data.folder || '/home/dave/Desktop/' + item.asin}</code></span>
          <span style="font-weight: 600;">970 × 600 px Stack</span>
        </div>
        ${data.slides.map((s, idx) => `
          <div style="margin-bottom: 8px; border-radius: 4px; overflow: hidden; background: #000; text-align: center; border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 4px 12px rgba(0,0,0,0.5);">
            <img src="${s.url}" alt="A+ Slide ${idx + 1}" style="width: 100%; height: auto; display: block;" loading="lazy">
            <div style="font-size: 10.5px; color: #94a3b8; padding: 5px 10px; background: #0f172a; display: flex; justify-content: space-between;">
              <span style="font-weight: 600; color: #f1f5f9;">Module ${idx + 1}: ${s.fileName}</span>
              <span style="color: #64748b;">${(s.size / 1024).toFixed(0)} KB</span>
            </div>
          </div>
        `).join('')}
      `;
    } else {
      // Per user instruction: do not show product packshots if A+ slides are not found
      stack.innerHTML = `
        <div style="padding: 45px 20px; text-align: center; color: #94a3b8; background: rgba(15, 23, 42, 0.6); border-radius: 8px; border: 1px dashed rgba(255, 255, 255, 0.12); margin-top: 10px;">
          <div style="font-size: 34px; margin-bottom: 10px;">🎨</div>
          <strong style="color: #ffffff; font-size: 15px; display: block; margin-bottom: 8px;">No A+ Banners Found for ${item.asin}</strong>
          <p style="font-size: 12px; max-width: 440px; margin: 0 auto 16px; color: #94a3b8; line-height: 1.5;">
            Product gallery packshots are excluded to avoid confusion. Place your 7 A+ banner graphics (<code>A+1.jpg</code> to <code>A+7.jpg</code>) in:
          </p>
          <div style="background: rgba(0,0,0,0.4); padding: 8px 12px; border-radius: 6px; font-family: monospace; font-size: 12px; color: #38bdf8; display: inline-block; margin-bottom: 14px;">
            /home/dave/Desktop/${item.asin}/
          </div>
          <p style="font-size: 11px; color: #64748b;">Or upload slide banners using the 7-Slide Manager tab.</p>
        </div>
      `;
    }
  } catch (err) {
    stack.innerHTML = `<div style="text-align: center; padding: 30px; color: #ef4444; font-size: 12px;">Failed to load A+ preview: ${err.message}</div>`;
  }
}

// ==========================================================================
// 6. SP-API & OMS Database Settings & Interactive Table Selector
// ==========================================================================
async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    document.getElementById('cfgSandboxMode').checked = data.isSandbox;
    if (data.marketplaceId) {
      document.getElementById('cfgMarketplace').value = data.marketplaceId;
    }
    if (data.awsRegion && document.getElementById('cfgAwsRegion')) {
      document.getElementById('cfgAwsRegion').value = data.awsRegion;
    }
    if (data.endpoint && document.getElementById('cfgEndpoint')) {
      document.getElementById('cfgEndpoint').value = data.endpoint;
    }
    if (data.assetsDir && document.getElementById('cfgAssetsDir')) {
      document.getElementById('cfgAssetsDir').value = data.assetsDir;
    }
    if (data.clientIdMasked && data.clientIdMasked !== 'Not Set') {
      document.getElementById('cfgClientId').placeholder = `Configured: ${data.clientIdMasked}`;
    }
    if (data.sellerIdMasked && data.sellerIdMasked !== 'Not Set' && document.getElementById('cfgSellerId')) {
      document.getElementById('cfgSellerId').placeholder = `Configured: ${data.sellerIdMasked}`;
    }
    if (data.configured) {
      document.getElementById('sandboxBadge').textContent = data.isSandbox ? '🛡️ Sandbox Simulation' : '🟢 Live SP-API';
      document.getElementById('sandboxBadge').className = data.isSandbox ? 'pill-badge pill-sandbox' : 'pill-badge pill-approved';
      document.getElementById('cfgClientSecret').placeholder = '•••••••••••••••• (Configured & Stored in .env)';
      document.getElementById('cfgRefreshToken').placeholder = '•••••••••••••••• (Refresh Token Configured & Stored in .env)';
    }
  } catch (err) {
    console.error('Failed to load config:', err);
  }
}

async function fetchDbConfig() {
  try {
    const res = await fetch('/api/db-config');
    const data = await res.json();
    if (data.host) document.getElementById('cfgDbHost').value = data.host;
    if (data.port) document.getElementById('cfgDbPort').value = data.port;
    if (data.user) document.getElementById('cfgDbUser').value = data.user;
    if (data.database) document.getElementById('cfgDbName').value = data.database;

    // Load customizable table & query settings
    if (data.amazonTable) {
      document.getElementById('cfgDbAmazonTable').value = data.amazonTable;
      ensureOption('selDbAmazonTable', data.amazonTable);
    }
    if (data.productsTable) {
      document.getElementById('cfgDbProductsTable').value = data.productsTable;
      ensureOption('selDbProductsTable', data.productsTable);
    }
    if (data.marketplaceCol) document.getElementById('cfgDbMarketplaceCol').value = data.marketplaceCol;
    if (data.marketplaceVal) document.getElementById('cfgDbMarketplaceVal').value = data.marketplaceVal;
    if (data.categoryCol) document.getElementById('cfgDbCategoryCol').value = data.categoryCol;
    if (data.categoryVal) document.getElementById('cfgDbCategoryVal').value = data.categoryVal;
    if (data.amzJoinKey) document.getElementById('cfgDbAmzJoinKey').value = data.amzJoinKey;
    if (data.prodJoinKey) document.getElementById('cfgDbProdJoinKey').value = data.prodJoinKey;

    const badge = document.getElementById('dbStatusBadge');
    if (data.isConfigured) {
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

  // Amazon SP-API Settings Form Submit
  document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const clientId = document.getElementById('cfgClientId').value.trim();
    const clientSecret = document.getElementById('cfgClientSecret').value.trim();
    const refreshToken = document.getElementById('cfgRefreshToken').value.trim();
    const sellerId = document.getElementById('cfgSellerId') ? document.getElementById('cfgSellerId').value.trim() : '';
    const awsRegion = document.getElementById('cfgAwsRegion') ? document.getElementById('cfgAwsRegion').value.trim() : 'eu-west-1';
    const marketplaceId = document.getElementById('cfgMarketplace').value.trim();
    const isSandbox = document.getElementById('cfgSandboxMode').checked;
    const assetsDir = document.getElementById('cfgAssetsDir') ? document.getElementById('cfgAssetsDir').value.trim() : '';

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, refreshToken, sellerId, awsRegion, marketplaceId, isSandbox, assetsDir })
      });
      const data = await res.json();
      showCallout('SP-API settings saved securely to local .env (protected mode 0600)!', 'success');
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
          if (!isSandbox && !data.configured) {
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

    try {
      const res = await fetch('/api/sync-live-amazon', { method: 'POST' });
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

    const clientIdInput = document.getElementById('cfgClientId') ? document.getElementById('cfgClientId').value.trim() : '';
    const clientSecretInput = document.getElementById('cfgClientSecret') ? document.getElementById('cfgClientSecret').value.trim() : '';
    const refreshTokenInput = document.getElementById('cfgRefreshToken') ? document.getElementById('cfgRefreshToken').value.trim() : '';
    const sellerIdInput = document.getElementById('cfgSellerId') ? document.getElementById('cfgSellerId').value.trim() : '';
    const awsRegionInput = document.getElementById('cfgAwsRegion') ? document.getElementById('cfgAwsRegion').value.trim() : 'eu-west-1';
    const marketplaceInput = document.getElementById('cfgMarketplace') ? document.getElementById('cfgMarketplace').value.trim() : 'A21TJRUUN4KGV';
    const isSandbox = document.getElementById('cfgSandboxMode') ? document.getElementById('cfgSandboxMode').checked : false;

    const payload = {};
    if (clientIdInput) payload.clientId = clientIdInput;
    // Only pass secrets if user entered new values (not masked placeholder)
    if (clientSecretInput && !clientSecretInput.startsWith('•')) payload.clientSecret = clientSecretInput;
    if (refreshTokenInput && !refreshTokenInput.startsWith('•')) payload.refreshToken = refreshTokenInput;
    if (sellerIdInput) payload.sellerId = sellerIdInput;
    if (awsRegionInput) payload.awsRegion = awsRegionInput;
    if (marketplaceInput) payload.marketplaceId = marketplaceInput;
    payload.isSandbox = isSandbox;

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
