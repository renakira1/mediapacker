// Tailwind/CSS constants for UI state updates to avoid duplication
const SELECTED_CARD_CLASSES = ['border-indigo-500', 'ring-2', 'ring-indigo-500', 'shadow-[0_0_15px_rgba(99,102,241,0.2)]'];
const UNSELECTED_CARD_CLASSES = ['border-zinc-200', 'dark:border-zinc-800'];
const SELECTED_BADGE_CLASSES = ['bg-indigo-500', 'border-indigo-500', 'text-white'];
const UNSELECTED_BADGE_CLASSES = ['bg-black/35', 'dark:bg-black/50', 'border-zinc-400', 'dark:border-zinc-600/80', 'text-transparent'];

// Dialog Selection Button styling constants
const DIALOG_BTN_BASE_CLASSES = ['w-full', 'py-2.5', 'px-4', 'rounded-xl', 'text-sm', 'font-semibold', 'transition-all', 'duration-200', 'flex', 'items-center', 'justify-center', 'gap-2', 'active:scale-[0.98]', 'cursor-pointer'];
const SELECTED_DIALOG_BTN_CLASSES = ['bg-emerald-600', 'hover:bg-emerald-700', 'text-white', 'shadow-lg', 'shadow-emerald-500/20'];
const UNSELECTED_DIALOG_BTN_CLASSES = ['bg-zinc-100', 'hover:bg-zinc-200', 'dark:bg-zinc-800', 'dark:hover:bg-zinc-700', 'text-zinc-700', 'dark:text-zinc-300', 'border', 'border-zinc-200', 'dark:border-zinc-700'];

// State Store
let allMedia = [];       // Scanned files
let filteredMedia = [];  // Currently filtered files
let selectedFiles = new Set(); // Set of relative paths (id)

// Pagination & Infinite Scroll
let currentFilter = 'all';
let batchIndex = 0;
const batchSize = 20;
let scrollObserver = null;
let currentColumnsCount = 0;

// Theme Switcher State
let isDarkMode = true;

// Video Audio State
let videoAudioEnabled = false;

// Sorting State
let currentSort = 'name-asc';

// Media Dialog State
let activeDialogIndex = -1;

// Elements
const scanForm = document.getElementById('scan-form');
const directoryInput = document.getElementById('directory-input');
const scanBtn = document.getElementById('scan-btn');
const scanSpinner = document.getElementById('scan-spinner');
const mediaGrid = document.getElementById('media-grid');
const emptyState = document.getElementById('empty-state');
const scrollSentinel = document.getElementById('scroll-sentinel');
const statsPanel = document.getElementById('stats-panel');
const activePathLabel = document.getElementById('active-path-label');
const noticeBar = document.getElementById('notice-bar');
const noticeIcon = document.getElementById('notice-icon');
const noticeTitle = document.getElementById('notice-title');
const noticeDesc = document.getElementById('notice-desc');
const floatingFooter = document.getElementById('floating-footer');
const footerCount = document.getElementById('footer-count');
const exportBtn = document.getElementById('export-btn');
const exportSpinner = document.getElementById('export-spinner');

// Setup Form Listener
scanForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const path = directoryInput.value.trim();
  if (!path) return;
  await scan(path);
});

// Notify Helper
function showNotice(title, desc, type = 'error') {
  noticeBar.classList.remove('hidden');
  noticeTitle.innerText = title;
  noticeDesc.innerText = desc;
  
  // Reset classes to base classes plus type-specific ones
  noticeBar.className = "mb-6 p-4 rounded-xl border flex items-start gap-3 backdrop-blur-md animate-fade-in transition-all";
  noticeIcon.className = "p-1 rounded flex-shrink-0";
  
  if (type === 'error') {
    noticeBar.classList.add(
      'bg-red-50', 'border-red-200', 'text-red-950',
      'dark:bg-red-950/20', 'dark:border-red-900/50', 'dark:text-red-200'
    );
    noticeIcon.classList.add(
      'bg-red-100', 'text-red-650',
      'dark:bg-red-900/30', 'dark:text-red-400'
    );
    noticeIcon.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
  } else if (type === 'success') {
    noticeBar.classList.add(
      'bg-emerald-50', 'border-emerald-200', 'text-emerald-950',
      'dark:bg-emerald-950/20', 'dark:border-emerald-900/50', 'dark:text-emerald-200'
    );
    noticeIcon.classList.add(
      'bg-emerald-100', 'text-emerald-650',
      'dark:bg-emerald-900/30', 'dark:text-emerald-400'
    );
    noticeIcon.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
  }
}

