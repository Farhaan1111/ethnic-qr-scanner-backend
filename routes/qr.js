const express = require('express');
const router = express.Router();
const QRGenerator = require('../utils/qrGenerator');
const Product = require('../models/Product');
const QRCode = require('../models/QRCode'); // Add this import
const { authenticateOwner, requireOwner } = require('../middleware/auth');

// Generate QR for specific product and save to DB
router.get('/:productId', authenticateOwner, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const product = await Product.findOne({ productId: req.params.productId });
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Check if QR code already exists in database
    let existingQR = await QRCode.findOne({ productId: product.productId });
    
    if (existingQR) {
      // Update last accessed time
      existingQR.lastAccessed = new Date();
      existingQR.accessCount += 1;
      await existingQR.save();
      
      return res.json({
        product: {
          productId: product.productId,
          name: product.name
        },
        qrCode: existingQR.qrCodeData,
        url: existingQR.qrCodeUrl,
        productId: product.productId,
        fromCache: true,
        generatedAt: existingQR.generatedAt
      });
    }

    // Generate new QR code
    const qrData = await QRGenerator.generateProductQR(product.productId, {
      size: 400,
      color: '#8B4513'
    });

    // Save to database
    const newQR = new QRCode({
      productId: product.productId,
      productName: product.name,
      qrCodeData: qrData.qrCode,
      qrCodeUrl: qrData.url,
      size: 400,
      color: '#8B4513',
      generatedBy: req.user.role || 'owner'
    });

    await newQR.save();

    res.json({
      product: {
        productId: product.productId,
        name: product.name
      },
      ...qrData,
      fromCache: false,
      generatedAt: newQR.generatedAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate QR codes for all products and save to DB
router.get('/', authenticateOwner, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const products = await Product.find({ isActive: true }).select('productId name');
    
    const qrCodes = [];
    for (const product of products) {
      // Check if QR code already exists
      let existingQR = await QRCode.findOne({ productId: product.productId });
      
      if (existingQR) {
        // Update last accessed
        existingQR.lastAccessed = new Date();
        existingQR.accessCount += 1;
        await existingQR.save();
        
        qrCodes.push({
          productId: product.productId,
          productName: product.name,
          qrCode: existingQR.qrCodeData,
          url: existingQR.qrCodeUrl,
          fromCache: true,
          generatedAt: existingQR.generatedAt
        });
      } else {
        // Generate new QR code
        const qrData = await QRGenerator.generateProductQR(product.productId, {
          size: 200,
          color: '#8B4513'
        });

        // Save to database
        const newQR = new QRCode({
          productId: product.productId,
          productName: product.name,
          qrCodeData: qrData.qrCode,
          qrCodeUrl: qrData.url,
          size: 200,
          color: '#8B4513',
          generatedBy: req.user.role || 'owner'
        });

        await newQR.save();

        qrCodes.push({
          productId: product.productId,
          productName: product.name,
          ...qrData,
          fromCache: false,
          generatedAt: newQR.generatedAt
        });
      }
    }

    res.json(qrCodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all saved QR codes from database
router.get('/saved/all', authenticateOwner, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const qrCodes = await QRCode.find().sort({ generatedAt: -1 });
    
    const formattedQRCodes = qrCodes.map(qr => ({
      productId: qr.productId,
      productName: qr.productName,
      qrCode: qr.qrCodeData,
      url: qr.qrCodeUrl,
      generatedAt: qr.generatedAt,
      lastAccessed: qr.lastAccessed,
      accessCount: qr.accessCount
    }));

    res.json(formattedQRCodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete specific QR code from database
router.delete('/:productId', authenticateOwner, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const result = await QRCode.findOneAndDelete({ productId: req.params.productId });
    
    if (!result) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    res.json({ message: 'QR code deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear all QR codes from database
router.delete('/', authenticateOwner, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    await QRCode.deleteMany({});
    res.json({ message: 'All QR codes cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
