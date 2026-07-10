// ============================================================
// INSTANTDOWNLOAD - FRONTEND JAVASCRIPT
// ============================================================

const API_BASE = '/api';

// DOM Elements
const videoUrlInput = document.getElementById('videoUrl');
const fetchBtn = document.getElementById('fetchBtn');
const loadingSection = document.getElementById('loadingSection');
const resultSection = document.getElementById('resultSection');
const downloadProgress = document.getElementById('downloadProgress');

const videoThumbnail = document.getElementById('videoThumbnail');
const videoTitle = document.getElementById('videoTitle');
const videoAuthor = document.getElementById('videoAuthor');
const videoViews = document.getElementById('videoViews');
const videoDuration = document.getElementById('videoDuration');
const platformName = document.getElementById('platformName');
const formatsList = document.getElementById('formatsList');
const newDownloadBtn = document.getElementById('newDownloadBtn');
const downloadStatus = document.getElementById('downloadStatus');

let currentVideoData = null;
let isDownloading = false;

// ====== EVENT LISTENERS ======

fetchBtn.addEventListener('click', handleFetch);
videoUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleFetch();
});
newDownloadBtn.addEventListener('click', resetToHome);

// ====== FETCH VIDEO INFO ======

async function handleFetch() {
  const url = videoUrlInput.value.trim();
  
  if (!url) {
    shakeElement(videoUrlInput);
    videoUrlInput.focus();
    showToast('Please enter a video URL', 'error');
    return;
  }

  if (!isValidUrl(url)) {
    showToast('Please enter a valid URL', 'error');
    return;
  }

  // Show loading
  hideAllSections();
  loadingSection.classList.remove('hidden');
  fetchBtn.disabled = true;
  fetchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

  try {
    const response = await fetch(`${API_BASE}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch video info');
    }

    currentVideoData = result.data;
    showVideoInfo(result.data);

  } catch (error) {
    console.error('Fetch error:', error);
    hideAllSections();
    showToast(error.message || 'Failed to fetch video. Try another link.', 'error');
  } finally {
    fetchBtn.disabled = false;
    fetchBtn.innerHTML = '<span class="btn-text">Get Video</span><i class="fas fa-arrow-right btn-icon"></i>';
  }
}

// ====== SHOW VIDEO INFO ======

function showVideoInfo(data) {
  hideAllSections();
  
  platformName.textContent = data.platform || 'Unknown';
  videoTitle.textContent = data.title || 'Unknown Video';
  videoAuthor.textContent = data.author || 'Unknown';
  videoViews.textContent = formatNumber(data.views || 0);
  videoDuration.textContent = formatDuration(data.duration || 0);
  
  if (data.thumbnail) {
    videoThumbnail.src = data.thumbnail;
    videoThumbnail.onerror = () => {
      videoThumbnail.src = `https://via.placeholder.com/280x160/1a1a2e/6c5ce7?text=${encodeURIComponent(data.platform || 'Video')}`;
    };
  } else {
    videoThumbnail.src = `https://via.placeholder.com/280x160/1a1a2e/6c5ce7?text=${encodeURIComponent(data.platform || 'Video')}`;
  }

  // Render formats
  formatsList.innerHTML = '';
  
  if (data.formats && data.formats.length > 0) {
    data.formats.forEach((format, index) => {
      const card = document.createElement('div');
      card.className = `format-card${index === 0 ? ' best' : ''}`;
      
      const qualityLabel = format.quality || `${format.height || '??'}p`;
      const sizeLabel = format.filesize ? formatFileSize(format.filesize) : '~MB';
      const extLabel = format.ext || 'mp4';
      
      card.innerHTML = `
        <span class="quality">${qualityLabel}</span>
        <span class="ext">${extLabel.toUpperCase()}</span>
        <span class="size">${sizeLabel}</span>
        <button class="download-btn" data-format="${format.format_id || 'best'}">
          <i class="fas fa-download"></i> Download
        </button>
      `;
      
      card.querySelector('.download-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        handleDownload(format.url, qualityLabel, data.title || 'video');
      });
      
      formatsList.appendChild(card);
    });
  } else {
    // Fallback
    const fallbackFormats = [
      { label: 'Open Video', ext: 'mp4', url: data.url || '', best: true }
    ];
    
    fallbackFormats.forEach((fmt) => {
      const card = document.createElement('div');
      card.className = `format-card${fmt.best ? ' best' : ''}`;
      card.innerHTML = `
        <span class="quality">${fmt.label}</span>
        <span class="ext">${fmt.ext.toUpperCase()}</span>
        <span class="size">~MB</span>
        <button class="download-btn">
          <i class="fas fa-download"></i> Download
        </button>
      `;
      
      card.querySelector('.download-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (fmt.url) {
          window.open(fmt.url, '_blank');
        } else {
          showToast('No download URL available', 'error');
        }
      });
      
      formatsList.appendChild(card);
    });
  }

  resultSection.classList.remove('hidden');
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ====== HANDLE DOWNLOAD ======

