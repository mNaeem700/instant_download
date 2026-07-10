const express = require('express');
const serverless = require('serverless-http');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
  if (u.includes('snapchat')) return 'Snapchat';
  if (u.includes('likee') || u.includes('like.video')) return 'Likee';
  if (u.includes('sharechat')) return 'ShareChat';
  if (u.includes('ted.com')) return 'TED';
  return 'Unknown';
}

function extractYoutubeId(url) {
  const match = url.match(/(?:v=|\/|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?&]|$)/);
  return match ? match[1] : null;
}

// ============================================================
// YOUTUBE - Using multiple free methods
// ============================================================

async function getYouTubeInfo(url) {
  const vidId = extractYoutubeId(url);
  if (!vidId) throw new Error('Invalid YouTube URL');

  // Method 1: Try invidious API (no scraping needed)
  try {
    const instances = [
      'https://inv.nadeko.net',
      'https://yewtu.be',
      'https://invidious.snopyta.org',
      'https://vid.puffyan.us'
    ];
    
    for (const instance of instances) {
      try {
        const res = await axios.get(`${instance}/api/v1/videos/${vidId}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          timeout: 5000
        });
        
        const data = res.data;
        const formats = [];
        
        // Try to get video formats from the invidious instance
        if (data.formatStreams) {
          data.formatStreams.forEach(f => {
            formats.push({
              quality: f.qualityLabel || `${f.resolution || '??'}p`,
              url: f.url,
              size: '',
              ext: f.container || 'mp4'
            });
          });
        }
        
        // Also try adaptive formats
        if (data.adaptiveFormats) {
          data.adaptiveFormats.filter(f => f.type && f.type.includes('video')).forEach(f => {
            const existingQualities = formats.map(fmt => fmt.quality);
            const q = f.qualityLabel || `${f.resolution || '??'}p`;
            if (!existingQualities.includes(q)) {
              formats.push({
                quality: q,
                url: f.url,
                size: '',
                ext: f.container || 'mp4'
              });
            }
          });
        }
        
        if (formats.length > 0) {
          return {
            title: data.title || 'YouTube Video',
            thumbnail: `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`,
            platform: 'YouTube',
            formats: formats.slice(0, 8)
          };
        }
      } catch (e) {
        continue; // Try next instance
      }
    }
  } catch (e) {
    console.log('Invidious failed');
  }

  // Method 2: Try y2mate
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

    const responseText = typeof analyzeRes.data === 'string' ? analyzeRes.data : JSON.stringify(analyzeRes.data);
    const keyMatch = responseText.match(/k_id["']?\s*[:=]\s*["']([^"']+)["']/);
    const key = keyMatch ? keyMatch[1] : '';

    if (key) {
      const convertData = new URLSearchParams();
      convertData.append('k_query', url);
      convertData.append('k_id', key);
      convertData.append('k_page', 'home');
      convertData.append('hl', 'en');

      const convertRes = await axios.post('https://www.y2mate.com/mates/en68/convertV2/ajax', convertData.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10000
      });

      const html = typeof convertRes.data === 'string' ? convertRes.data : convertRes.data.result || '';
      const $ = cheerio.load(html);
      
      const formats = [];
      $('a[href*="https://"]').each((i, el) => {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        if (href && (text.includes('p') || text.includes('MP4') || text.includes('MB'))) {
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
    console.log('y2mate failed');
  }

  // Method 3: Try yt-download.org
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

  // Fallback
  return {
    title: 'YouTube Video',
    thumbnail: `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`,
    platform: 'YouTube',
    formats: [
      { quality: 'Open in YouTube', url: `https://www.youtube.com/watch?v=${vidId}`, size: '', ext: 'mp4' }
    ]
  };
}

// ============================================================
// TIKTOK
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
        formats
      };
    }
  } catch (e) {}
  
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
        title, thumbnail: thumb, platform: 'Instagram',
        formats: links.map((l, i) => ({ quality: i === 0 ? 'HD Video' : 'Standard', url: l, size: '', ext: 'mp4' }))
      };
    }
  } catch (e) {}
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
        title, thumbnail: thumb, platform: 'Facebook',
        formats: links.map((l, i) => ({ quality: i === 0 ? 'HD' : 'SD', url: l, size: '', ext: 'mp4' }))
      };
    }
  } catch (e) {}
  throw new Error('Could not fetch Facebook video');
}