function hideNotice() {
  noticeBar.classList.add('hidden');
}

// Generic API Fetch Helper
async function apiFetch(endpoint, body) {
  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function scan(path) {
  // UI Reset & Spin
  scanBtn.disabled = true;
  scanSpinner.classList.remove('hidden');
  hideNotice();
  
  try {
    const response = await apiFetch('/api/scan', { path: path });
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.detail || 'Scan failed.');
    }

    allMedia = data.files || [];
    allMedia = sortMedia(allMedia, currentSort);
    
    // Show success summary
    const imageCount = allMedia.filter(f => f.type === 'image').length;
    const videoCount = allMedia.filter(f => f.type === 'video').length;
    showNotice(
      'Scan completed successfully!', 
      `Found ${allMedia.length} media files (${imageCount} images, ${videoCount} videos).`,
      'success'
    );

    // Update Labels and Panels
    activePathLabel.innerText = data.directory;
    statsPanel.classList.remove('hidden');
    document.getElementById('controls-bar').classList.remove('hidden');
    document.getElementById('count-all').innerText = allMedia.length;
    document.getElementById('count-image').innerText = imageCount;
    document.getElementById('count-video').innerText = videoCount;

    // Clear Selection
    selectedFiles.clear();
    updateFloatingFooter();

    // Render First Batch
    setFilter('all');

  } catch (err) {
    showNotice('Failed to scan directory', err.message, 'error');
    mediaGrid.classList.add('hidden');
    emptyState.classList.remove('hidden');
    scrollSentinel.classList.add('hidden');
    statsPanel.classList.add('hidden');
    document.getElementById('controls-bar').classList.add('hidden');
    allMedia = [];
    filteredMedia = [];
    selectedFiles.clear();
    updateFloatingFooter();
  } finally {
    scanBtn.disabled = false;
    scanSpinner.classList.add('hidden');
  }
}

// Responsive Masonry Helpers
function getColumnsCount() {
  const width = window.innerWidth;
  if (width >= 1024) return 4;
  if (width >= 768) return 3;
  if (width >= 640) return 2;
  return 1;
}

// Extract shortest column logic helper
function getShortestColumnIndex(colHeights) {
  return colHeights.reduce((minIndex, height, index, arr) => height < arr[minIndex] ? index : minIndex, 0);
}

function rebuildGrid() {
  if (filteredMedia.length === 0) return;
  
  const totalToRender = Math.min(batchIndex * batchSize, filteredMedia.length);
  
  mediaGrid.innerHTML = '';
  
  const cols = [];
  for (let i = 0; i < currentColumnsCount; i++) {
    const col = document.createElement('div');
    col.className = 'flex flex-col gap-4 flex-1 min-w-0';
    mediaGrid.appendChild(col);
    cols.push(col);
  }
  
  // Track estimated height of each column
  const colHeights = new Array(currentColumnsCount).fill(0);
  
  const renderedSlice = filteredMedia.slice(0, totalToRender);
  renderedSlice.forEach((file) => {
    const minIndex = getShortestColumnIndex(colHeights);
    
    const isSelected = selectedFiles.has(file.id);
    const card = createMediaCard(file, isSelected);
    cols[minIndex].appendChild(card);
    
    // Estimate item height
    const estimatedHeight = file.type === 'video' ? 240 : 280;
    colHeights[minIndex] += estimatedHeight;
  });
}

function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

window.addEventListener('resize', debounce(() => {
  const newCols = getColumnsCount();
  if (newCols !== currentColumnsCount) {
    currentColumnsCount = newCols;
    rebuildGrid();
  }
}, 150));

