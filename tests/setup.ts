import mongoose from 'mongoose';
import { beforeAll, afterAll } from 'vitest';

// Use real MongoDB connection for tests instead of MongoMemoryServer
const TEST_MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://mongodb:27017/lemonade_test';

let connectionEstablished = false;

export const setupTestDatabase = () => {
  beforeAll(async () => {
    if (!connectionEstablished) {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.disconnect();
      }
      await mongoose.connect(TEST_MONGODB_URI);
      connectionEstablished = true;
    }
  });

  afterAll(async () => {
    // Clean up collections instead of dropping database
    if (mongoose.connection.readyState === 1) {
      const collections = Object.keys(mongoose.connection.collections);
      for (const collection of collections) {
        try {
          await mongoose.connection.collections[collection].deleteMany({});
        } catch (error) {
          // Ignore errors
        }
      }
    }
  });
};

export const clearCollection = async (collectionName: string) => {
  if (mongoose.connection.collections[collectionName]) {
    await mongoose.connection.collections[collectionName].deleteMany({});
  }
};
