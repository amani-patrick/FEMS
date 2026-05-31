require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const entryRoutes = require('./routes/entry.routes');

const app = express();
const PORT = process.env.PORT || 5003;

app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(morgan('dev'));
app.use(express.json());

app.use('/', entryRoutes);
app.get('/health', (req, res) => res.json({ status: 'OK', service: 'entry-service' }));

app.use((err, req, res, next) => {
  console.error('Entry Service Error:', err);
  res.status(500).json({ success: false, message: 'Internal server error', ...(process.env.NODE_ENV === 'development' && { error: err.message }) });
});

app.listen(PORT, () => console.log(`🚗 Entry Service running on port ${PORT}`));
