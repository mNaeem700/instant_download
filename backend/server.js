const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const downloadRoutes = require('./routes/download');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*' }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// API routes
app.use('/api', downloadRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Direct download endpoint (for form submissions)
app.post('/api/download-direct', async (req, res) => {
  const { url: videoUrl, filename } = req.body;
  if (!videoUrl) return res.status(400).send('URL required');

  try {
    const response = await axios({
      method: 'GET',
      url: videoUrl,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*'
      },
      timeout: 30000,
      maxRedirects: 5
    });

    const safeFilename = filename || 'video.mp4';
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', 'video/mp4');
    
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length']);
    }
    
    response.data.pipe(res);
  } catch (err) {
    console.error('Direct download error:', err);
    res.redirect(videoUrl);
  }
});
// Serve frontend for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, error: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 InstantDownload running on http://localhost:${PORT}`);
});