// Filter Logic
function setFilter(filter) {
  currentFilter = filter;
  batchIndex = 0;
  
  // Update Tab Style
  ['all', 'image', 'video'].forEach(f => {
    const btn = document.getElementById(`filter-${f}`);
    if (f === filter) {
      btn.className = "px-3.5 py-1.5 text-xs font-semibold rounded-md bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm dark:shadow-none transition-all";
    } else {
      btn.className = "px-3.5 py-1.5 text-xs font-semibold rounded-md text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 transition-all";
    }
  });

  // Filter Files
  if (filter === 'all') {
    filteredMedia = allMedia;
  } else {
    filteredMedia = allMedia.filter(f => f.type === filter);
  }

  // Clear Grid & Sentinel
  mediaGrid.innerHTML = '';
  
  if (filteredMedia.length === 0) {
    mediaGrid.classList.add('hidden');
    emptyState.classList.remove('hidden');
    scrollSentinel.classList.add('hidden');
  } else {
    emptyState.classList.add('hidden');
    mediaGrid.classList.remove('hidden');
    scrollSentinel.classList.remove('hidden');
    
    // Initialize dynamic columns
    currentColumnsCount = getColumnsCount();
    for (let i = 0; i < currentColumnsCount; i++) {
      const col = document.createElement('div');
      col.className = 'flex flex-col gap-4 flex-1 min-w-0';
      mediaGrid.appendChild(col);
      cols = null; // Unused
    }

    // Render Initial Batch
    renderNextBatch();
    setupInfiniteScroll();
  }
}

// Infinite Scroll Implementation
function setupInfiniteScroll() {
  if (scrollObserver) {
    scrollObserver.disconnect();
  }

  scrollObserver = new IntersectionObserver((entries) => {
    const first = entries[0];
    if (first.isIntersecting) {
      renderNextBatch();
    }
  }, {
    rootMargin: '100px', // Trigger ahead of time
  });

  scrollObserver.observe(scrollSentinel);
}

function renderNextBatch() {
  const start = batchIndex * batchSize;
  const end = start + batchSize;
  const batch = filteredMedia.slice(start, end);

  if (batch.length === 0) {
    scrollSentinel.classList.add('hidden');
    return;
  }

  const cols = Array.from(mediaGrid.children);
  const colHeights = cols.map(col => col.offsetHeight || 0);

  batch.forEach((file) => {
    const minIndex = getShortestColumnIndex(colHeights);

    const isSelected = selectedFiles.has(file.id);
    const card = createMediaCard(file, isSelected);
    if (cols[minIndex]) {
      cols[minIndex].appendChild(card);
      // Estimate card height: we assume a default height for the newly appended card
      const estimatedHeight = file.type === 'video' ? 240 : 280;
      colHeights[minIndex] += estimatedHeight;
    }
  });

  batchIndex++;

  // If we finished rendering all media, hide the sentinel
  if (end >= filteredMedia.length) {
    scrollSentinel.classList.add('hidden');
  }
}

