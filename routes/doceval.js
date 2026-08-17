const express = require('express');
const router  = express.Router();
const https   = require('https');

const UPSTREAM_HOST = process.env.DOCEVAL_URL || 'doceval-8362469192e8.herokuapp.com';

// Proxy all DocEval API calls server-side to avoid CORS issues.
// Mounted at /api/doceval-proxy — req.url will be the path after the mount point.
router.all('*', (req, res) => {
  const upstreamHeaders = { ...req.headers, host: UPSTREAM_HOST };
  // Remove hop-by-hop headers that must not be forwarded
  delete upstreamHeaders['connection'];
  delete upstreamHeaders['transfer-encoding']; // prevent chunked vs Content-Length conflict

  function sendToUpstream(body) {
    // Set Content-Length from the actual buffered body so Heroku always gets a clean request
    if (body && body.length > 0) {
      upstreamHeaders['content-length'] = body.length;
    }

    const proxy = https.request({
      hostname: UPSTREAM_HOST,
      path:     req.url,
      method:   req.method,
      headers:  upstreamHeaders,
      timeout:  120000   // 120 s — upstream LLM calls can be slow
    }, proxyRes => {
      const upstreamContentType = (proxyRes.headers['content-type'] || '').toLowerCase();
      const isJsonResponse = upstreamContentType.includes('application/json');

      // When the upstream returns an error page (HTML / plain-text), intercept it and
      // convert to a JSON error so the client always gets a parseable response.
      if (!isJsonResponse && proxyRes.statusCode >= 400) {
        const chunks = [];
        proxyRes.on('data', c => chunks.push(c));
        proxyRes.on('end', () => {
          if (res.headersSent) return;
          res.status(proxyRes.statusCode).json({
            error:   'Upstream error',
            message: `AI service returned HTTP ${proxyRes.statusCode}. The service may be temporarily unavailable — please try again in a moment.`
          });
        });
        return;
      }

      res.status(proxyRes.statusCode);
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (k.toLowerCase() !== 'transfer-encoding') res.setHeader(k, v);
      }
      proxyRes.pipe(res);
    });

    proxy.on('timeout', () => {
      proxy.destroy();
      if (!res.headersSent) res.status(504).json({ error: 'Upstream timeout', message: 'The AI service did not respond in time. Try a shorter job description or fewer files.' });
    });

    proxy.on('error', err => {
      if (!res.headersSent) res.status(502).json({ error: 'Upstream unavailable', message: err.message });
    });

    proxy.end(body || Buffer.alloc(0));
  }

  if (req.is('application/json') && req.body) {
    // express.json() already parsed this — re-serialize for the upstream
    const body = Buffer.from(JSON.stringify(req.body));
    upstreamHeaders['content-type'] = 'application/json';
    sendToUpstream(body);
  } else {
    // multipart/form-data and GET requests — buffer the raw stream fully before forwarding.
    // Piping directly (req.pipe) causes Transfer-Encoding/Content-Length conflicts with Heroku.
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end',  ()    => sendToUpstream(Buffer.concat(chunks)));
    req.on('error', err  => {
      if (!res.headersSent) res.status(502).json({ error: 'Request read error', message: err.message });
    });
  }
});

module.exports = router;
