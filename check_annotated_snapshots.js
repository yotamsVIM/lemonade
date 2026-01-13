#!/usr/bin/env node
/**
 * Check for ANNOTATED snapshots ready for Forge processing
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lemonade_dev';

const SnapshotSchema = new mongoose.Schema({
  htmlBlob: String,
  groundTruth: mongoose.Schema.Types.Mixed,
  extractorCode: String,
  logs: Array,
  status: String
}, { timestamps: true });

const Snapshot = mongoose.model('Snapshot', SnapshotSchema);

async function checkAnnotatedSnapshots() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Count snapshots by status
    const statusCounts = await Snapshot.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    console.log('📊 Snapshot Status Counts:');
    statusCounts.forEach(({ _id, count }) => {
      console.log(`  ${_id}: ${count}`);
    });
    console.log();

    // Find ANNOTATED snapshots
    const annotated = await Snapshot.find({ status: 'ANNOTATED' })
      .select('_id createdAt groundTruth')
      .sort({ createdAt: -1 })
      .limit(5);

    if (annotated.length === 0) {
      console.log('⚠️  No ANNOTATED snapshots found');
      console.log('   Oracle may not have processed any snapshots yet.');
      console.log('   You can:');
      console.log('   1. Run the Chrome extension to capture a page');
      console.log('   2. Wait for Oracle to process it (status: NEW → ANNOTATED)');
      console.log('   3. Or create test data manually');
    } else {
      console.log(`✅ Found ${annotated.length} ANNOTATED snapshot(s):\n`);
      annotated.forEach((snap, i) => {
        console.log(`${i + 1}. ID: ${snap._id}`);
        console.log(`   Created: ${snap.createdAt}`);
        console.log(`   Ground Truth Fields: ${Object.keys(snap.groundTruth || {}).join(', ')}`);
        console.log();
      });

      console.log('🔨 Ready to test Forge! Run:');
      console.log('   pnpm dev:forge');
      console.log('   or');
      console.log('   pnpm test:forge');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkAnnotatedSnapshots();
