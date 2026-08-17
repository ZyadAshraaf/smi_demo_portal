const express = require('express');
const router  = express.Router();
const fs      = require('fs');
const path    = require('path');
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');

const docsPath   = path.join(__dirname, '../../data/ems-documents.json');
const auditPath  = path.join(__dirname, '../../data/ems-audit.json');
const tasksPath  = path.join(__dirname, '../../data/tasks.json');
const usersPath  = path.join(__dirname, '../../data/users.json');
const uploadDir  = path.join(__dirname, '../../uploads/ems');

const readTasks  = () => JSON.parse(fs.readFileSync(tasksPath, 'utf8'));
const writeTasks = d => fs.writeFileSync(tasksPath, JSON.stringify(d, null, 2));
const readUsers  = () => JSON.parse(fs.readFileSync(usersPath, 'utf8'));

const readDocs   = () => JSON.parse(fs.readFileSync(docsPath, 'utf8'));
const writeDocs  = d => fs.writeFileSync(docsPath, JSON.stringify(d, null, 2));
const readAudit  = () => JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const writeAudit = d => fs.writeFileSync(auditPath, JSON.stringify(d, null, 2));

// Ensure upload dir exists
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Multer config — store with temp name, rename after
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `tmp_${Date.now()}_${file.originalname}`)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) return next();
  res.status(401).json({ success: false, message: 'Unauthorized' });
};

function logAudit(action, entityType, entityId, entityName, user, details) {
  const audit = readAudit();
  audit.push({
    id: 'AUD' + uuidv4().split('-')[0].toUpperCase(),
    action, entityType, entityId, entityName,
    userId: user.id, userName: user.name,
    details, timestamp: new Date().toISOString()
  });
  writeAudit(audit);
}

// GET — list documents
router.get('/', requireAuth, (req, res) => {
  let docs = readDocs();
  const { folderId, search, docTypeId, starred, trashed } = req.query;

  if (trashed === 'true') {
    docs = docs.filter(d => d.trashedAt);
  } else {
    docs = docs.filter(d => !d.trashedAt);
  }

  if (folderId) docs = docs.filter(d => d.folderId === folderId);
  if (docTypeId) docs = docs.filter(d => d.docTypeId === docTypeId);
  if (starred === 'true') docs = docs.filter(d => d.starred && d.starred.includes(req.session.user.id));
  if (search) {
    const q = search.toLowerCase();
    docs = docs.filter(d =>
      d.title.toLowerCase().includes(q) ||
      (d.description && d.description.toLowerCase().includes(q))
    );
  }

  docs.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  res.json({ success: true, documents: docs });
});

// GET — recent documents
router.get('/recent', requireAuth, (req, res) => {
  const docs = readDocs()
    .filter(d => !d.trashedAt)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 20);
  res.json({ success: true, documents: docs });
});

// GET — single document
router.get('/:id', requireAuth, (req, res) => {
  const doc = readDocs().find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
  res.json({ success: true, document: doc });
});

// POST — create document + upload first version
router.post('/', requireAuth, upload.single('file'), (req, res) => {
  const { title, description, folderId, docTypeId, metadata, notes } = req.body;
  if (!title || !folderId || !docTypeId) {
    return res.status(400).json({ success: false, message: 'title, folderId, and docTypeId are required' });
  }

  const docId = 'DOC' + uuidv4().split('-')[0].toUpperCase();
  let parsedMeta = {};
  try { parsedMeta = typeof metadata === 'string' ? JSON.parse(metadata) : (metadata || {}); } catch (e) { /* ignore */ }

  const doc = {
    id: docId,
    title: title.trim(),
    description: (description || '').trim(),
    folderId,
    docTypeId,
    metadata: parsedMeta,
    status: 'active',
    createdBy: req.session.user.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    currentVersion: 0,
    versions: [],
    signatures: [],
    watermark: { enabled: false, text: 'CONFIDENTIAL', opacity: 0.15, angle: -30 },
    annotations: [],
    starred: [],
    trashedAt: null,
    lockedBy: null,
    lockedAt: null
  };

  // Handle file if uploaded
  if (req.file) {
    const ext = path.extname(req.file.originalname);
    const storageName = `${docId}_v1${ext}`;
    const storagePath = path.join(uploadDir, storageName);
    fs.renameSync(req.file.path, storagePath);

    doc.currentVersion = 1;
    doc.versions.push({
      version: 1,
      filename: req.file.originalname,
      storagePath: `uploads/ems/${storageName}`,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.session.user.id,
      uploadedAt: new Date().toISOString(),
      notes: notes || 'Initial upload'
    });
  }

  const docs = readDocs();
  docs.push(doc);
  writeDocs(docs);
  logAudit('document.upload', 'document', doc.id, doc.title, req.session.user, 'Created document' + (req.file ? ' with file upload' : ''));
  res.json({ success: true, document: doc });
});

