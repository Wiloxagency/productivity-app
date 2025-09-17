require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB Atlas'))
  .catch(err => console.error('MongoDB connection error:', err));

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Productivity App API is running!' });
});

// Import routes (will be created)
const activityRoutes = require('./routes/activities');
const timeEntryRoutes = require('./routes/timeEntries');
const taskRoutes = require('./routes/tasks');
const categoryRoutes = require('./routes/categories');
const planningRoutes = require('./routes/planning');
const projectRoutes = require('./routes/projects');
const defaultSelectionsRoutes = require('./routes/default-selections');

// Use routes
app.use('/api/activities', activityRoutes);
app.use('/api/time-entries', timeEntryRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/planning', planningRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/default-selections', defaultSelectionsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
