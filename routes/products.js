const multer = require('multer');          // NEW (if not already imported)
const fs = require('fs');                  // NEW
const path = require('path');              // NEW
const axios = require('axios');            // NEW
const FormData = require('form-data');  
const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const QRCode = require('../models/QRCode');
const { authenticateOwner } = require('../middleware/auth');

const EMBEDDING_SERVICE_URL =
  process.env.EMBEDDING_SERVICE_URL || 'http://localhost:8000';

// Multer for search uploads (temporary files)
const searchUpload = multer({ dest: 'uploads/search/' });

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return -1;

  let dot = 0;
  let na = 0;
  let nb = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }

  if (na === 0 || nb === 0) return -1;

  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// POST /api/products/search-by-image
// Upload an image, find visually similar products using CLIP embeddings
router.post(
  '/search-by-image',
  authenticateOwner,
  searchUpload.single('image'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No image uploaded' });
      }

      // 1) Get embedding for the query image from Python service
      let queryVector;
      try {
        const formData = new FormData();

        const filePath = path.isAbsolute(req.file.path)
          ? req.file.path
          : path.join(__dirname, '..', req.file.path);

        formData.append('file', fs.createReadStream(filePath));

        const response = await axios.post(
          `${EMBEDDING_SERVICE_URL}/embed-image`,
          formData,
          {
            headers: formData.getHeaders(),
            timeout: 30000,
          }
        );

        if (!response.data || !response.data.vector) {
          return res
            .status(500)
            .json({ message: 'Embedding service returned no vector' });
        }

        queryVector = response.data.vector;
      } catch (err) {
        if (err.response) {
          console.error(
            'Embedding service error (search):',
            err.response.status,
            err.response.data
          );
        } else if (err.request) {
          console.error(
            'Embedding service network error (search):',
            err.message || err
          );
        } else {
          console.error('Embedding service error (search):', err.message || err);
        }

        return res
          .status(500)
          .json({ message: 'Failed to get embedding for search image' });
      }

      // 2) Fetch products that have at least one imageEmbedding
      const products = await Product.find(
        { isActive: true, 'imageEmbeddings.0': { $exists: true } },
        {
          productId: 1,
          name: 1,
          category: 1,
          images: 1,
          imageEmbeddings: 1,
        }
      );

      if (!products.length) {
        return res.json({
          found: false,
          matches: [],
          message:
            'No products with embeddings found. Add new products or backfill embeddings.',
        });
      }

      // 3) Compute similarity for each product (best of its images)
      const matches = [];

      for (const product of products) {
        let bestSim = -1;

        for (const emb of product.imageEmbeddings || []) {
          const sim = cosineSimilarity(queryVector, emb.vector);
          if (sim > bestSim) bestSim = sim;
        }

        if (bestSim >= 0) {
          matches.push({
            productId: product.productId,
            name: product.name,
            category: product.category,
            thumbnail: product.images?.[0] || null,
            similarity: bestSim,
          });
        }
      }

      if (!matches.length) {
        return res.json({
          found: false,
          matches: [],
          message: 'No similar products found.',
        });
      }

      // 4) Sort by similarity desc
      matches.sort((a, b) => b.similarity - a.similarity);

      // Threshold can be tuned based on your real data
      // Much stricter threshold for "definitely this product"
const THRESHOLD = 0.97;
const strongMatches = matches.filter((m) => m.similarity >= THRESHOLD);

if (!strongMatches.length) {
  // Even if similarity is high-ish (like 0.85-0.95), we do NOT auto-confirm.
  // We just show suggestions and let the user decide / add new.
  return res.json({
    found: false,
    matches: matches.slice(0, 5),
    message: 'No strong match, here are the closest suggestions.',
  });
}

return res.json({
  found: true,
  matches: strongMatches.slice(0, 5),
});

      // Return top strong matches (e.g. top 5)
      return res.json({
        found: true,
        matches: strongMatches.slice(0, 5),
      });
    } catch (err) {
      console.error('Error in /products/search-by-image:', err);
      return res
        .status(500)
        .json({ message: 'Server error while searching by image' });
    }
  }
);

