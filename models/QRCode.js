const mongoose = require('mongoose');

const qrCodeSchema = new mongoose.Schema({
  productId: {
    type: String,
    required: true,
    ref: 'Product'
  },
  productName: {
    type: String,
    required: true
  },
  qrCodeData: {
    type: String, // Base64 encoded QR code image
    required: true
  },
  qrCodeUrl: {
    type: String, // The URL the QR code points to
    required: true
  },
  size: {
    type: Number,
    default: 300
  },
  color: {
    type: String,
    default: '#000000'
  },
  generatedBy: {
    type: String,
    required: true
  },
  generatedAt: {
    type: Date,
    default: Date.now
  },
  lastAccessed: {
    type: Date,
    default: Date.now
  },
  accessCount: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for efficient queries
qrCodeSchema.index({ productId: 1 });
qrCodeSchema.index({ generatedAt: -1 });

module.exports = mongoose.model('QRCode', qrCodeSchema);
