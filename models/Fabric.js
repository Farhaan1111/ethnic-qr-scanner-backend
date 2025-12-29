const mongoose = require('mongoose');

const fabricSchema = new mongoose.Schema({
  fabricId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'silk', 'cotton', 'linen', 'wool', 'synthetic', 
      'velvet', 'georgette', 'chiffon', 'organza', 'net',
      'brocade', 'banarasi', 'kanjivaram', 'tussar', 'mulmul'
    ]
  },
  description: String,
  color: String,
  width: {
    type: Number, // in inches
    required: true
  },
  weight: {
    type: Number, // GSM (grams per square meter)
    required: true
  },
  pattern: {
    type: String,
    enum: ['plain', 'printed', 'embroidered', 'woven', 'dyed', 'checkered']
  },
  
  // Inventory Management
  currentStock: {
    type: Number, // in meters
    default: 0,
    required: true
  },
  unit: {
    type: String,
    default: 'meters'
  },
  lowStockAlert: {
    type: Number,
    default: 10 // meters
  },
  reorderPoint: {
    type: Number,
    default: 20 // meters
  },
  costPerMeter: {
    type: Number,
    required: true
  },
  
  // Supplier Information
  supplier: {
    name: String,
    contact: String,
    email: String,
    leadTime: {
      type: Number,
      default: 7 // days
    }
  },
  
  // Add to fabric schema
usedInProducts: [{
  productId: String,
  productName: String,
  productCategory: String,
  metersUsed: Number,
  usedAt: {
    type: Date,
    default: Date.now
  }
}],
  
  // Status
  status: {
    type: String,
    enum: ['available', 'low_stock', 'out_of_stock', 'discontinued'],
    default: 'available'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Auto-update status based on stock level
fabricSchema.pre('save', function(next) {
  if (this.currentStock === 0) {
    this.status = 'out_of_stock';
  } else if (this.currentStock <= this.lowStockAlert) {
    this.status = 'low_stock';
  } else {
    this.status = 'available';
  }
  next();
});

// Virtual for total value
fabricSchema.virtual('totalValue').get(function() {
  return this.currentStock * this.costPerMeter;
});

module.exports = mongoose.model('Fabric', fabricSchema);
