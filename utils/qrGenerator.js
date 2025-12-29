const QRCode = require('qrcode');

class QRGenerator {
  static async generateProductQR(productId, options = {}) {
    try {
      const baseUrl = process.env.FRONTEND_BASE_URL;
      const productUrl = `${baseUrl}/p/${productId}`;
      
      const qrOptions = {
        width: options.size || 300,
        margin: 2,
        color: {
          dark: '#D4AF37', // Gold color for QR code
          light: '#000000' // Black background
        },
        type: 'png'
      };
      
      // Generate QR code as data URL
      const qrDataURL = await QRCode.toDataURL(productUrl, qrOptions);
      
      return {
        url: productUrl,
        qrCode: qrDataURL,
        productId: productId
      };
    } catch (error) {
      throw new Error(`QR generation failed: ${error.message}`);
    }
  }

  static async generateBulkQRs(products) {
    const qrPromises = products.map(product => 
      this.generateProductQR(product.productId, { size: 200 })
    );
    
    return Promise.all(qrPromises);
  }
}

module.exports = QRGenerator;