// GET product by ID - public endpoint with owner check
// GET product by ID - public endpoint with owner check
router.get('/:productId', authenticateOwner, async (req, res) => {
  try {
    const product = await Product.findOne({ productId: req.params.productId });
    
    if (!product || !product.isActive) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Always include variantColors for all users (public info)
    const productObj = product.toObject();
    
    // If owner is authenticated, return all data
    if (req.user) {
      return res.json({
        ...productObj,
        view: 'owner'
      });
    }

    // For public view, return public fields INCLUDING variantColors
    const publicProduct = {
      productId: productObj.productId,
      name: productObj.name,
      description: productObj.description,
      category: productObj.category,
      images: productObj.images,
      sellingPrice: productObj.sellingPrice,
      compareAtPrice: productObj.compareAtPrice,
      fabric: productObj.fabric,
      work: productObj.work,
      color: productObj.color,
      size: productObj.size,
      variantColors: productObj.variantColors || [], // ADD THIS LINE
      view: 'public'
    };

    res.json(publicProduct);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET all products (for owner only)
router.get('/', authenticateOwner, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const products = await Product.find({ isActive: true });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Create new product (owner only)
router.post('/', authenticateOwner, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const product = new Product(req.body);
    await product.save();

    res.status(201).json(product);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Product ID already exists' });
    }
    res.status(400).json({ error: error.message });
  }
});

// Add this route to get all product IDs for testing
router.get('/', async (req, res) => {
  try {
    const products = await Product.find({ isActive: true }).select('productId name');
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});
// CREATE - Add new product
router.post('/', authenticateOwner, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const productData = req.body;

    // Check if product ID already exists
    const existingProduct = await Product.findOne({ productId: productData.productId });
    if (existingProduct) {
      return res.status(400).json({ error: 'Product ID already exists' });
    }

    const product = new Product(productData);
    await product.save();

    res.status(201).json({
      message: 'Product created successfully',
      product
    });

  } catch (error) {
    console.error('Error creating product:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Product ID already exists' });
    }
    res.status(400).json({ error: error.message });
  }
});

// UPDATE - Update product
router.put('/:productId', authenticateOwner, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const product = await Product.findOneAndUpdate(
      { productId: req.params.productId },
      { ...req.body, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
      message: 'Product updated successfully',
      product
    });

  } catch (error) {
    console.error('Error updating product:', error);
    res.status(400).json({ error: error.message });
  }
});

// DELETE - Soft delete product
router.delete('/:productId', authenticateOwner, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const product = await Product.findOneAndUpdate(
      { productId: req.params.productId },
      { isActive: false, updatedAt: new Date() },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({
      message: 'Product deleted successfully',
      product
    });

  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: error.message });
  }
});