// POST — upload new version (pending approval)
router.post('/:id/versions', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'File is required' });

  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  const doc = docs[idx];

  // Check lock
  if (doc.lockedBy && doc.lockedBy !== req.session.user.id) {
    return res.status(423).json({ success: false, message: 'Document is locked by another user' });
  }

  // Block if a version is already pending approval
  if (doc.versions.some(v => v.status === 'pending')) {
    return res.status(409).json({ success: false, message: 'A version is already awaiting approval' });
  }

  const newVersion = doc.currentVersion + 1;
  const ext = path.extname(req.file.originalname);
  const storageName = `${doc.id}_v${newVersion}${ext}`;
  const storagePath = path.join(uploadDir, storageName);
  fs.renameSync(req.file.path, storagePath);

  doc.versions.push({
    version:    newVersion,
    filename:   req.file.originalname,
    storagePath: `uploads/ems/${storageName}`,
    mimeType:   req.file.mimetype,
    size:       req.file.size,
    uploadedBy: req.session.user.id,
    uploadedAt: new Date().toISOString(),
    notes:      req.body.notes || `Version ${newVersion}`,
    status:     'pending'   // awaiting admin approval
  });
  // currentVersion stays unchanged until approved
  doc.updatedAt = new Date().toISOString();
  writeDocs(docs);

  // Create approval task assigned to uploader's manager (or self if CEO)
  const allUsers  = readUsers();
  const uploader  = allUsers.find(u => u.id === req.session.user.id);
  const approver  = uploader?.managerId ? allUsers.find(u => u.id === uploader.managerId) : null;
  if (approver) {
    const tasks  = readTasks();
    const taskId = 'T' + uuidv4().split('-')[0].toUpperCase();
    tasks.push({
      id:           taskId,
      title:        `Approve new version of "${doc.title}"`,
      description:  `${req.session.user.name} uploaded version ${newVersion} of "${doc.title}" and it is pending your approval.`,
      sourceSystem: 'CMS',
      type:         'approval',
      priority:     'medium',
      status:       'pending',
      assignedTo:   approver.id,
      createdBy:    req.session.user.id,
      dueDate:      null,
      createdAt:    new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
      metadata:     { emsVersionId: `${doc.id}_v${newVersion}`, docId: doc.id, version: newVersion, docTitle: doc.title },
      history:      [{ action: 'created', by: req.session.user.id, at: new Date().toISOString(), note: `Version ${newVersion} submitted for approval` }],
      comments:     [],
      escalated:    false,
      delegatedFrom: null
    });
    writeTasks(tasks);
  }

  logAudit('document.version', 'document', doc.id, doc.title, req.session.user, `Uploaded version ${newVersion} (pending approval)`);
  res.json({ success: true, document: doc, message: 'Version uploaded and sent for admin approval' });
});