// ============================================================
// GENERIC SCRAPER
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
    $('video source, video[src]').each((i, el) => {
      const src = $(el).attr('src');
      if (src) links.push(src);
    });
    const ogVideo = $('meta[property="og:video"]').attr('content') || $('meta[name="twitter:player:stream"]').attr('content');
    if (ogVideo && !links.includes(ogVideo)) links.push(ogVideo);
    const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || `${platform} Video`;
    const thumb = $('meta[property="og:image"]').attr('content') || '';
    return {
      title, thumbnail: thumb, platform,
      formats: links.length > 0
        ? links.map(l => ({ quality: 'Video', url: l.startsWith('//') ? 'https:' + l : l, size: '', ext: 'mp4' }))
        : [{ quality: 'Open Link', url, size: '', ext: 'mp4' }]
    };
  } catch (e) {
    return { title: `${platform} Video`, thumbnail: '', platform, formats: [{ quality: 'Open Link', url, size: '', ext: 'mp4' }] };
  }
}

// ============================================================
// PROXY DOWNLOAD - Fetch video through the function
// ============================================================

async function proxyDownload(videoUrl) {
  try {
    const response = await axios({
      method: 'GET',
      url: videoUrl,
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Referer': videoUrl.includes('youtube') ? 'https://www.youtube.com/' : (
                      videoUrl.includes('tiktok') ? 'https://www.tiktok.com/' : (
                        videoUrl.includes('instagram') ? 'https://www.instagram.com/' : ''
                      )
                    )
      },
      timeout: 25000, // 25 seconds (fits within Netlify's 30s)
      maxContentLength: 15 * 1024 * 1024, // 15MB max
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    });

    const contentType = response.headers['content-type'] || 'video/mp4';
    const buffer = Buffer.from(response.data);

    return {
      buffer,
      contentType,
      size: buffer.length
    };
  } catch (err) {
    throw new Error(`Proxy failed: ${err.message}`);
  }
}

// ============================================================
// API ROUTES
// ============================================================

app.post('/info', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || !url.trim()) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }
    
    const platform = detectPlatform(url);
    let data;
    
    if (platform === 'YouTube') data = await getYouTubeInfo(url);
    else if (platform === 'TikTok') data = await getTikTokInfo(url);
    else if (platform === 'Instagram') data = await getInstagramInfo(url);
    else if (platform === 'Facebook') data = await getFacebookInfo(url);
    else data = await getGenericInfo(url);
    
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

app.post('/download', async (req, res) => {
  try {
    const { url: videoUrl, format_id, filename } = req.body;
    if (!videoUrl) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    // If it's a direct external link (youtube.com, etc), redirect
    if (videoUrl.includes('youtube.com/watch') || videoUrl.includes('youtu.be')) {
      return res.json({
        success: true,
        data: {
          downloadUrl: videoUrl,
          filename: filename || 'video.mp4',
          direct: true
        }
      });
    }

    // Try to proxy the video through the function
    try {
      console.log(`Proxying download from: ${videoUrl.substring(0, 100)}...`);
      const proxied = await proxyDownload(videoUrl);
      
      // Return as base64 if under 10MB
      if (proxied.size < 10 * 1024 * 1024) {
        const base64 = proxied.buffer.toString('base64');
        const dataUri = `data:${proxied.contentType};base64,${base64}`;
        
        return res.json({
          success: true,
          data: {
            downloadUrl: dataUri,
            filename: filename || 'video.mp4',
            direct: false,
            proxied: true,
            size: proxied.size
          }
        });
      }
    } catch (proxyErr) {
      console.log('Proxy download failed, falling back to direct URL:', proxyErr.message);
    }

    // Fallback: return the original URL (browser will try to download)
    res.json({
      success: true,
      data: {
        downloadUrl: videoUrl,
        filename: filename || 'video.mp4',
        direct: true
      }
    });

  } catch (err) {
    console.error('Download error:', err);
    res.json({
      success: true,
      data: {
        downloadUrl: req.body.url,
        filename: 'video.mp4',
        direct: true
      }
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Wrap for Netlify
const handler = serverless(app);

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };
  
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  
  const result = await handler(event, context);
  result.headers = { ...result.headers, ...headers };
  return result;
};