// Render Card Component
function createMediaCard(file, isSelected) {
  const card = document.createElement('div');
  card.id = `card-${file.id}`;
  
  // Set dynamic styling classes using variables
  const borderClasses = isSelected ? SELECTED_CARD_CLASSES : UNSELECTED_CARD_CLASSES;
  card.className = `masonry-card overflow-hidden rounded-xl bg-white dark:bg-zinc-900/60 border ${borderClasses.join(' ')} transition-all duration-300 transform hover:scale-[1.01] hover:border-zinc-350 dark:hover:border-zinc-700 cursor-pointer relative group`;
  
  card.dataset.id = file.id;
  
  card.onclick = (e) => {
    toggleSelection(file.id);
  };

  card.oncontextmenu = (e) => {
    e.preventDefault();
    openDialog(file.id);
  };

  const overlayHeader = `
    <div class="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex justify-between items-start z-20">
      <span class="text-xs text-zinc-100 truncate max-w-[80%]" title="${file.name}">${file.name}</span>
      <span class="text-[10px] text-zinc-300 bg-zinc-950/60 px-1.5 py-0.5 rounded font-mono">${(file.size / (1024 * 1024)).toFixed(1)} MB</span>
    </div>
  `;

  const badgeClasses = isSelected ? SELECTED_BADGE_CLASSES : UNSELECTED_BADGE_CLASSES;
  const activeBadge = `
    <div class="selection-badge absolute bottom-3 right-3 w-6 h-6 rounded-full border ${badgeClasses.join(' ')} flex items-center justify-center transition-all duration-200 z-20">
      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
      </svg>
    </div>
  `;

  const videoBadge = file.type === 'video' ? `
    <div class="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm border border-zinc-800 text-[10px] text-indigo-400 font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 z-20">
      <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z"></path></svg>
      <span>VIDEO</span>
    </div>
  ` : '';

  let mediaContent = '';
  const mediaUrl = `/media/${file.relative_path}`;

  if (file.type === 'image') {
    mediaContent = `
      <div class="w-full bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center overflow-hidden min-h-[120px]">
        <img 
          src="${mediaUrl}" 
          loading="lazy"
          alt="${file.name}"
          class="w-full h-auto object-cover opacity-0 transition-opacity duration-500"
          onload="this.classList.remove('opacity-0')"
        />
      </div>
    `;
  } else if (file.type === 'video') {
    mediaContent = `
      <div class="w-full bg-zinc-100 dark:bg-zinc-950 flex items-center justify-center overflow-hidden min-h-[120px] relative">
        <video 
          src="${mediaUrl}" 
          preload="metadata"
          ${videoAudioEnabled ? '' : 'muted'} 
          loop 
          playsinline
          class="w-full h-auto object-cover"
          onmouseenter="this.play().catch(e => {})"
          onmouseleave="this.pause(); this.currentTime = 0;"
        ></video>
      </div>
    `;
  }

  card.innerHTML = `
    ${overlayHeader}
    ${mediaContent}
    ${activeBadge}
    ${videoBadge}
  `;

  return card;
}

// Toggle Card Selection
function toggleSelection(id) {
  const card = document.getElementById(`card-${id}`);
  const badge = card ? card.querySelector('.selection-badge') : null;
  
  if (selectedFiles.has(id)) {
    selectedFiles.delete(id);
    if (card) {
      card.classList.remove(...SELECTED_CARD_CLASSES);
      card.classList.add(...UNSELECTED_CARD_CLASSES);
    }
    if (badge) {
      badge.classList.remove(...SELECTED_BADGE_CLASSES);
      badge.classList.add(...UNSELECTED_BADGE_CLASSES);
    }
  } else {
    selectedFiles.add(id);
    if (card) {
      card.classList.remove(...UNSELECTED_CARD_CLASSES);
      card.classList.add(...SELECTED_CARD_CLASSES);
    }
    if (badge) {
      badge.classList.remove(...UNSELECTED_BADGE_CLASSES);
      badge.classList.add(...SELECTED_BADGE_CLASSES);
    }
  }

  updateFloatingFooter();
}