// POST — approve a pending version
router.post('/:id/versions/:version/approve', requireAuth, (req, res) => {
  const user = req.session.user;
  if (user.role !== 'admin' && user.role !== 'manager') return res.status(403).json({ success: false, message: 'Only admin or manager can approve versions' });

  const docs = readDocs();
  const idx  = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  const doc    = docs[idx];
  const verNum = parseInt(req.params.version);
  const ver    = doc.versions.find(v => v.version === verNum);
  if (!ver) return res.status(404).json({ success: false, message: 'Version not found' });
  if (ver.status !== 'pending') return res.status(400).json({ success: false, message: 'Version is not pending' });

  ver.status = 'approved';
  doc.currentVersion = verNum;
  doc.updatedAt = new Date().toISOString();
  writeDocs(docs);

  // Mark approval task as approved
  const tasks = readTasks();
  const task  = tasks.find(t => t.metadata?.emsVersionId === `${doc.id}_v${verNum}` && t.status === 'pending');
  if (task) {
    task.status = 'approved';
    task.updatedAt = new Date().toISOString();
    task.history.push({ action: 'approved', by: user.id, at: new Date().toISOString(), note: `Version ${verNum} approved` });
    writeTasks(tasks);
  }

  logAudit('document.version.approved', 'document', doc.id, doc.title, user, `Approved version ${verNum}`);
  res.json({ success: true, document: doc });
});

// POST — reject a pending version
router.post('/:id/versions/:version/reject', requireAuth, (req, res) => {
  const user = req.session.user;
  if (user.role !== 'admin' && user.role !== 'manager') return res.status(403).json({ success: false, message: 'Only admin or manager can reject versions' });

  const docs = readDocs();
  const idx  = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  const doc    = docs[idx];
  const verNum = parseInt(req.params.version);
  const verIdx = doc.versions.findIndex(v => v.version === verNum);
  if (verIdx === -1) return res.status(404).json({ success: false, message: 'Version not found' });
  const ver = doc.versions[verIdx];
  if (ver.status !== 'pending') return res.status(400).json({ success: false, message: 'Version is not pending' });

  // Delete the uploaded file
  const filePath = path.join(__dirname, '../../', ver.storagePath);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  // Remove version entry
  doc.versions.splice(verIdx, 1);
  doc.updatedAt = new Date().toISOString();
  writeDocs(docs);

  // Mark approval task as rejected
  const tasks = readTasks();
  const task  = tasks.find(t => t.metadata?.emsVersionId === `${doc.id}_v${verNum}` && t.status === 'pending');
  if (task) {
    task.status = 'rejected';
    task.updatedAt = new Date().toISOString();
    task.history.push({ action: 'rejected', by: user.id, at: new Date().toISOString(), note: `Version ${verNum} rejected — file removed` });
    writeTasks(tasks);
  }

  logAudit('document.version.rejected', 'document', doc.id, doc.title, user, `Rejected version ${verNum}`);
  res.json({ success: true, document: doc });
});

// GET — download specific version (attachment); applies watermark on-the-fly if enabled
router.get('/:id/versions/:version/download', requireAuth, async (req, res) => {
  const doc = readDocs().find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

  const ver = doc.versions.find(v => v.version === parseInt(req.params.version));
  if (!ver) return res.status(404).json({ success: false, message: 'Version not found' });

  const filePath = path.join(__dirname, '../../', ver.storagePath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found on disk' });

  // For PDFs with an active watermark, bake it into a temporary copy and stream it
  if (ver.mimeType === 'application/pdf' && doc.watermark?.enabled) {
    try {
      const { PDFDocument, rgb, degrees, StandardFonts } = require('pdf-lib');
      const pdfDoc  = await PDFDocument.load(fs.readFileSync(filePath));
      const font    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const wmText  = doc.watermark.text    || 'CONFIDENTIAL';
      const wmOpac  = doc.watermark.opacity || 0.15;
      const wmAngle = doc.watermark.angle   || -30;

      for (const page of pdfDoc.getPages()) {
        const { width, height } = page.getSize();
        const fontSize  = Math.floor(width * 0.08);
        const textWidth = font.widthOfTextAtSize(wmText, fontSize);
        page.drawText(wmText, {
          x:       width  / 2 - textWidth / 2,
          y:       height / 2,
          size:    fontSize,
          font,
          color:   rgb(0, 0, 0),
          opacity: wmOpac,
          rotate:  degrees(-wmAngle)  // negate: PDF Y-axis is up (opposite of canvas Y-down)
        });
      }

      const watermarkedBytes = await pdfDoc.save();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${ver.filename}"`);
      return res.send(Buffer.from(watermarkedBytes));
    } catch (err) {
      console.error('[WATERMARK DOWNLOAD]', err);
      // Fall through to plain download on error
    }
  }

  res.download(filePath, ver.filename);
});

// GET — view specific version inline (no-cache, for iframe display after signing)
router.get('/:id/versions/:version/view', requireAuth, (req, res) => {
  const doc = readDocs().find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

  const ver = doc.versions.find(v => v.version === parseInt(req.params.version));
  if (!ver) return res.status(404).json({ success: false, message: 'Version not found' });

  const filePath = path.join(__dirname, '../../', ver.storagePath);
  if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'File not found on disk' });

  res.setHeader('Content-Type', ver.mimeType || 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.removeHeader('ETag');
  res.removeHeader('Last-Modified');
  res.sendFile(filePath);
});

