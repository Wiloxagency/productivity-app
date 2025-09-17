require('dotenv').config();
const mongoose = require('mongoose');
const Category = require('./models/Category');
const Activity = require('./models/Activity');

const seedData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB Atlas');

    // Clear existing data
    await Category.deleteMany({});
    await Activity.deleteMany({});
    console.log('Cleared existing data');

    // Create categories
    const categories = await Category.create([
      {
        name: 'Work',
        description: 'Professional tasks and projects',
        color: '#007bff',
        isDefault: true
      },
      {
        name: 'Personal Development',
        description: 'Learning, reading, skill building',
        color: '#28a745'
      },
      {
        name: 'Health & Fitness',
        description: 'Exercise, gym, health activities',
        color: '#dc3545'
      },
      {
        name: 'Domestic Tasks',
        description: 'Household chores and maintenance',
        color: '#ffc107'
      },
      {
        name: 'Meals',
        description: 'Breakfast, lunch, dinner',
        color: '#fd7e14'
      },
      {
        name: 'Leisure',
        description: 'Entertainment, hobbies, relaxation',
        color: '#6f42c1'
      },
      {
        name: 'Rest',
        description: 'Breaks, naps, relaxation',
        color: '#17a2b8'
      }
    ]);

    console.log('Categories created:', categories.length);

    // Create sample activities
    const workCategory = categories.find(c => c.name === 'Work');
    const personalCategory = categories.find(c => c.name === 'Personal Development');
    const healthCategory = categories.find(c => c.name === 'Health & Fitness');
    const domesticCategory = categories.find(c => c.name === 'Domestic Tasks');
    const mealsCategory = categories.find(c => c.name === 'Meals');
    const leisureCategory = categories.find(c => c.name === 'Leisure');
    const restCategory = categories.find(c => c.name === 'Rest');

    const activities = await Activity.create([
      // Work activities (Quadrant 1 & 2)
      {
        name: 'Project Development',
        description: 'Main work on current projects',
        category: workCategory._id,
        quadrant: 1,
        estimatedDuration: 60,
        color: '#007bff'
      },
      {
        name: 'Code Review',
        description: 'Review team code and PRs',
        category: workCategory._id,
        quadrant: 1,
        estimatedDuration: 30,
        color: '#0056b3'
      },
      {
        name: 'Planning & Strategy',
        description: 'Long-term planning and strategic thinking',
        category: workCategory._id,
        quadrant: 2,
        estimatedDuration: 45,
        color: '#004085'
      },
      
      // Personal Development (Quadrant 2)
      {
        name: 'Reading',
        description: 'Reading books, articles, documentation',
        category: personalCategory._id,
        quadrant: 2,
        estimatedDuration: 30,
        color: '#28a745'
      },
      {
        name: 'Online Course',
        description: 'Taking online courses and tutorials',
        category: personalCategory._id,
        quadrant: 2,
        estimatedDuration: 45,
        color: '#1e7e34'
      },
      
      // Health & Fitness (Quadrant 2)
      {
        name: 'Gym Workout',
        description: 'Strength training and cardio',
        category: healthCategory._id,
        quadrant: 2,
        estimatedDuration: 60,
        color: '#dc3545',
        isDefault: true
      },
      {
        name: 'Morning Walk',
        description: 'Light exercise and fresh air',
        category: healthCategory._id,
        quadrant: 2,
        estimatedDuration: 30,
        color: '#c82333'
      },
      
      // Domestic Tasks (Quadrant 3 & 4)
      {
        name: 'House Cleaning',
        description: 'General cleaning and tidying',
        category: domesticCategory._id,
        quadrant: 3,
        estimatedDuration: 45,
        color: '#ffc107'
      },
      {
        name: 'Laundry',
        description: 'Washing and folding clothes',
        category: domesticCategory._id,
        quadrant: 4,
        estimatedDuration: 20,
        color: '#e0a800'
      },
      
      // Meals
      {
        name: 'Breakfast',
        description: 'Morning meal',
        category: mealsCategory._id,
        quadrant: 4,
        estimatedDuration: 20,
        color: '#fd7e14',
        isDefault: true
      },
      {
        name: 'Lunch',
        description: 'Midday meal',
        category: mealsCategory._id,
        quadrant: 4,
        estimatedDuration: 30,
        color: '#fd7e14',
        isDefault: true
      },
      {
        name: 'Dinner',
        description: 'Evening meal',
        category: mealsCategory._id,
        quadrant: 4,
        estimatedDuration: 40,
        color: '#fd7e14',
        isDefault: true
      },
      
      // Leisure (Quadrant 4)
      {
        name: 'Entertainment',
        description: 'Movies, games, social media',
        category: leisureCategory._id,
        quadrant: 4,
        estimatedDuration: 60,
        color: '#6f42c1'
      },
      {
        name: 'Social Time',
        description: 'Spending time with friends and family',
        category: leisureCategory._id,
        quadrant: 4,
        estimatedDuration: 120,
        color: '#5a379b'
      },
      
      // Rest
      {
        name: 'Break Time',
        description: 'Short breaks between activities',
        category: restCategory._id,
        quadrant: 4,
        estimatedDuration: 15,
        color: '#17a2b8',
        isDefault: true
      },
      {
        name: 'Power Nap',
        description: 'Short afternoon rest',
        category: restCategory._id,
        quadrant: 4,
        estimatedDuration: 20,
        color: '#138496'
      }
    ]);

    console.log('Activities created:', activities.length);
    console.log('Database seeded successfully!');
    
    mongoose.disconnect();
  } catch (error) {
    console.error('Seed error:', error);
    mongoose.disconnect();
  }
};

seedData();