// Update floating footer state
function updateFloatingFooter() {
  const count = selectedFiles.size;
  footerCount.innerText = count;
  
  if (count > 0) {
    floatingFooter.classList.remove('translate-y-full');
    
    // Sum sizes of selected files
    const selectedInfo = allMedia.filter(f => selectedFiles.has(f.id));
    const totalSize = selectedInfo.reduce((acc, f) => acc + f.size, 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(1);
    
    document.getElementById('footer-details').innerText = `Total size: ${totalSizeMB} MB`;
  } else {
    floatingFooter.classList.add('translate-y-full');
  }
}

// Quick Actions
function selectAllVisible() {
  filteredMedia.forEach(file => {
    if (!selectedFiles.has(file.id)) {
      selectedFiles.add(file.id);
      const card = document.getElementById(`card-${file.id}`);
      if (card) {
        const badge = card.querySelector('.selection-badge');
        card.classList.remove(...UNSELECTED_CARD_CLASSES);
        card.classList.add(...SELECTED_CARD_CLASSES);
        badge.classList.remove(...UNSELECTED_BADGE_CLASSES);
        badge.classList.add(...SELECTED_BADGE_CLASSES);
      }
    }
  });
  updateFloatingFooter();
}

function clearSelection() {
  selectedFiles.forEach(id => {
    const card = document.getElementById(`card-${id}`);
    if (card) {
      const badge = card.querySelector('.selection-badge');
      card.classList.remove(...SELECTED_CARD_CLASSES);
      card.classList.add(...UNSELECTED_CARD_CLASSES);
      badge.classList.remove(...SELECTED_BADGE_CLASSES);
      badge.classList.add(...UNSELECTED_BADGE_CLASSES);
    }
  });
  selectedFiles.clear();
  updateFloatingFooter();
}



async function exportSelection() {
  if (selectedFiles.size === 0) return;
  
  exportBtn.disabled = true;
  exportSpinner.classList.remove('hidden');
  hideNotice();

  const files = Array.from(selectedFiles);

  try {
    const response = await apiFetch('/api/export', { files: files });
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || 'Export failed.');
    }

    // Stream ZIP file down to client browser
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `mediapacker_export_${new Date().toISOString().slice(0,10)}.zip`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    showNotice('Export Successful!', `Downloaded ZIP package containing ${files.length} items.`, 'success');
    clearSelection();

  } catch (err) {
    showNotice('Failed to export files', err.message, 'error');
  } finally {
    exportBtn.disabled = false;
    exportSpinner.classList.add('hidden');
  }
}

function confirmShutdown() {
  const modal = document.getElementById('confirm-modal');
  modal.classList.remove('hidden');
  setTimeout(() => {
    modal.classList.remove('opacity-0');
    modal.classList.add('opacity-100');
  }, 10);
}

function cancelShutdown() {
  const modal = document.getElementById('confirm-modal');
  modal.classList.remove('opacity-100');
  modal.classList.add('opacity-0');
  setTimeout(() => {
    modal.classList.add('hidden');
  }, 300);
}

async function executeShutdown() {
  cancelShutdown();
  
  const overlay = document.getElementById('shutdown-overlay');
  overlay.classList.remove('hidden');
  setTimeout(() => {
    overlay.classList.remove('opacity-0');
    overlay.classList.add('opacity-100');
  }, 10);

  try {
    await fetch('/api/shutdown', { method: 'POST' });
  } catch (err) {
    console.error("Failed to call shutdown API", err);
  }
}

// Theme Switcher Logic
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  isDarkMode = savedTheme !== 'light';
  applyThemeElements();
}

function applyThemeElements() {
  const htmlEl = document.documentElement;
  const themeText = document.getElementById('theme-text');
  const sunIcon = document.getElementById('sun-icon');
  const moonIcon = document.getElementById('moon-icon');
  
  if (isDarkMode) {
    htmlEl.classList.add('dark');
    themeText.innerText = 'Light Mode';
    sunIcon.classList.remove('hidden');
    moonIcon.classList.add('hidden');
  } else {
    htmlEl.classList.remove('dark');
    themeText.innerText = 'Dark Mode';
    sunIcon.classList.add('hidden');
    moonIcon.classList.remove('hidden');
  }
}

function toggleTheme() {
  isDarkMode = !isDarkMode;
  localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  applyThemeElements();
}

// Audio Control Logic
function initAudio() {
  const savedAudio = localStorage.getItem('videoAudioEnabled');
  if (savedAudio !== null) {
    videoAudioEnabled = savedAudio === 'true';
  } else {
    videoAudioEnabled = false; // Default is false (videos start muted)
  }
  document.getElementById('video-audio-checkbox').checked = videoAudioEnabled;
}

function handleAudioToggle() {
  const checkbox = document.getElementById('video-audio-checkbox');
  videoAudioEnabled = checkbox.checked;
  localStorage.setItem('videoAudioEnabled', videoAudioEnabled);
  
  const videos = document.querySelectorAll('video');
  videos.forEach(v => {
    v.muted = !videoAudioEnabled;
  });

  // Keep dialog mute button icon in sync
  syncDialogMuteIcon();
}

