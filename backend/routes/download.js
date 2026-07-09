const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');

// ============================================================
// PLATFORM DETECTION
// ============================================================

function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes('youtube') || u.includes('youtu.be')) return 'YouTube';
  if (u.includes('instagram') || u.includes('instagr.am')) return 'Instagram';
  if (u.includes('tiktok')) return 'TikTok';
  if (u.includes('facebook') || u.includes('fb.com') || u.includes('fb.watch')) return 'Facebook';
  if (u.includes('twitter') || u.includes('x.com')) return 'Twitter/X';
  if (u.includes('vimeo')) return 'Vimeo';
  if (u.includes('dailymotion')) return 'Dailymotion';
  if (u.includes('twitch')) return 'Twitch';
  if (u.includes('reddit')) return 'Reddit';
  if (u.includes('linkedin')) return 'LinkedIn';
  if (u.includes('pinterest')) return 'Pinterest';
  return 'Unknown';
}

// ============================================================
// EXTRACT YOUTUBE VIDEO ID
// ============================================================

function extractYoutubeId(url) {
  const match = url.match(/(?:v=|\/|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?&]|$)/);
  return match ? match[1] : null;
}

// ============================================================
// YOUTUBE - Using multiple free APIs
// ============================================================

async function getYouTubeInfo(url) {
  const vidId = extractYoutubeId(url);
  if (!vidId) throw new Error('Invalid YouTube URL');

  // Method 1: Try y2mate.com
  try {
    const formData = new URLSearchParams();
    formData.append('k_query', url);
    formData.append('k_page', 'home');
    formData.append('hl', 'en');

    const analyzeRes = await axios.post('https://www.y2mate.com/mates/en68/analyzeV2/ajax', formData.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://www.y2mate.com',
        'Referer': 'https://www.y2mate.com/en68'
      },
      timeout: 10000
    });

    // Try to get the key from response
    let key = '';
    const responseText = typeof analyzeRes.data === 'string' ? analyzeRes.data : JSON.stringify(analyzeRes.data);
    const keyMatch = responseText.match(/k_id["']?\s*[:=]\s*["']([^"']+)["']/);
    if (keyMatch) key = keyMatch[1];

    if (key) {
      const convertData = new URLSearchParams();
      convertData.append('k_query', url);
      convertData.append('k_id', key);
      convertData.append('k_page', 'home');
      convertData.append('hl', 'en');

      const convertRes = await axios.post('https://www.y2mate.com/mates/en68/convertV2/ajax', convertData.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
          'Origin': 'https://www.y2mate.com',
          'Referer': 'https://www.y2mate.com/en68'
        },
        timeout: 10000
      });

      const html = typeof convertRes.data === 'string' ? convertRes.data : convertRes.data.result || '';
      const $ = cheerio.load(html);
      
      const formats = [];
      $('a[href*="https://"]').each((i, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        if (href && (text.includes('p') || text.includes('MP4') || text.includes('mp4') || text.includes('MB'))) {
          const qMatch = text.match(/(\d+p)/);
          const sMatch = text.match(/([\d.]+ MB)/);
          if (href.startsWith('http')) {
            formats.push({
              quality: qMatch ? qMatch[1] : 'Video',
              url: href,
              size: sMatch ? sMatch[1] : '',
              ext: 'mp4'
            });
          }
        }
      });

      if (formats.length > 0) {
        return {
          title: 'YouTube Video',
          thumbnail: `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`,
          platform: 'YouTube',
          formats: formats.slice(0, 8)
        };
      }
    }
  } catch (e) {
    console.log('y2mate failed, trying next method...');
  }

  // Method 2: Use direct YouTube thumbnail + YouTube to MP4 free API
  try {
    const res = await axios.get(`https://www.yt-download.org/api/button/mp4/${vidId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    });
    const $ = cheerio.load(res.data);
    const links = [];
    $('a[href*="googlevideo.com"], a[download]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.includes('googlevideo')) links.push(href);
    });
    
    if (links.length > 0) {
      return {
        title: 'YouTube Video',
        thumbnail: `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`,
        platform: 'YouTube',
        formats: links.map((l, i) => ({
          quality: i === 0 ? 'Best Quality' : 'Standard',
          url: l,
          size: '',
          ext: 'mp4'
        }))
      };
    }
  } catch (e) {
    console.log('yt-download.org failed');
  }

  // Method 3: Ultimate fallback - return thumbnail + common qualities
  return {
    title: 'YouTube Video',
    thumbnail: `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`,
    platform: 'YouTube',
    formats: [
      {
        quality: 'Download Video',
        url: `https://www.youtube.com/watch?v=${vidId}`,
        size: '',
        ext: 'mp4'
      }
    ]
  };
}

// ============================================================
// TIKTOK - Using tikwm.com API
// ============================================================

async function getTikTokInfo(url) {
  try {
    const formData = new URLSearchParams();
    formData.append('url', url);
    formData.append('hd', '1');

    const res = await axios.post('https://www.tikwm.com/api/', formData.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      timeout: 10000
    });

    const data = res.data;
    if (data && data.code === 0 && data.data) {
      const d = data.data;
      const formats = [];
      
      if (d.hdplay) formats.push({ quality: 'HD Video', url: d.hdplay, size: '', ext: 'mp4' });
      if (d.play) formats.push({ quality: 'SD Video', url: d.play, size: '', ext: 'mp4' });
      if (d.music) formats.push({ quality: 'Audio', url: d.music, size: '', ext: 'mp3' });

      return {
        title: d.title || 'TikTok Video',
        thumbnail: d.cover || '',
        platform: 'TikTok',
        formats: formats
      };
    }
  } catch (e) {
    console.log('TikWM failed:', e.message);
  }

  throw new Error('Could not fetch TikTok video');
}

