#!/usr/bin/env node
/**
 * Quick script to check latest snapshots without using curl
 */

const http = require('http');

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/snapshots?limit=1',
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
      const snapshots = JSON.parse(data);
      if (snapshots.length > 0) {
        const latest = snapshots[0];
        console.log('Latest Snapshot:');
        console.log('  ID:', latest._id);
        console.log('  Source URL:', latest.sourceUrl || 'N/A');
        console.log('  Status:', latest.status);
        console.log('  Created:', latest.createdAt);
        console.log('  HTML Size:', latest.htmlBlob ? (latest.htmlBlob.length / 1024 / 1024).toFixed(2) + ' MB' : 'N/A');
        console.log('  Has Ground Truth:', !!latest.groundTruth);
        console.log('  Has Extractor Code:', !!latest.extractorCode);
        console.log('  Logs:', latest.logs ? latest.logs.length : 0);

        if (latest.metadata) {
          console.log('\nMetadata:');
          console.log(JSON.stringify(latest.metadata, null, 2));
        }

        if (latest.groundTruth) {
          console.log('\nGround Truth (Oracle Extracted):');
          console.log(JSON.stringify(latest.groundTruth, null, 2));
        }

        // Check if "marsh" or "lola" is in the HTML
        if (latest.htmlBlob) {
          const htmlLower = latest.htmlBlob.toLowerCase();
          const hasMarsh = htmlLower.includes('marsh');
          const hasLola = htmlLower.includes('lola');
          console.log('\nPatient Data Check:');
          console.log('  Contains "marsh":', hasMarsh);
          console.log('  Contains "lola":', hasLola);

          if (hasMarsh || hasLola) {
            // Find context around "marsh"
            const marshIndex = htmlLower.indexOf('marsh');
            if (marshIndex >= 0) {
              const contextStart = Math.max(0, marshIndex - 100);
              const contextEnd = Math.min(latest.htmlBlob.length, marshIndex + 100);
              console.log('\n  Context around "marsh":');
              console.log('  ...', latest.htmlBlob.substring(contextStart, contextEnd), '...');
            }
          }
        }

        // Show recent logs
        if (latest.logs && latest.logs.length > 0) {
          console.log('\nRecent Logs:');
          latest.logs.slice(-5).forEach(log => {
            console.log(`  [${log.phase}] ${log.level}: ${log.msg}`);
          });
        }
      } else {
        console.log('No snapshots found');
      }
    } catch (error) {
      console.error('Error parsing response:', error.message);
      console.log('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
  console.log('Is the backend server running on port 3000?');
});

req.end();