// Sync dialog mute button icons to current videoAudioEnabled state
function syncDialogMuteIcon() {
  const soundIcon = document.getElementById('dialog-mute-icon-sound');
  const mutedIcon = document.getElementById('dialog-mute-icon-muted');
  if (!soundIcon || !mutedIcon) return;
  if (videoAudioEnabled) {
    soundIcon.classList.remove('hidden');
    mutedIcon.classList.add('hidden');
  } else {
    soundIcon.classList.add('hidden');
    mutedIcon.classList.remove('hidden');
  }
}

// Toggle play/pause on the dialog video when clicked
function toggleDialogVideoPlayback(event) {
  event.stopPropagation(); // Don't trigger card click or dialog close
  const video = document.getElementById('dialog-video');
  if (!video || video.classList.contains('hidden')) return;
  if (video.paused) {
    video.play().catch(err => console.log('Play prevented', err));
  } else {
    video.pause();
  }
}

// Toggle mute via the dialog mute button (mirrors global audio toggle)
function toggleDialogMute(event) {
  event.stopPropagation();
  videoAudioEnabled = !videoAudioEnabled;
  localStorage.setItem('videoAudioEnabled', videoAudioEnabled);

  // Sync all videos on the page
  document.querySelectorAll('video').forEach(v => { v.muted = !videoAudioEnabled; });

  // Keep global checkbox in sync
  const checkbox = document.getElementById('video-audio-checkbox');
  if (checkbox) checkbox.checked = videoAudioEnabled;

  syncDialogMuteIcon();
}

// Sorting Logic
function initSorting() {
  const savedSort = localStorage.getItem('sortOption');
  if (savedSort !== null) {
    currentSort = savedSort;
  } else {
    currentSort = 'name-asc';
  }
  document.getElementById('sort-select').value = currentSort;
}

function handleSortChange() {
  const select = document.getElementById('sort-select');
  currentSort = select.value;
  localStorage.setItem('sortOption', currentSort);
  
  allMedia = sortMedia(allMedia, currentSort);
  setFilter(currentFilter);
}

const SORT_COMPARATORS = {
  'name-asc':  (a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}),
  'name-desc': (a, b) => b.name.localeCompare(a.name, undefined, {numeric: true, sensitivity: 'base'}),
  'size-desc': (a, b) => b.size - a.size,
  'size-asc':  (a, b) => a.size - b.size,
  'date-desc': (a, b) => (b.modified || 0) - (a.modified || 0),
  'date-asc':  (a, b) => (a.modified || 0) - (b.modified || 0),
};

function sortMedia(mediaList, sortType) {
  const cmp = SORT_COMPARATORS[sortType];
  return cmp ? [...mediaList].sort(cmp) : mediaList;
}

// Dialog Navigation and Control
function openDialog(id) {
  const index = filteredMedia.findIndex(file => file.id === id);
  if (index === -1) return;

  activeDialogIndex = index;
  updateDialogContent();

  const dialog = document.getElementById('media-dialog');
  const container = document.getElementById('dialog-container');
  
  dialog.classList.remove('hidden');
  
  // Force reflow
  dialog.offsetHeight;
  
  dialog.classList.remove('opacity-0');
  dialog.classList.add('opacity-100');
  
  container.classList.remove('scale-95', 'opacity-0');
  container.classList.add('scale-100', 'opacity-100');

  document.body.classList.add('overflow-hidden');
}

function closeDialog() {
  if (activeDialogIndex === -1) return;

  const dialog = document.getElementById('media-dialog');
  const container = document.getElementById('dialog-container');
  const video = document.getElementById('dialog-video');
  
  // Stop video
  video.pause();
  video.src = '';
  
  dialog.classList.remove('opacity-100');
  dialog.classList.add('opacity-0');
  
  container.classList.remove('scale-100', 'opacity-100');
  container.classList.add('scale-95', 'opacity-0');

  document.body.classList.remove('overflow-hidden');

  setTimeout(() => {
    dialog.classList.add('hidden');
    activeDialogIndex = -1;
  }, 300);
}