async function handleDownload(url, qualityLabel, title) {
  if (isDownloading || !url) return;
  isDownloading = true;
  hideAllSections();
  downloadProgress.classList.remove('hidden');
  downloadStatus.textContent = `Preparing ${qualityLabel} download...`;

  try {
    // Tell backend to fetch the video for us
    const response = await fetch(`${API_BASE}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url, 
        format_id: 'best',
        filename: `${title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`
      })
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Download failed');

    const { downloadUrl, proxied, direct, filename, sizeFormatted } = result.data;

    downloadStatus.textContent = `Downloading ${sizeFormatted || 'video'}...`;

    if (proxied && downloadUrl.startsWith('data:')) {
      // Backend fetched the video and returned as base64 - force download
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename || 'video.mp4';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Download started!', 'success');
    } 
    else if (direct) {
      // Try to fetch the URL directly from the frontend
      try {
        downloadStatus.textContent = 'Fetching from source...';
        const blobRes = await fetch(url, {
          headers: { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': 'video/mp4,video/*,*/*'
          }
        });
        
        if (blobRes.ok) {
          const blob = await blobRes.blob();
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename || 'video.mp4';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
          showToast('Download started!', 'success');
        } else {
          // Last resort: open in new tab
          window.open(url, '_blank');
          showToast('Opening in new tab...', 'info');
        }
      } catch (e) {
        window.open(url, '_blank');
        showToast('Opening in new tab...', 'info');
      }
    }

    setTimeout(() => {
      if (currentVideoData) { hideAllSections(); showVideoInfo(currentVideoData); }
      else resetToHome();
      isDownloading = false;
    }, 2000);

  } catch (error) {
    showToast(error.message || 'Download failed.', 'error');
    if (currentVideoData) { hideAllSections(); showVideoInfo(currentVideoData); }
    else resetToHome();
    isDownloading = false;
  }
}

// ====== UTILITY FUNCTIONS ======

function hideAllSections() {
  loadingSection.classList.add('hidden');
  resultSection.classList.add('hidden');
  downloadProgress.classList.add('hidden');
}

function resetToHome() {
  hideAllSections();
  videoUrlInput.value = '';
  videoUrlInput.focus();
  currentVideoData = null;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function isValidUrl(string) {
  try {
    const url = new URL(string);
    return url.hostname.includes('.');
  } catch {
    return false;
  }
}

function formatDuration(seconds) {
  if (!seconds || seconds === 0) return '--:--';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '~MB';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

function shakeElement(el) {
  el.style.animation = 'none';
  el.offsetHeight;
  el.style.animation = 'shake 0.4s ease';
}

// Toast notification system
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const icons = {
    success: 'fas fa-check-circle',
    error: 'fas fa-exclamation-circle',
    info: 'fas fa-info-circle'
  };
  
  toast.innerHTML = `
    <i class="${icons[type] || icons.info}"></i>
    <span>${message}</span>
  `;
  
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ====== INIT ======
document.addEventListener('DOMContentLoaded', () => {
  videoUrlInput.focus();
  console.log('🚀 InstantDownload loaded');
});