// PUT — update document metadata
router.put('/:id', requireAuth, (req, res) => {
  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  const allowed = ['title', 'description', 'folderId', 'docTypeId', 'metadata'];
  allowed.forEach(key => { if (req.body[key] !== undefined) docs[idx][key] = req.body[key]; });
  docs[idx].updatedAt = new Date().toISOString();

  writeDocs(docs);
  logAudit('document.update', 'document', docs[idx].id, docs[idx].title, req.session.user, 'Updated document metadata');
  res.json({ success: true, document: docs[idx] });
});

// DELETE — soft delete (trash)
router.delete('/:id', requireAuth, (req, res) => {
  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  docs[idx].trashedAt = new Date().toISOString();
  docs[idx].trashedBy = req.session.user.id;
  docs[idx].updatedAt = new Date().toISOString();

  writeDocs(docs);
  logAudit('document.delete', 'document', docs[idx].id, docs[idx].title, req.session.user, 'Moved to trash');
  res.json({ success: true });
});

// POST — restore from trash
router.post('/:id/restore', requireAuth, (req, res) => {
  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  docs[idx].trashedAt = null;
  docs[idx].trashedBy = null;
  docs[idx].updatedAt = new Date().toISOString();

  writeDocs(docs);
  logAudit('document.restore', 'document', docs[idx].id, docs[idx].title, req.session.user, 'Restored from trash');
  res.json({ success: true, document: docs[idx] });
});

// DELETE — permanent delete (admin only)
router.delete('/:id/permanent', requireAuth, (req, res) => {
  if (req.session.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Admin only' });

  const docs = readDocs();
  const doc = docs.find(d => d.id === req.params.id);
  if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });

  // Delete physical files
  doc.versions.forEach(v => {
    const filePath = path.join(__dirname, '../../', v.storagePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });

  const remaining = docs.filter(d => d.id !== req.params.id);
  writeDocs(remaining);
  logAudit('document.permanent_delete', 'document', doc.id, doc.title, req.session.user, 'Permanently deleted');
  res.json({ success: true });
});

