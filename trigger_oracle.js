#!/usr/bin/env node
/**
 * Trigger Oracle extraction for a snapshot
 */

const http = require('http');

const SNAPSHOT_ID = process.argv[2] || '6964b9253cdcfc8bdd4b7390';

function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: responseData ? JSON.parse(responseData) : null
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            data: responseData
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function main() {
  try {
    console.log('🚀 Triggering Oracle extraction for Athena Health snapshot...\n');

    // Step 1: Start the worker
    console.log('1. Starting AI worker...');
    const startWorker = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/worker/start',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('   Worker status:', startWorker.data);

    // Step 2: Create extraction task
    console.log('\n2. Creating extraction task...');
    const createTask = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/ai-tasks',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, {
      taskType: 'EXTRACT',
      targetType: 'SNAPSHOT',
      targetId: SNAPSHOT_ID,
      priority: 'HIGH',
      aiModel: 'gemini-2.5-flash'
    });

    console.log('   Task created:', createTask.data);
    const taskId = createTask.data.id || createTask.data._id;

    if (!taskId) {
      console.error('   ❌ Failed to create task:', createTask.data);
      return;
    }

    // Step 3: Monitor task progress
    console.log('\n3. Monitoring task progress...');
    console.log('   Task ID:', taskId);

    let attempts = 0;
    const maxAttempts = 60; // 5 minutes with 5 second intervals

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

      const taskStatus = await makeRequest({
        hostname: 'localhost',
        port: 3000,
        path: `/api/ai-tasks/${taskId}`,
        method: 'GET'
      });

      const task = taskStatus.data;
      console.log(`   [${attempts + 1}/${maxAttempts}] Status: ${task.status}`);

      if (task.status === 'COMPLETED') {
        console.log('\n✅ Extraction completed!');
        console.log('\nExtracted Data:');
        console.log(JSON.stringify(task.output, null, 2));

        // Get updated snapshot
        const snapshot = await makeRequest({
          hostname: 'localhost',
          port: 3000,
          path: `/api/snapshots/${SNAPSHOT_ID}`,
          method: 'GET'
        });

        console.log('\nSnapshot Status:', snapshot.data.status);
        if (snapshot.data.groundTruth) {
          console.log('\nGround Truth:');
          console.log(JSON.stringify(snapshot.data.groundTruth, null, 2));
        }

        break;
      } else if (task.status === 'FAILED') {
        console.log('\n❌ Extraction failed!');
        console.log('Error:', task.error);
        if (task.logs && task.logs.length > 0) {
          console.log('\nTask Logs:');
          task.logs.forEach(log => {
            console.log(`  [${log.level}] ${log.message}`);
          });
        }
        break;
      } else if (task.status === 'PROCESSING') {
        console.log('   ⏳ Processing...');
      }

      attempts++;
    }

    if (attempts >= maxAttempts) {
      console.log('\n⚠️  Timeout: Task did not complete within 5 minutes');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\nIs the backend server running on port 3000?');
  }
}

main();