// ============================================================
// INSTAGRAM
// ============================================================

async function getInstagramInfo(url) {
  try {
    const res = await axios.get(`https://v3.instasave.io/instagram-video-downloader?url=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    
    const links = [];
    $('a[href*=".mp4"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href) links.push(href);
    });

    const thumb = $('meta[property="og:image"]').attr('content') || '';
    const title = $('title').text().trim() || 'Instagram Video';

    if (links.length > 0) {
      return {
        title,
        thumbnail: thumb,
        platform: 'Instagram',
        formats: links.map((l, i) => ({
          quality: i === 0 ? 'HD Video' : 'Standard',
          url: l,
          size: '',
          ext: 'mp4'
        }))
      };
    }
  } catch (e) {
    console.log('Instagram method failed:', e.message);
  }

  throw new Error('Could not fetch Instagram video');
}

// ============================================================
// FACEBOOK
// ============================================================

async function getFacebookInfo(url) {
  try {
    const res = await axios.get(`https://www.getfvid.com/download?url=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 10000
    });
    const $ = cheerio.load(res.data);
    
    const links = [];
    $('a[href*=".mp4"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && href.startsWith('http')) links.push(href);
    });

    const title = $('title').text().trim() || 'Facebook Video';
    const thumb = $('meta[property="og:image"]').attr('content') || '';

    if (links.length > 0) {
      return {
        title,
        thumbnail: thumb,
        platform: 'Facebook',
        formats: links.map((l, i) => ({
          quality: i === 0 ? 'HD' : 'SD',
          url: l,
          size: '',
          ext: 'mp4'
        }))
      };
    }
  } catch (e) {
    console.log('Facebook method failed:', e.message);
  }

  throw new Error('Could not fetch Facebook video');
}

// ============================================================
// GENERIC SCRAPER (for any other site)
// ============================================================

async function getGenericInfo(url) {
  const platform = detectPlatform(url);
  
  try {
    const res = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 8000
    });
    const $ = cheerio.load(res.data);
    
    const links = [];
    
    // Try to find video sources
    $('video source').each((i, el) => {
      const src = $(el).attr('src');
      if (src) links.push(src);
    });
    
    $('video[src]').each((i, el) => {
      const src = $(el).attr('src');
      if (src) links.push(src);
    });
    
    // Try og:video meta
    const ogVideo = $('meta[property="og:video"]').attr('content') || $('meta[name="twitter:player:stream"]').attr('content');
    if (ogVideo && !links.includes(ogVideo)) links.push(ogVideo);

    const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || `${platform} Video`;
    const thumb = $('meta[property="og:image"]').attr('content') || '';

    const formats = links.map((l, i) => ({
      quality: i === 0 ? 'Video' : 'Alternative',
      url: l.startsWith('//') ? 'https:' + l : l,
      size: '',
      ext: 'mp4'
    }));

    return {
      title,
      thumbnail: thumb,
      platform,
      formats: formats.length > 0 ? formats : [{ quality: 'Open Video', url, size: '', ext: 'mp4' }]
    };
  } catch (e) {
    return {
      title: `${platform} Video`,
      thumbnail: '',
      platform,
      formats: [{ quality: 'Open Link', url, size: '', ext: 'mp4' }]
    };
  }
}

// ============================================================
// API ROUTE: GET VIDEO INFO
// ============================================================

router.post('/info', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || url.trim() === '') {
      return res.status(400).json({ success: false, error: 'Please enter a video URL' });
    }

    const platform = detectPlatform(url);
    let data;

    try {
      if (platform === 'YouTube') {
        data = await getYouTubeInfo(url);
      } else if (platform === 'TikTok') {
        data = await getTikTokInfo(url);
      } else if (platform === 'Instagram') {
        data = await getInstagramInfo(url);
      } else if (platform === 'Facebook') {
        data = await getFacebookInfo(url);
      } else {
        data = await getGenericInfo(url);
      }
    } catch (err) {
      console.log(`Specific handler failed for ${platform}, using generic:`, err.message);
      data = await getGenericInfo(url);
    }

    res.json({ success: true, data });

  } catch (err) {
    console.error('Info error:', err);
    res.json({ 
      success: true, 
      data: {
        title: 'Video',
        thumbnail: '',
        platform: 'Unknown',
        formats: [{ quality: 'Open Link', url: req.body.url, size: '', ext: 'mp4' }]
      }
    });
  }
});

// ============================================================
// API ROUTE: DOWNLOAD (proxy for videos)
// ============================================================

router.post('/download', async (req, res) => {
  try {
    const { url: videoUrl } = req.body;
    if (!videoUrl) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    // Just return the URL directly - browser will download it
    res.json({
      success: true,
      data: {
        downloadUrl: videoUrl,
        filename: 'video.mp4'
      }
    });

  } catch (err) {
    console.error('Download error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;