// POST — apply signature: embeds it into the PDF using pdf-lib (async)
router.post('/:id/sign', requireAuth, async (req, res) => {
  try {
    const { signatureId, x, y, width } = req.body;
    console.log('[SIGN] Request received for doc:', req.params.id, 'sig:', signatureId, 'pos:', { x, y, width });

    if (!signatureId) return res.status(400).json({ success: false, message: 'signatureId is required' });
    if (x == null || y == null) return res.status(400).json({ success: false, message: 'Position (x, y) is required' });

    const docs = readDocs();
    const idx  = docs.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

    const doc = docs[idx];
    if (doc.lockedBy && doc.lockedBy !== req.session.user.id)
      return res.status(423).json({ success: false, message: 'Document is locked by another user' });
    if (doc.versions?.some(v => v.status === 'pending'))
      return res.status(423).json({ success: false, message: 'Document is locked pending version approval' });

    // Look up the signature imageData (base64 PNG)
    const sigDataPath = path.join(__dirname, '../../data/ems-signatures.json');
    const sigs        = JSON.parse(fs.readFileSync(sigDataPath, 'utf8'));
    const sig         = sigs.find(s => s.id === signatureId);
    if (!sig?.imageData) {
      console.log('[SIGN] Signature not found or no imageData. sigId:', signatureId, 'found:', !!sig);
      return res.status(400).json({ success: false, message: 'Signature image not found' });
    }

    const xPct     = parseFloat(x)     || 10;
    const yPct     = parseFloat(y)     || 80;
    const widthPct = parseFloat(width) || 20;
    console.log('[SIGN] Parsed position: x=', xPct, 'y=', yPct, 'w=', widthPct);

    // If the document has a PDF version, bake the signature into the file
    const latestVer = doc.versions?.[doc.versions.length - 1];
    console.log('[SIGN] Latest version:', latestVer?.storagePath, 'mime:', latestVer?.mimeType);

    if (latestVer && latestVer.mimeType === 'application/pdf') {
      const { PDFDocument } = require('pdf-lib');

      const pdfFilePath = path.join(__dirname, '../../', latestVer.storagePath);
      console.log('[SIGN] PDF path:', pdfFilePath, 'exists:', fs.existsSync(pdfFilePath));

      if (!fs.existsSync(pdfFilePath)) {
        return res.status(404).json({ success: false, message: 'PDF file not found on disk. Please re-upload the document.' });
      } else {
        const pdfBytes = fs.readFileSync(pdfFilePath);
        console.log('[SIGN] PDF loaded, size:', pdfBytes.length);

        const pdfDoc = await PDFDocument.load(pdfBytes);

        const base64Data = sig.imageData.replace(/^data:image\/\w+;base64,/, '');
        const imgBytes   = Buffer.from(base64Data, 'base64');
        const pngImage   = await pdfDoc.embedPng(imgBytes);
        console.log('[SIGN] PNG embedded, dims:', pngImage.width, 'x', pngImage.height);

        const pageIdx = Math.max(0, (parseInt(req.body.page) || 1) - 1);
        const pages   = pdfDoc.getPages();
        const page    = pages[Math.min(pageIdx, pages.length - 1)];
        const pageW   = page.getWidth();
        const pageH   = page.getHeight();

        const sigW = (widthPct / 100) * pageW;
        const sigH = sigW * (pngImage.height / pngImage.width);
        const sigX = (xPct / 100) * pageW;
        const sigY = pageH - (yPct / 100) * pageH - sigH;
        console.log('[SIGN] Draw at:', { sigX, sigY, sigW, sigH, pageW, pageH });

        page.drawImage(pngImage, { x: sigX, y: sigY, width: sigW, height: sigH });

        const savedPdf = await pdfDoc.save();
        fs.writeFileSync(pdfFilePath, Buffer.from(savedPdf));
        console.log('[SIGN] PDF written, new size:', savedPdf.length);
      }
    }

    // Record the signature in the document metadata
    doc.signatures.push({
      signatureId,
      userId:   req.session.user.id,
      userName: req.session.user.name,
      signedAt: new Date().toISOString(),
      type:     'drawn',
      x:        xPct,
      y:        yPct,
      width:    widthPct
    });
    doc.updatedAt = new Date().toISOString();

    writeDocs(docs);
    logAudit('document.sign', 'document', doc.id, doc.title, req.session.user, 'Applied signature');
    console.log('[SIGN] Success — metadata saved, responding');
    res.json({ success: true, document: doc });
  } catch (err) {
    console.error('[SIGN] Error:', err);
    res.status(500).json({ success: false, message: 'Failed to apply signature: ' + err.message });
  }
});