// HARD DELETE - Completely remove product + related data (use carefully)
router.delete('/:productId/hard', authenticateOwner, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // 1) Find product first (we need its images + productId)
    const product = await Product.findOne({ productId: req.params.productId });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // 2) Delete product images from disk (if they are local uploads)
    if (Array.isArray(product.images)) {
      for (const img of product.images) {
        try {
          let imagePath = null;

          if (typeof img === 'string') {
            // If it's a full URL (http://localhost:5000/uploads/...)
            if (img.startsWith('http')) {
              const urlObj = new URL(img);
              imagePath = urlObj.pathname; // -> /uploads/products/filename.jpg
            } else {
              // Might already be a relative path (/uploads/products/...)
              imagePath = img;
            }
          } else if (img && typeof img.path === 'string') {
            // If you ever store as { url, path }
            imagePath = img.path;
          }

          if (imagePath && imagePath.startsWith('/uploads/')) {
            // Convert to relative (remove leading /) and build absolute path
            const relativePath = imagePath.startsWith('/')
              ? imagePath.slice(1)
              : imagePath;

            const absolutePath = path.join(__dirname, '..', relativePath);

            fs.unlink(absolutePath, (err) => {
              if (err) {
                console.warn(
                  '⚠️ Failed to delete image file:',
                  absolutePath,
                  err.message
                );
              }
            });
          }
        } catch (fileErr) {
          console.warn('⚠️ Error while trying to delete product image:', fileErr.message);
        }
      }
    }

    // 3) Delete any QR codes linked to this product
    await QRCode.deleteMany({ productId: product.productId });

    // 4) Finally delete the product document itself
    await Product.deleteOne({ _id: product._id });

    return res.json({
      message: 'Product and related data permanently deleted',
      productId: product.productId,
    });
  } catch (error) {
    console.error('❌ Error hard deleting product:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET all products with filters (for admin)
router.get('/admin/all', authenticateOwner, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { category, status, search, page = 1, limit = 50 } = req.query;

    let filter = { isActive: true };

    // Apply filters
    if (category && category !== 'all') filter.category = category;
    if (status && status !== 'all') filter.status = status;
    if (search) {
      filter.$or = [
        { productId: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Product.countDocuments(filter);

    res.json({
      products,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });

  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/products/cleanup/soft-deleted
// One-time cleanup: permanently delete all soft-deleted products
router.delete(
  '/cleanup/soft-deleted',
  authenticateOwner,
  async (req, res) => {
    try {
      const result = await Product.deleteMany({ isActive: false });
      return res.json({
        message: 'Soft-deleted products permanently removed',
        deletedCount: result.deletedCount,
      });
    } catch (err) {
      console.error('Error cleaning up soft-deleted products:', err);
      return res.status(500).json({ message: 'Cleanup failed' });
    }
  }
);

// Search products to add as variants (owner only)
router.get('/search/variants', authenticateOwner, async (req, res) => {
  try {
    const { q } = req.query;
    
    const products = await Product.find({
      isActive: true,
      $or: [
        { productId: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
        { color: { $regex: q, $options: 'i' } }
      ]
    })
    .select('productId name color images')
    .limit(10);
    
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET products for variant search
router.get('/search/for-variants', authenticateOwner, async (req, res) => {
  try {
    const { q } = req.query;
    const products = await Product.find({
      isActive: true,
      $or: [
        { productId: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
        { color: { $regex: q, $options: 'i' } }
      ]
    }).select('productId name color images');
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add variant to product
router.post('/:productId/variants', authenticateOwner, async (req, res) => {
  try {
    const { variantProductId } = req.body;
    
    const mainProduct = await Product.findOne({ productId: req.params.productId });
    const variantProduct = await Product.findOne({ productId: variantProductId });
    
    if (!mainProduct || !variantProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Add variant to main product
    mainProduct.variants = mainProduct.variants || [];
    mainProduct.variants.push({
      productId: variantProduct.productId,
      color: variantProduct.color,
      name: variantProduct.name,
      images: variantProduct.images
    });
    
    // Update variantColors for quick lookup
    mainProduct.variantColors = mainProduct.variantColors || [];
    if (!mainProduct.variantColors.find(v => v.productId === variantProduct.productId)) {
      mainProduct.variantColors.push({
        color: variantProduct.color,
        productId: variantProduct.productId
      });
    }
    
    // Link variant to parent
    variantProduct.parentProductId = mainProduct.productId;
    
    await mainProduct.save();
    await variantProduct.save();
    
    res.json({ message: 'Variant added successfully', product: mainProduct });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove variant
router.delete('/:productId/variants/:variantId', authenticateOwner, async (req, res) => {
  try {
    const mainProduct = await Product.findOne({ productId: req.params.productId });
    
    mainProduct.variants = mainProduct.variants.filter(v => v.productId !== req.params.variantId);
    mainProduct.variantColors = mainProduct.variantColors.filter(v => v.productId !== req.params.variantId);
    
    // Clear parent reference
    await Product.findOneAndUpdate(
      { productId: req.params.variantId },
      { $set: { parentProductId: null } }
    );
    
    await mainProduct.save();
    res.json({ message: 'Variant removed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
