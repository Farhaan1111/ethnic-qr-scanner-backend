const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { authenticateOwner } = require('../middleware/auth');

const router = express.Router();

const EMBEDDING_SERVICE_URL =
  process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8000';

// storage config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '..', 'uploads', 'products'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname); // .jpg/.png
    const base = path.basename(file.originalname, ext).replace(/\s+/g, '-');
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${base}-${unique}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 5MB
});

// POST /api/upload/product-image
router.post(
  '/product-image',
  authenticateOwner,
  upload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const relativePath = `/uploads/products/${req.file.filename}`;
      const fullUrl = `${req.protocol}://${req.get('host')}${relativePath}`;

      // Default: no embedding (in case service fails)
      let embedding = null;

      try {
        // Prepare multipart form-data for Python service
        const formData = new FormData();

        // Ensure absolute file path (handles different working directories)
        const filePath = path.isAbsolute(req.file.path)
          ? req.file.path
          : path.join(__dirname, '..', req.file.path);

        formData.append('file', fs.createReadStream(filePath));

        const response = await axios.post(
          `${EMBEDDING_SERVICE_URL}/embed-image`,
          formData,
          {
            headers: formData.getHeaders(),
            timeout: 30000, // 30s, CLIP can be a bit slow on CPU
          }
        );

        if (response.data && response.data.vector) {
          embedding = {
            vector: response.data.vector,
            model: response.data.model || 'clip-vit-b32',
          };
        }
      } catch (err) {
        if (err.response) {
          console.error(
            'Embedding service error response:',
            err.response.status,
            err.response.data
          );
        } else if (err.request) {
          console.error(
            'Embedding service no response (network error):',
            err.message || err
          );
        } else {
          console.error('Error calling embedding service:', err.message || err);
        }
        // We do NOT fail the upload if embedding fails.
      }

      return res.json({
        url: fullUrl,         // full http://localhost:5000/...
        path: relativePath,   // /uploads/products/...
        embedding,            // NEW: may be null if service failed
      });
    } catch (error) {
      console.error('Error in /product-image:', error);
      return res.status(500).json({ error: 'Image upload failed' });
    }
  }
);

module.exports = router;
