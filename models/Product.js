const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  productId: {
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
  description: {
    type: String,
    required: true
  },
  category: {
  type: String,
  required: true,
  enum: [
    'Sherwani: Farma', 
    'Sherwani: Velvet', 
    'Sherwani: Georgette', 
    'Sherwani: Diverse Fabric',
    'Open Indo: Georgette',
    'Open Indo: Diverse Fabric', 
    'Semi Indo: Diverse Fabric',
    'Indo Western: Diverse Fabric',
    'Jodhpuri',
    'Kurta Jacket', 
    'Kurta: Chicken',
    'Kurta: Pintex',
    'Suits: Party Wear',
    'Suits: Tuxedo'
  ]
},
  images: [{
    type: String,
    required: true
  }],

  // NEW FIELD: image embeddings for visual search
  imageEmbeddings: [{
    imagePath: {
      type: String,          // path to the image file, e.g. "/uploads/products/abc.jpg"
      required: true,
    },
    vector: {
      type: [Number],        // embedding array (floats from the vision model)
      required: true,
    },
    model: {
      type: String,
      default: 'clip-vit-b32' // which model generated this embedding
    }
  }],

  sellingPrice: {
    type: Number,
    required: true
  },
  compareAtPrice: {
    type: Number
  },

  // Private fields - only for owners
  costPrice: {
    type: Number,
    required: true
  },
  supplier: {
    type: String,
    required: true
  },
  supplierContact: {
    type: String
  },
  stock: {
    type: Number,
    default: 0
  },
  lowStockAlert: {
    type: Number,
    default: 5
  },
  reorderPoint: {
    type: Number,
    default: 10
  },
  // Product details
  fabric: String,
  work: String, // embroidery, print, etc.
  color: String,

  // List of available sizes (labels only)
  size: [String],

  // Per-size stock tracking
  sizeStock: [
    {
      size: { type: String, required: true },
      stock: { type: Number, default: 0 }
    }
  ],

  // Metadata
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  // Inventory Management Fields
  stock: {
    type: Number,
    default: 0,
    required: true
  },
  reservedStock: {
    type: Number,
    default: 0  // Stock reserved for pending orders
  },
  lowStockAlert: {
    type: Number,
    default: 5
  },
  reorderPoint: {
    type: Number,
    default: 10
  },
  idealStock: {
    type: Number,
    default: 20
  },
  unit: {
    type: String,
    default: 'pcs'
  },

  // Inventory History
  lastRestocked: Date,
  restockQuantity: Number,

  // Cost & Pricing
  costPrice: {
    type: Number,
    required: true
  },
  sellingPrice: {
    type: Number,
    required: true
  },
  taxRate: {
    type: Number,
    default: 18 // GST percentage
  },

  // Supplier Information
  supplier: {
    name: String,
    contact: String,
    email: String,
    leadTime: {  // Days to restock
      type: Number,
      default: 7
    }
  },
  // Add this to productSchema in Product.js
variants: [{
  productId: {
    type: String,
    ref: 'Product'
  },
  color: String,
  name: String,
  images: [String]
}],
parentProductId: { // For variant products to reference main product
  type: String,
  default: null
},
variantColors: [{ // Quick lookup of available colors
  color: String,
  productId: String
}],
  // Fabric Tracking - Enhanced
fabricUsed: [{
  fabricId: String,
  fabricName: String,
  metersUsed: Number,
  costPerMeter: Number,
  totalCost: Number
}],
estimatedFabricUsage: Number, // Estimated meters for this product type
  // Inventory Status
  status: {
    type: String,
    enum: ['in_stock', 'low_stock', 'out_of_stock', 'discontinued'],
    default: 'in_stock'
  }
}, {
  timestamps: true
});

// Virtual for available stock (total - reserved)
productSchema.virtual('availableStock').get(function () {
  return Math.max(0, this.stock - this.reservedStock);
});

// Auto-update status based on stock level
productSchema.pre('save', function (next) {
  if (this.stock === 0) {
    this.status = 'out_of_stock';
  } else if (this.stock <= this.lowStockAlert) {
    this.status = 'low_stock';
  } else {
    this.status = 'in_stock';
  }
  next();
});
// Update timestamp before saving
productSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Add after the schema definition, before module.exports

// Method to get all variants of a product
productSchema.methods.getVariants = async function() {
  return await Product.find({ variantOf: this._id })
    .select('productId name images sellingPrice color size fabric status stock');
};

// Method to check if product has variants
productSchema.virtual('hasVariants').get(function() {
  return this.variants && this.variants.length > 0;
});

// Update the pre-save hook to handle variant status
productSchema.pre('save', function (next) {
  // Auto-update status based on stock level
  if (this.stock === 0) {
    this.status = 'out_of_stock';
  } else if (this.stock <= this.lowStockAlert) {
    this.status = 'low_stock';
  } else {
    this.status = 'in_stock';
  }

  // Update timestamp
  this.updatedAt = Date.now();

  // If this is a variant and has no parent, set isVariant to false
  if (this.isVariant && !this.variantOf) {
    this.isVariant = false;
  }

  next();
});

module.exports = mongoose.model('Product', productSchema);
