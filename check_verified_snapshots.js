#!/usr/bin/env node
/**
 * Check VERIFIED snapshots to see what's already been processed
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

async function checkVerifiedSnapshots() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const verified = await Snapshot.find({ status: 'VERIFIED' })
      .sort({ createdAt: -1 });

    if (verified.length === 0) {
      console.log('⚠️  No VERIFIED snapshots found');
    } else {
      console.log(`📦 Found ${verified.length} VERIFIED snapshot(s):\n`);

      verified.forEach((snap, i) => {
        console.log(`${i + 1}. Snapshot ${snap._id}`);
        console.log(`   Created: ${snap.createdAt}`);
        console.log(`   Has Ground Truth: ${snap.groundTruth ? 'Yes' : 'No'}`);
        if (snap.groundTruth) {
          console.log(`   Ground Truth Fields: ${Object.keys(snap.groundTruth).join(', ')}`);
        }
        console.log(`   Has Extractor Code: ${snap.extractorCode ? 'Yes' : 'No'}`);
        if (snap.extractorCode) {
          console.log(`   Code Length: ${snap.extractorCode.length} characters`);
        }

        // Show logs
        const forgeLogs = snap.logs.filter(log => log.phase === 'FORGE');
        if (forgeLogs.length > 0) {
          console.log(`   Forge Logs (${forgeLogs.length}):`);
          forgeLogs.forEach(log => {
            console.log(`     [${log.level}] ${log.msg}`);
          });
        }
        console.log();
      });
    }

    // Also check NEW snapshots
    const newCount = await Snapshot.countDocuments({ status: 'NEW' });
    console.log(`\n📝 You have ${newCount} NEW snapshot(s) waiting for Oracle to process`);

    if (newCount > 0) {
      console.log('\nTo process them through Oracle:');
      console.log('  1. Make sure AI_WORKER_ENABLED=true in .env');
      console.log('  2. Start backend: pnpm dev');
      console.log('  3. Oracle will auto-process NEW → ANNOTATED');
      console.log('  4. Forge will auto-process ANNOTATED → VERIFIED');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkVerifiedSnapshots();
