require('dotenv').config();
const mongoose = require('mongoose');
const Task = require('./models/Task');
const Category = require('./models/Category');

const createSampleTasks = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB Atlas');

    // Get categories
    const categories = await Category.find();
    const workCategory = categories.find(c => c.name === 'Work');
    const personalCategory = categories.find(c => c.name === 'Personal Development');
    const healthCategory = categories.find(c => c.name === 'Health & Fitness');
    const domesticCategory = categories.find(c => c.name === 'Domestic Tasks');

    // Clear existing tasks
    await Task.deleteMany({});
    console.log('Cleared existing tasks');

    // Create sample tasks
    const sampleTasks = [
      // Quadrant 1: Urgent & Important
      {
        title: 'Fix Critical Bug in Production',
        description: 'Emergency bug fix needed for the main application causing user login issues',
        category: workCategory._id,
        quadrant: 1,
        estimatedTime: 120,
        tags: ['urgent', 'bug', 'production'],
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
        priority: 1
      },
      {
        title: 'Prepare for Important Client Meeting',
        description: 'Prepare presentation and materials for tomorrow\'s client meeting',
        category: workCategory._id,
        quadrant: 1,
        estimatedTime: 90,
        tags: ['meeting', 'client', 'presentation'],
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        priority: 2
      },

      // Quadrant 2: Not Urgent & Important
      {
        title: 'Learn New Programming Framework',
        description: 'Study React Native for upcoming mobile project',
        category: personalCategory._id,
        quadrant: 2,
        estimatedTime: 180,
        tags: ['learning', 'react-native', 'mobile'],
        priority: 3
      },
      {
        title: 'Plan Next Quarter Goals',
        description: 'Define objectives and key results for Q4',
        category: workCategory._id,
        quadrant: 2,
        estimatedTime: 60,
        tags: ['planning', 'goals', 'okr'],
        priority: 4
      },
      {
        title: 'Set Up Home Gym Routine',
        description: 'Create a structured workout plan for home exercises',
        category: healthCategory._id,
        quadrant: 2,
        estimatedTime: 45,
        tags: ['fitness', 'planning', 'health'],
        priority: 5
      },
      {
        title: 'Read "Atomic Habits" Book',
        description: 'Complete reading and take notes on habit formation',
        category: personalCategory._id,
        quadrant: 2,
        estimatedTime: 300,
        tags: ['reading', 'habits', 'self-improvement'],
        priority: 6
      },

      // Quadrant 3: Urgent & Not Important
      {
        title: 'Respond to Non-Critical Emails',
        description: 'Reply to various non-urgent work emails',
        category: workCategory._id,
        quadrant: 3,
        estimatedTime: 30,
        tags: ['email', 'communication'],
        priority: 7
      },
      {
        title: 'Schedule Dentist Appointment',
        description: 'Call dentist office to schedule routine cleaning',
        category: healthCategory._id,
        quadrant: 3,
        estimatedTime: 10,
        tags: ['appointment', 'health'],
        priority: 8
      },

      // Quadrant 4: Not Urgent & Not Important
      {
        title: 'Organize Digital Photos',
        description: 'Sort and organize photos from last vacation',
        category: personalCategory._id,
        quadrant: 4,
        estimatedTime: 60,
        tags: ['photos', 'organization'],
        priority: 9
      },
      {
        title: 'Clean Out Email Subscriptions',
        description: 'Unsubscribe from unnecessary newsletters',
        category: domesticCategory._id,
        quadrant: 4,
        estimatedTime: 20,
        tags: ['email', 'cleanup'],
        priority: 10
      },
      {
        title: 'Research New TV Shows',
        description: 'Look for new series to watch on streaming platforms',
        category: personalCategory._id,
        quadrant: 4,
        estimatedTime: 30,
        tags: ['entertainment', 'research'],
        priority: 11
      }
    ];

    const tasks = await Task.create(sampleTasks);
    console.log('Sample tasks created:', tasks.length);
    console.log('Tasks by quadrant:');
    console.log('Q1 (Urgent & Important):', tasks.filter(t => t.quadrant === 1).length);
    console.log('Q2 (Not Urgent & Important):', tasks.filter(t => t.quadrant === 2).length);
    console.log('Q3 (Urgent & Not Important):', tasks.filter(t => t.quadrant === 3).length);
    console.log('Q4 (Not Urgent & Not Important):', tasks.filter(t => t.quadrant === 4).length);

    mongoose.disconnect();
  } catch (error) {
    console.error('Error creating sample tasks:', error);
    mongoose.disconnect();
  }
};

createSampleTasks();