// PUT — watermark config
router.put('/:id/watermark', requireAuth, (req, res) => {
  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  const doc = docs[idx];
  if (doc.lockedBy && doc.lockedBy !== req.session.user.id)
    return res.status(423).json({ success: false, message: 'Document is locked by another user' });
  if (doc.versions?.some(v => v.status === 'pending'))
    return res.status(423).json({ success: false, message: 'Document is locked pending version approval' });

  const { enabled, text, opacity, angle } = req.body;
  if (enabled !== undefined) docs[idx].watermark.enabled = enabled;
  if (text !== undefined) docs[idx].watermark.text = text;
  if (opacity !== undefined) docs[idx].watermark.opacity = opacity;
  if (angle !== undefined) docs[idx].watermark.angle = angle;
  docs[idx].updatedAt = new Date().toISOString();

  writeDocs(docs);
  res.json({ success: true, document: docs[idx] });
});

// POST — place text annotation: embed text into PDF using pdf-lib
router.post('/:id/annotate', requireAuth, async (req, res) => {
  try {
    const { text, color, size, x, y, page } = req.body;
    if (!text?.trim()) return res.status(400).json({ success: false, message: 'text is required' });

    const docs = readDocs();
    const idx  = docs.findIndex(d => d.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

    const doc       = docs[idx];
    if (doc.lockedBy && doc.lockedBy !== req.session.user.id)
      return res.status(423).json({ success: false, message: 'Document is locked by another user' });
    if (doc.versions?.some(v => v.status === 'pending'))
      return res.status(423).json({ success: false, message: 'Document is locked pending version approval' });

    const latestVer = doc.versions?.[doc.versions.length - 1];
    if (!latestVer || latestVer.mimeType !== 'application/pdf')
      return res.status(400).json({ success: false, message: 'Document must be a PDF' });

    const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
    const pdfPath = path.join(__dirname, '../../', latestVer.storagePath);
    const pdfDoc  = await PDFDocument.load(fs.readFileSync(pdfPath));
    const font    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const pages   = pdfDoc.getPages();
    const pageIdx = Math.max(0, (parseInt(page) || 1) - 1);
    const pdfPage = pages[Math.min(pageIdx, pages.length - 1)];
    const { width: pageW, height: pageH } = pdfPage.getSize();

    const fontSize = parseFloat(size) || 13;
    const xPct     = parseFloat(x) || 5;
    const yPct     = parseFloat(y) || 10;

    // Convert % to PDF coords (Y-axis inverted)
    const drawX = (xPct / 100) * pageW;
    const drawY = pageH - (yPct / 100) * pageH - fontSize;

    // Parse hex color to rgb
    const hex   = (color || '#e63946').replace('#', '');
    const r     = parseInt(hex.substring(0, 2), 16) / 255;
    const g     = parseInt(hex.substring(2, 4), 16) / 255;
    const b     = parseInt(hex.substring(4, 6), 16) / 255;

    pdfPage.drawText(text.trim(), { x: drawX, y: drawY, size: fontSize, font, color: rgb(r, g, b) });

    const savedPdf = await pdfDoc.save();
    fs.writeFileSync(pdfPath, Buffer.from(savedPdf));

    // Record annotation in metadata
    if (!doc.annotations) doc.annotations = [];
    doc.annotations.push({
      id: 'ANN' + uuidv4().split('-')[0].toUpperCase(),
      text: text.trim(), color, size: fontSize, x: xPct, y: yPct, page: pageIdx + 1,
      userId: req.session.user.id, userName: req.session.user.name,
      createdAt: new Date().toISOString()
    });
    doc.updatedAt = new Date().toISOString();
    writeDocs(docs);
    logAudit('document.annotate', 'document', doc.id, doc.title, req.session.user, `Added annotation: "${text.trim().substring(0, 40)}"`);
    res.json({ success: true, document: doc });
  } catch (err) {
    console.error('[ANNOTATE]', err);
    res.status(500).json({ success: false, message: 'Failed to place annotation: ' + err.message });
  }
});

// POST — save annotation
router.post('/:id/annotations', requireAuth, (req, res) => {
  const { page, data, type } = req.body;
  if (data === undefined || page === undefined) return res.status(400).json({ success: false, message: 'page and data are required' });

  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  docs[idx].annotations.push({
    id: 'ANN' + uuidv4().split('-')[0].toUpperCase(),
    userId: req.session.user.id,
    type: type || 'drawing',
    page,
    data,
    createdAt: new Date().toISOString()
  });
  docs[idx].updatedAt = new Date().toISOString();

  writeDocs(docs);
  res.json({ success: true, document: docs[idx] });
});

// POST — toggle star
router.post('/:id/star', requireAuth, (req, res) => {
  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  const userId = req.session.user.id;
  const starIdx = docs[idx].starred.indexOf(userId);
  if (starIdx === -1) {
    docs[idx].starred.push(userId);
  } else {
    docs[idx].starred.splice(starIdx, 1);
  }

  writeDocs(docs);
  res.json({ success: true, starred: starIdx === -1, document: docs[idx] });
});

// POST — lock document
router.post('/:id/lock', requireAuth, (req, res) => {
  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  if (docs[idx].lockedBy && docs[idx].lockedBy !== req.session.user.id) {
    return res.status(423).json({ success: false, message: 'Document is already locked by another user' });
  }

  docs[idx].lockedBy = req.session.user.id;
  docs[idx].lockedAt = new Date().toISOString();
  docs[idx].updatedAt = new Date().toISOString();

  writeDocs(docs);
  logAudit('document.lock', 'document', docs[idx].id, docs[idx].title, req.session.user, 'Locked document');
  res.json({ success: true, document: docs[idx] });
});

// POST — unlock document
router.post('/:id/unlock', requireAuth, (req, res) => {
  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  if (docs[idx].lockedBy && docs[idx].lockedBy !== req.session.user.id && req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Only the locker or admin can unlock' });
  }

  docs[idx].lockedBy = null;
  docs[idx].lockedAt = null;
  docs[idx].updatedAt = new Date().toISOString();

  writeDocs(docs);
  logAudit('document.unlock', 'document', docs[idx].id, docs[idx].title, req.session.user, 'Unlocked document');
  res.json({ success: true, document: docs[idx] });
});

// POST — bulk move (must be before /:id/move to avoid wildcard capture)
router.post('/bulk/move', requireAuth, (req, res) => {
  const { documentIds, folderId } = req.body;
  if (!documentIds || !folderId) return res.status(400).json({ success: false, message: 'documentIds and folderId are required' });

  const docs = readDocs();
  let moved = 0;
  documentIds.forEach(id => {
    const idx = docs.findIndex(d => d.id === id);
    if (idx !== -1) { docs[idx].folderId = folderId; docs[idx].updatedAt = new Date().toISOString(); moved++; }
  });

  writeDocs(docs);
  logAudit('document.bulk_move', 'document', '', '', req.session.user, `Bulk moved ${moved} documents`);
  res.json({ success: true, moved });
});

// POST — bulk delete (soft, must be before /:id route)
router.post('/bulk/delete', requireAuth, (req, res) => {
  const { documentIds } = req.body;
  if (!documentIds) return res.status(400).json({ success: false, message: 'documentIds is required' });

  const docs = readDocs();
  let deleted = 0;
  const now = new Date().toISOString();
  documentIds.forEach(id => {
    const idx = docs.findIndex(d => d.id === id);
    if (idx !== -1) { docs[idx].trashedAt = now; docs[idx].trashedBy = req.session.user.id; docs[idx].updatedAt = now; deleted++; }
  });

  writeDocs(docs);
  logAudit('document.bulk_delete', 'document', '', '', req.session.user, `Bulk trashed ${deleted} documents`);
  res.json({ success: true, deleted });
});

// POST — move single document to different folder
router.post('/:id/move', requireAuth, (req, res) => {
  const { folderId } = req.body;
  if (!folderId) return res.status(400).json({ success: false, message: 'folderId is required' });

  const docs = readDocs();
  const idx = docs.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, message: 'Document not found' });

  docs[idx].folderId = folderId;
  docs[idx].updatedAt = new Date().toISOString();

  writeDocs(docs);
  logAudit('document.move', 'document', docs[idx].id, docs[idx].title, req.session.user, 'Moved document');
  res.json({ success: true, document: docs[idx] });
});

module.exports = router;
