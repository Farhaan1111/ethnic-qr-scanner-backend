require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');
const path = require('path');

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uploadRoutes = require('./routes/upload');
// Routes
app.use('/api/products', require('./routes/products'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/upload', uploadRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

app.use('/api/qr', require('./routes/qr'));

app.use('/api/inventory', require('./routes/inventory'));

app.use('/api/fabrics', require('./routes/fabrics'));