function updateDialogContent() {
  if (activeDialogIndex === -1) return;
  const file = filteredMedia[activeDialogIndex];
  if (!file) return;

  // Update index label
  document.getElementById('dialog-index-label').innerText = `${activeDialogIndex + 1} of ${filteredMedia.length}`;

  // Update badge
  const badge = document.getElementById('dialog-type-badge');
  badge.innerText = file.type;
  if (file.type === 'image') {
    badge.className = 'px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30';
  } else {
    badge.className = 'px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-100 dark:border-purple-900/30';
  }

  // Update text fields
  document.getElementById('dialog-filename').innerText = file.name;
  document.getElementById('dialog-filename').title = file.name;
  
  // Format size
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
  const sizeKB = (file.size / 1024).toFixed(1);
  const sizeStr = file.size > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
  document.getElementById('dialog-size').innerText = `${sizeStr} (${file.size.toLocaleString()} bytes)`;
  
  // Format date
  const dateStr = new Date(file.modified * 1000).toLocaleString();
  document.getElementById('dialog-date').innerText = dateStr;
  
  // Absolute path
  document.getElementById('dialog-path').innerText = file.absolute_path;

  // Update selection button
  updateDialogSelectionButton(file.id);

  // Render media
  const img = document.getElementById('dialog-image');
  const video = document.getElementById('dialog-video');
  const muteBtn = document.getElementById('dialog-mute-btn');
  const mediaUrl = `/media/${file.relative_path}`;

  if (file.type === 'image') {
    video.classList.add('hidden');
    video.pause();
    video.src = '';
    muteBtn.classList.add('hidden');
    
    img.classList.remove('hidden');
    img.src = mediaUrl;
  } else if (file.type === 'video') {
    img.classList.add('hidden');
    img.src = '';
    
    video.classList.remove('hidden');
    video.src = mediaUrl;
    video.muted = !videoAudioEnabled;
    video.play().catch(err => console.log("Auto-play prevented", err));

    // Show mute button and sync icon
    muteBtn.classList.remove('hidden');
    syncDialogMuteIcon();
  }
}

function updateDialogSelectionButton(id) {
  const btn = document.getElementById('dialog-select-btn');
  const iconSpan = document.getElementById('dialog-select-btn-icon');
  const textSpan = document.getElementById('dialog-select-btn-text');
  const isSelected = selectedFiles.has(id);

  btn.className = DIALOG_BTN_BASE_CLASSES.join(' ');
  if (isSelected) {
    btn.classList.add(...SELECTED_DIALOG_BTN_CLASSES);
    iconSpan.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>`;
    textSpan.innerText = 'Selected (Click to Remove)';
  } else {
    btn.classList.add(...UNSELECTED_DIALOG_BTN_CLASSES);
    iconSpan.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>`;
    textSpan.innerText = 'Select for Export';
  }
}

function toggleDialogSelection() {
  if (activeDialogIndex === -1) return;
  const file = filteredMedia[activeDialogIndex];
  if (!file) return;

  toggleSelection(file.id);
  updateDialogSelectionButton(file.id);
}

function navigateDialog(dir) {
  if (activeDialogIndex === -1 || filteredMedia.length === 0) return;
  
  let newIndex = activeDialogIndex + dir;
  if (newIndex < 0) {
    newIndex = filteredMedia.length - 1;
  } else if (newIndex >= filteredMedia.length) {
    newIndex = 0;
  }

  activeDialogIndex = newIndex;
  updateDialogContent();
}

// Close dialog when clicking the background overlay
const mediaDialogEl = document.getElementById('media-dialog');
mediaDialogEl.addEventListener('click', (e) => {
  if (e.target === mediaDialogEl) {
    closeDialog();
  }
});

