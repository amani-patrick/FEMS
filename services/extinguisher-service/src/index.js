require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const extinguisherRoutes = require('./routes/extinguisher.routes');
const inspectionRoutes = require('./routes/inspection.routes');
const maintenanceRoutes = require('./routes/maintenance.routes');

const app = express();
const PORT = process.env.PORT || 5003;

app.use(helmet());
app.use(cors({ origin: '*', credentials: true }));
app.use(morgan('dev'));
app.use(express.json());

app.use('/extinguishers', extinguisherRoutes);
app.use('/inspections', inspectionRoutes);
app.use('/maintenance', maintenanceRoutes);

app.get('/health', (req, res) => res.json({ status: 'OK', service: 'extinguisher-service' }));

app.use((err, req, res, next) => {
  console.error('Extinguisher Service Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { error: err.message }),
  });
});

app.listen(PORT, () => console.log(`🧯 Extinguisher Service running on port ${PORT}`));
