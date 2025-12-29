const mongoose = require('mongoose');

const fabricTransactionSchema = new mongoose.Schema({
  fabricId: {
    type: String,
    required: true,
    ref: 'Fabric'
  },
  type: {
    type: String,
    enum: ['purchase', 'usage', 'adjustment', 'wastage', 'return'],
    required: true
  },
  quantity: {
    type: Number, // in meters
    required: true
  },
  previousStock: Number,
  newStock: Number,
  reference: String, // Product ID, Purchase Order ID, etc.
  notes: String,
  costPerMeter: Number,
  totalValue: Number,
  performedBy: String,
  transactionDate: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('FabricTransaction', fabricTransactionSchema);