// Keyboard navigation
window.addEventListener('keydown', (e) => {
  if (activeDialogIndex === -1) return;

  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    navigateDialog(-1);
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    e.preventDefault();
    navigateDialog(1);
  } else if (e.key === ' ' || e.key === 'Spacebar') {
    e.preventDefault();
    toggleDialogSelection();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closeDialog();
  }
});

// Initializations
initTheme();
initAudio();
initSorting();

// ─── File Browser ────────────────────────────────────────────────────────────

let browserCurrentPath = null;
let browserParentPath = null;

async function openFileBrowser() {
  const modal = document.getElementById('file-browser-modal');
  modal.classList.remove('hidden');
  modal.offsetHeight; // force reflow
  modal.classList.remove('opacity-0');
  modal.classList.add('opacity-100');
  document.body.classList.add('overflow-hidden');

  // Start from whatever is in the input, or default (home dir)
  const inputVal = directoryInput.value.trim();
  await browserNavigateTo(inputVal || '');
}

function closeFileBrowser() {
  const modal = document.getElementById('file-browser-modal');
  modal.classList.remove('opacity-100');
  modal.classList.add('opacity-0');
  document.body.classList.remove('overflow-hidden');
  setTimeout(() => modal.classList.add('hidden'), 250);
}

// Close on backdrop click
document.getElementById('file-browser-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('file-browser-modal')) closeFileBrowser();
});

async function browserNavigateTo(path) {
  const spinner = document.getElementById('browser-spinner');
  const errorEl = document.getElementById('browser-error');
  const listEl = document.getElementById('browser-dir-list');
  const upBtn = document.getElementById('browser-up-btn');
  const currentPathEl = document.getElementById('browser-current-path');

  spinner.classList.remove('hidden');
  errorEl.classList.add('hidden');
  listEl.innerHTML = '';

  try {
    const params = path ? `?path=${encodeURIComponent(path)}` : '';
    const res = await fetch(`/api/browse${params}`);
    const data = await res.json();

    if (!res.ok) {
      errorEl.textContent = data.detail || 'Failed to read directory.';
      errorEl.classList.remove('hidden');
      return;
    }

    browserCurrentPath = data.path;
    browserParentPath = data.parent;

    currentPathEl.textContent = data.path;
    upBtn.disabled = !data.parent;

    if (data.directories.length === 0) {
      listEl.innerHTML = `
        <div class="flex flex-col items-center justify-center py-10 text-center text-zinc-400 dark:text-zinc-500">
          <svg class="w-8 h-8 mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"></path>
          </svg>
          <span class="text-xs font-medium">No subdirectories here</span>
          <span class="text-[11px] mt-0.5 opacity-70">You can still select this folder</span>
        </div>`;
    } else {
      data.directories.forEach(name => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-zinc-100 dark:hover:bg-zinc-800 active:bg-zinc-200 dark:active:bg-zinc-700 transition-colors group';
        item.innerHTML = `
          <div class="flex-shrink-0 w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/40 flex items-center justify-center text-indigo-500 dark:text-indigo-400 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/50 transition-colors">
            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"></path></svg>
          </div>
          <span class="text-sm font-medium text-zinc-700 dark:text-zinc-200 truncate flex-grow">${name}</span>
          <svg class="w-4 h-4 text-zinc-300 dark:text-zinc-600 flex-shrink-0 group-hover:text-indigo-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>`;
        item.addEventListener('click', () => {
          const fullPath = browserCurrentPath.endsWith('/')
            ? `${browserCurrentPath}${name}`
            : `${browserCurrentPath}/${name}`;
          browserNavigateTo(fullPath);
        });
        listEl.appendChild(item);
      });
    }
  } catch (err) {
    errorEl.textContent = `Network error: ${err.message}`;
    errorEl.classList.remove('hidden');
  } finally {
    spinner.classList.add('hidden');
  }
}

function browserNavigateUp() {
  if (browserParentPath) {
    browserNavigateTo(browserParentPath);
  }
}

function browserSelectCurrent() {
  if (!browserCurrentPath) return;
  directoryInput.value = browserCurrentPath;
  closeFileBrowser();
  // Automatically kick off the scan
  scan(browserCurrentPath);
}

