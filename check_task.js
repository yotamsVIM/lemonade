#!/usr/bin/env node
/**
 * Check AI task by ID
 */

const http = require('http');
const taskId = process.argv[2] || '6964d4eed6ae30e423100dc3';

const options = {
  hostname: 'localhost',
  port: 3000,
  path: `/api/ai-tasks/${taskId}`,
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
      const task = JSON.parse(data);
      console.log('Task ID:', task._id);
      console.log('Task Type:', task.taskType);
      console.log('Target:', task.targetType, task.targetId);
      console.log('Status:', task.status);
      console.log('Created:', task.createdAt);
      console.log('Started:', task.startedAt);
      console.log('Completed:', task.completedAt);
      console.log('Error:', task.error || 'None');

      if (task.output) {
        console.log('\n=== Task Output ===');
        console.log(JSON.stringify(task.output, null, 2));
      }

      console.log('\n=== Task Logs ===');
      task.logs.forEach(log => {
        console.log(`[${log.level}] ${log.message}`);
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
