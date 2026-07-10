const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');

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

function extractYoutubeId(url) {
  const match = url.match(/(?:v=|\/|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?&]|$)/);
  return match ? match[1] : null;
}

// ============================================================
// YOUTUBE
// ============================================================

async function getYouTubeInfo(url) {
  const vidId = extractYoutubeId(url);
  if (!vidId) throw new Error('Invalid YouTube URL');

  try {
    const instances = ['https://inv.nadeko.net', 'https://invidious.snopyta.org', 'https://vid.puffyan.us'];
    for (const instance of instances) {
      try {
        const res = await axios.get(`${instance}/api/v1/videos/${vidId}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 5000
        });
        const data = res.data;
        const formats = [];
        if (data.formatStreams) {
          data.formatStreams.forEach(f => {
            formats.push({ quality: f.qualityLabel || `${f.resolution || '??'}p`, url: f.url, filesize: parseInt(f.contentLength) || 0, ext: f.container || 'mp4' });
          });
        }
        if (data.adaptiveFormats) {
          data.adaptiveFormats.filter(f => f.type && f.type.includes('video')).forEach(f => {
            const q = f.qualityLabel || `${f.resolution || '??'}p`;
            if (!formats.find(fmt => fmt.quality === q)) {
              formats.push({ quality: q, url: f.url, filesize: parseInt(f.contentLength) || 0, ext: f.container || 'mp4' });
            }
          });
        }
        if (formats.length > 0) {
          return { title: data.title || 'YouTube Video', thumbnail: `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`, author: data.author || '', views: data.viewCount || 0, duration: data.lengthSeconds || 0, platform: 'YouTube', formats: formats.slice(0, 8) };
        }
      } catch (e) { continue; }
    }
  } catch (e) {}

  try {
    const formData = new URLSearchParams();
    formData.append('k_query', url); formData.append('k_page', 'home'); formData.append('hl', 'en');
    const analyzeRes = await axios.post('https://www.y2mate.com/mates/en68/analyzeV2/ajax', formData.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Content-Type': 'application/x-www-form-urlencoded', 'Origin': 'https://www.y2mate.com', 'Referer': 'https://www.y2mate.com/en68' }, timeout: 10000
    });
    const responseText = typeof analyzeRes.data === 'string' ? analyzeRes.data : JSON.stringify(analyzeRes.data);
    const keyMatch = responseText.match(/k_id["']?\s*[:=]\s*["']([^"']+)["']/);
    const key = keyMatch ? keyMatch[1] : '';
    if (key) {
      const convertData = new URLSearchParams();
      convertData.append('k_query', url); convertData.append('k_id', key); convertData.append('k_page', 'home'); convertData.append('hl', 'en');
      const convertRes = await axios.post('https://www.y2mate.com/mates/en68/convertV2/ajax', convertData.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000
      });
      const html = typeof convertRes.data === 'string' ? convertRes.data : convertRes.data.result || '';
      const $ = cheerio.load(html);
      const formats = [];
      $('a[href*="https://"]').each((i, el) => {
        const href = $(el).attr('href'); const text = $(el).text().trim();
        if (href && (text.includes('p') || text.includes('MP4') || text.includes('MB'))) {
          const qMatch = text.match(/(\d+p)/); const sMatch = text.match(/([\d.]+) MB/);
          if (href.startsWith('http')) {
            formats.push({ quality: qMatch ? qMatch[1] : 'Video', url: href, filesize: sMatch ? parseFloat(sMatch[1]) * 1024 * 1024 : 0, ext: 'mp4' });
          }
        }
      });
      if (formats.length > 0) return { title: 'YouTube Video', thumbnail: `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`, platform: 'YouTube', formats: formats.slice(0, 8) };
    }
  } catch (e) {}

  return { title: 'YouTube Video', thumbnail: `https://img.youtube.com/vi/${vidId}/maxresdefault.jpg`, platform: 'YouTube', formats: [{ quality: '720p', url: `https://www.youtube.com/watch?v=${vidId}`, filesize: 0, ext: 'mp4' }, { quality: '480p', url: `https://www.youtube.com/watch?v=${vidId}`, filesize: 0, ext: 'mp4' }] };
}

// ============================================================
// TIKTOK
// ============================================================

async function getTikTokInfo(url) {
  try {
    const formData = new URLSearchParams();
    formData.append('url', url); formData.append('hd', '1');
    const res = await axios.post('https://www.tikwm.com/api/', formData.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' }, timeout: 10000
    });
    const data = res.data;
    if (data && data.code === 0 && data.data) {
      const d = data.data;
      const formats = [];
      if (d.hdplay) formats.push({ quality: 'HD Video', url: d.hdplay, filesize: d.hd_size || 0, ext: 'mp4' });
      if (d.play) formats.push({ quality: 'SD Video', url: d.play, filesize: d.size || 0, ext: 'mp4' });
      if (d.music) formats.push({ quality: 'Audio Only', url: d.music, filesize: d.music_size || 0, ext: 'mp3' });
      return { title: d.title || 'TikTok Video', thumbnail: d.cover || '', author: d.author?.nickname || d.author?.unique_id || '', views: d.play_count || 0, duration: d.duration || 0, platform: 'TikTok', formats };
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
      headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000
    });
    const $ = cheerio.load(res.data);
    const links = [];
    $('a[href*=".mp4"]').each((i, el) => { const href = $(el).attr('href'); if (href) links.push(href); });
    const thumb = $('meta[property="og:image"]').attr('content') || '';
    const title = $('title').text().trim() || 'Instagram Video';
    if (links.length > 0) return { title, thumbnail: thumb, platform: 'Instagram', formats: links.map((l, i) => ({ quality: i === 0 ? 'HD Video' : 'Standard', url: l, filesize: 0, ext: 'mp4' })) };
  } catch (e) {}
  throw new Error('Could not fetch Instagram video');
}

// ============================================================
// FACEBOOK
// ============================================================

async function getFacebookInfo(url) {
  try {
    const res = await axios.get(`https://www.getfvid.com/download?url=${encodeURIComponent(url)}`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000
    });
    const $ = cheerio.load(res.data);
    const links = [];
    $('a[href*=".mp4"]').each((i, el) => { const href = $(el).attr('href'); if (href && href.startsWith('http')) links.push(href); });
    const title = $('title').text().trim() || 'Facebook Video';
    const thumb = $('meta[property="og:image"]').attr('content') || '';
    if (links.length > 0) return { title, thumbnail: thumb, platform: 'Facebook', formats: links.map((l, i) => ({ quality: i === 0 ? 'HD' : 'SD', url: l, filesize: 0, ext: 'mp4' })) };
  } catch (e) {}
  throw new Error('Could not fetch Facebook video');
}

// ============================================================
// GENERIC
// ============================================================

async function getGenericInfo(url) {
  const platform = detectPlatform(url);
  try {
    const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }, timeout: 8000 });
    const $ = cheerio.load(res.data);
    const links = [];
    $('video source, video[src]').each((i, el) => { const src = $(el).attr('src'); if (src) links.push(src); });
    const ogVideo = $('meta[property="og:video"]').attr('content') || $('meta[name="twitter:player:stream"]').attr('content');
    if (ogVideo && !links.includes(ogVideo)) links.push(ogVideo);
    const title = $('meta[property="og:title"]').attr('content') || $('title').text().trim() || `${platform} Video`;
    const thumb = $('meta[property="og:image"]').attr('content') || '';
    return { title, thumbnail: thumb, platform, formats: links.length > 0 ? links.map(l => ({ quality: 'Video', url: l.startsWith('//') ? 'https:' + l : l, filesize: 0, ext: 'mp4' })) : [{ quality: 'Open Link', url, filesize: 0, ext: 'mp4' }] };
  } catch (e) { return { title: `${platform} Video`, thumbnail: '', platform, formats: [{ quality: 'Open Link', url, filesize: 0, ext: 'mp4' }] }; }
}

