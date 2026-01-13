#!/usr/bin/env node
/**
 * Check a specific snapshot by ID
 */

const http = require('http');
const snapshotId = process.argv[2];

if (!snapshotId) {
  console.log('Usage: node check_snapshot_by_id.js <snapshot_id>');
  process.exit(1);
}

const options = {
  hostname: 'localhost',
  port: 3000,
  path: `/api/snapshots/${snapshotId}`,
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const snapshot = JSON.parse(data);
      console.log('Snapshot:', snapshot._id);
      console.log('Source URL:', snapshot.sourceUrl);
      console.log('Status:', snapshot.status);
      console.log('Created:', snapshot.createdAt);
      console.log('HTML Size:', (snapshot.htmlBlob?.length / 1024 / 1024).toFixed(2), 'MB');

      if (snapshot.groundTruth) {
        console.log('\n=== Ground Truth (Oracle Extracted) ===');
        console.log(JSON.stringify(snapshot.groundTruth, null, 2));
      } else {
        console.log('\nNo ground truth data yet.');
      }

      console.log('\n=== Logs ===');
      snapshot.logs.forEach(log => {
        console.log(`[${log.phase}] ${log.level}: ${log.msg}`);
      });
    } catch (error) {
      console.error('Error parsing response:', error.message);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
});

req.end();
