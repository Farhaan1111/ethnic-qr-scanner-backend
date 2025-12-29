const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const InventoryTransaction = require('../models/InventoryTransaction');
const Fabric = require('../models/Fabric');
const FabricTransaction = require('../models/FabricTransaction');
const { authenticateOwner, requireOwner } = require('../middleware/auth');

// Get inventory overview
router.get('/overview', authenticateOwner, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    console.log('📊 Fetching inventory overview...');
    const products = await Product.find({ isActive: true });
    console.log(`📦 Found ${products.length} active products`);

    // Calculate overview statistics
    const outOfStock = products.filter(p => p.stock === 0).length;
    const lowStock = products.filter(p => p.stock > 0 && p.stock <= (p.lowStockAlert || 5)).length;
    const inStock = products.filter(p => p.stock > (p.lowStockAlert || 5)).length;

    const overview = {
      totalProducts: products.length,
      totalStockValue: products.reduce((sum, product) => {
        return sum + (product.stock * (product.costPrice || 0));
      }, 0),
      totalItems: products.reduce((sum, product) => sum + (product.stock || 0), 0),
      outOfStock: outOfStock,
      lowStock: lowStock,
      inStock: inStock,
      stockStatus: products.map(p => ({
        productId: p.productId,
        name: p.name,
        stock: p.stock || 0,
        status: p.stock === 0 ? 'out_of_stock' :
          p.stock <= (p.lowStockAlert || 5) ? 'low_stock' : 'in_stock',
        availableStock: Math.max(0, (p.stock || 0) - (p.reservedStock || 0))
      }))
    };

    console.log('✅ Overview calculated:', overview);
    res.json(overview);

  } catch (error) {
    console.error('❌ Error in inventory overview:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get low stock alerts - FIXED QUERY
router.get('/alerts/low-stock', authenticateOwner, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    console.log('🔔 Fetching low stock alerts...');

    // Get all active products
    const allProducts = await Product.find({ isActive: true });
    console.log(`📦 Total active products: ${allProducts.length}`);

    // Filter in memory for low stock
    const criticalProducts = allProducts.filter(p => p.stock === 0);
    const warningProducts = allProducts.filter(p =>
      p.stock > 0 && p.stock <= (p.lowStockAlert || 5)
    );

    console.log(`🚨 Critical: ${criticalProducts.length}, Warnings: ${warningProducts.length}`);

    res.json({
      critical: criticalProducts,
      warnings: warningProducts,
      totalAlerts: criticalProducts.length + warningProducts.length
    });

  } catch (error) {
    console.error('❌ Error in low stock alerts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update stock for a product
router.patch('/:productId/stock', authenticateOwner, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { operation, quantity, reason, notes, costPerUnit, size } = req.body;
    console.log(`🔄 Stock update: ${operation} ${quantity} for ${req.params.productId} ${size ? `size: ${size}` : ''}`);

    const product = await Product.findOne({ productId: req.params.productId });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const previousStock = product.stock || 0;
    let newStock = previousStock;

    // 🧵 1) If this is production, first check & consume fabric
    if (operation === 'add' && reason === 'production') {
      const fabricUsage = product.fabricUsed || [];

      if (fabricUsage.length > 0) {
        const shortages = [];

        // First pass: check all fabric stocks
        for (const usage of fabricUsage) {
          const fabric = await Fabric.findOne({ fabricId: usage.fabricId });
          if (!fabric) {
            shortages.push(`Fabric ${usage.fabricId} not found`);
            continue;
          }

          const requiredMeters = (usage.metersUsed || 0) * quantity;
          if (fabric.currentStock < requiredMeters) {
            shortages.push(
              `${fabric.name} (${fabric.fabricId}) requires ${requiredMeters}m but has only ${fabric.currentStock}m`
            );
          }
        }

        // Not enough fabric → abort
        if (shortages.length > 0) {
          return res.status(400).json({
            error: 'Not enough fabric stock to produce this quantity',
            shortages,
          });
        }

        // Second pass: deduct fabric and log FabricTransaction
        for (const usage of fabricUsage) {
          const fabric = await Fabric.findOne({ fabricId: usage.fabricId });

          const requiredMeters = (usage.metersUsed || 0) * quantity;
          const previousFabricStock = fabric.currentStock;
          fabric.currentStock = previousFabricStock - requiredMeters;

          // Track usage in fabric document
          fabric.usedInProducts = fabric.usedInProducts || [];
          fabric.usedInProducts.push({
            productId: product.productId,
            productName: product.name,
            productCategory: product.category,
            metersUsed: requiredMeters,
            usedAt: new Date(),
          });

          await fabric.save();

          try {
            const fabricTx = new FabricTransaction({
              fabricId: fabric.fabricId,
              type: 'usage',
              quantity: requiredMeters,
              previousStock: previousFabricStock,
              newStock: fabric.currentStock,
              reference: product.productId,
              notes: `Used for product: ${product.name} (production x${quantity})`,
              costPerMeter: fabric.costPerMeter,
              totalValue: fabric.costPerMeter * requiredMeters,
              performedBy: req.user.role || 'owner',
            });

            await fabricTx.save();
          } catch (txErr) {
            console.log('⚠️ FabricTransaction model not available, skipping fabric transaction log');
          }
        }
      }
    }

    // 🧵 2) Existing logic: calculate new stock
    switch (operation) {
      case 'add':
        newStock = previousStock + quantity;
        break;
      case 'subtract':
        newStock = Math.max(0, previousStock - quantity);
        break;
      case 'set':
        newStock = quantity;
        break;
      case 'reserve':
        product.reservedStock = (product.reservedStock || 0) + quantity;
        await product.save();
        return res.json(product);
      case 'release':
        product.reservedStock = Math.max(0, (product.reservedStock || 0) - quantity);
        await product.save();
        return res.json(product);
      default:
        return res.status(400).json({ error: 'Invalid operation' });
    }

        // If size is provided, update per-size stock as well
    if (size) {
      if (!product.sizeStock) {
        product.sizeStock = [];
      }

      let sizeEntry = product.sizeStock.find((s) => s.size === size);
      if (!sizeEntry) {
        sizeEntry = { size, stock: 0 };
        product.sizeStock.push(sizeEntry);
      }

      const prevSizeStock = sizeEntry.stock || 0;
      let newSizeStock = prevSizeStock;

      switch (operation) {
        case 'add':
          newSizeStock = prevSizeStock + quantity;
          break;
        case 'subtract':
          // prevent selling more than available
          if (prevSizeStock < quantity) {
            return res.status(400).json({
              error: `Not enough stock for size ${size}. Available: ${prevSizeStock}, requested: ${quantity}`,
            });
          }
          newSizeStock = prevSizeStock - quantity;
          break;
        case 'set':
          newSizeStock = quantity;
          break;
        default:
          // reserve/release ignored per-size for now
          break;
      }

      sizeEntry.stock = newSizeStock;
    }

    // Update product stock
    product.stock = newStock;
    if (operation === 'add') {
      product.lastRestocked = new Date();
      product.restockQuantity = quantity;
    }

    await product.save();

    // Create transaction record if InventoryTransaction model exists
    try {
      const InventoryTransaction = require('../models/InventoryTransaction');
        const transaction = new InventoryTransaction({
        productId: product.productId,
        size: size || undefined,      // 👈 NEW
        type: operation === 'add' ? 'in' : 'out',
        quantity: Math.abs(quantity),
        previousStock,
        newStock,
        reason: reason || 'manual_adjustment',
        notes,
        costPerUnit: costPerUnit || product.costPrice,
        totalValue: (costPerUnit || product.costPrice) * quantity,
        performedBy: req.user.role || 'owner'
      });

      await transaction.save();
    } catch (transactionError) {
      console.log('⚠️ InventoryTransaction model not available, skipping transaction log');
    }

    res.json({
      product,
      message: `Stock updated successfully. New stock: ${newStock}`
    });

  } catch (error) {
    console.error('❌ Error updating stock:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all products for inventory
router.get('/products', authenticateOwner, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const products = await Product.find({ isActive: true })
      .select('productId name category stock costPrice sellingPrice lowStockAlert reservedStock status')
      .sort({ productId: 1 });

    res.json(products);

  } catch (error) {
    console.error('❌ Error fetching products:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