// ============================================================
// ROUTE: GET VIDEO INFO
// ============================================================

router.post('/info', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || url.trim() === '') return res.status(400).json({ success: false, error: 'Please enter a video URL' });
    const platform = detectPlatform(url);
    let data;
    try {
      if (platform === 'YouTube') data = await getYouTubeInfo(url);
      else if (platform === 'TikTok') data = await getTikTokInfo(url);
      else if (platform === 'Instagram') data = await getInstagramInfo(url);
      else if (platform === 'Facebook') data = await getFacebookInfo(url);
      else data = await getGenericInfo(url);
    } catch (err) { data = await getGenericInfo(url); }
    res.json({ success: true, data });
  } catch (err) {
    res.json({ success: true, data: { title: 'Video', thumbnail: '', platform: 'Unknown', formats: [{ quality: 'Open Link', url: req.body.url, filesize: 0, ext: 'mp4' }] } });
  }
});

// ============================================================
// ROUTE: DOWNLOAD - STREAM VIDEO DIRECTLY TO BROWSER
// ============================================================

router.post('/download', async (req, res) => {
  try {
    const { url: videoUrl, filename } = req.body;
    if (!videoUrl) return res.status(400).json({ success: false, error: 'URL is required' });

    console.log(`Download requested: ${videoUrl.substring(0, 100)}`);

    // Skip YouTube page URLs - not direct video links
    if (videoUrl.includes('youtube.com/watch') || videoUrl.includes('youtu.be')) {
      return res.json({ success: true, data: { downloadUrl: videoUrl, filename: filename || 'video.mp4', direct: true } });
    }

    // Try to fetch the video and stream it directly to the response
    try {
      console.log('Fetching video from CDN...');
      
      const safeFilename = filename || 'video.mp4';
      
      // Set headers for download
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Transfer-Encoding', 'chunked');
      res.setHeader('Cache-Control', 'no-cache');
      
      // Get the video stream and pipe it directly
      const response = await axios({
        method: 'GET',
        url: videoUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': '*/*',
          'Referer': videoUrl.includes('tiktok.com') ? 'https://www.tiktok.com/' : videoUrl.includes('instagram') ? 'https://www.instagram.com/' : videoUrl.includes('facebook') ? 'https://www.facebook.com/' : 'https://www.google.com/'
        },
        timeout: 30000,
        maxRedirects: 5
      });

      // If there's a content-length, forward it
      if (response.headers['content-length']) {
        res.setHeader('Content-Length', response.headers['content-length']);
      }
      
      console.log('Streaming video to browser...');
      
      // Pipe the video stream directly to the response
      response.data.pipe(res);
      
      response.data.on('end', () => {
        console.log('Download complete');
      });
      
      response.data.on('error', (err) => {
        console.error('Stream error:', err);
        if (!res.headersSent) {
          res.json({ success: true, data: { downloadUrl: videoUrl, filename: safeFilename, direct: true } });
        }
      });

    } catch (fetchErr) {
      console.log(`Stream fetch failed: ${fetchErr.message}`);
      // Return the URL for frontend to handle
      if (!res.headersSent) {
        res.json({ success: true, data: { downloadUrl: videoUrl, filename: filename || 'video.mp4', direct: true } });
      }
    }

  } catch (err) {
    console.error('Download error:', err);
    if (!res.headersSent) {
      res.json({ success: true, data: { downloadUrl: req.body.url, filename: 'video.mp4', direct: true } });
    }
  }
});

module.exports = router;