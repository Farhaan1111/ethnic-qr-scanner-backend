const mongoose = require('mongoose');

const inventoryTransactionSchema = new mongoose.Schema({
  productId: {
    type: String,
    required: true
  },

  // NEW: which size was affected (optional)
  size: {
    type: String
  },

  type: {
    type: String,
    enum: ['in', 'out', 'adjustment', 'return', 'damage'],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  previousStock: Number,
  newStock: Number,
  reason: {
    type: String,
    enum: [
      'purchase', 'sale', 'return', 'damaged', 
      'lost', 'adjustment', 'initial_stock', 'manual_adjustment', 'production'
    ]
  },
  reference: String,
  notes: String,
  performedBy: String,
  costPerUnit: Number,
  totalValue: Number,
  transactionDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('InventoryTransaction', inventoryTransactionSchema);
