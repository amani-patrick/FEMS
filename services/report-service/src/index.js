require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const reportRoutes = require('./routes/report.routes');

const app = express();
const PORT = process.env.PORT || 5005;

app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(morgan('dev'));
app.use(express.json());

app.use('/', reportRoutes);

app.get('/health', (req, res) => res.json({ status: 'OK', service: 'report-service' }));

app.use((err, req, res, next) => {
  console.error('Report Service Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { error: err.message }),
  });
});

app.listen(PORT, () => console.log(`📊 Report Service running on port ${PORT}`));
