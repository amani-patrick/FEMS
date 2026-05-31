require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const authRoutes = require('./routes/auth.routes');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(morgan('dev'));
app.use(express.json());

app.use('/', authRoutes);

app.get('/health', (req, res) => res.json({ status: 'OK', service: 'auth-service' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Auth Service Error:', err);
  if (err.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: err.message });
  }
  res.status(500).json({ success: false, message: 'Internal server error', ...(process.env.NODE_ENV === 'development' && { error: err.message }) });
});

app.listen(PORT, () => console.log(`🔐 Auth Service running on port ${PORT}`));
