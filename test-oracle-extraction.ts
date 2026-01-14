/**
 * Test Oracle extraction with compression and token counting
 *
 * This script:
 * 1. Generates a large HTML document (~5MB)
 * 2. Creates a snapshot
 * 3. Creates an Oracle extraction task
 * 4. Monitors logs for compression and token counting
 */

import { aiService } from './src/backend/services/aiService';

// Generate a large realistic EHR HTML document
function generateLargeEHRHTML(targetSizeMB: number = 5): string {
  const targetSize = targetSizeMB * 1024 * 1024;
  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>EHR Patient Portal - Demo Health System</title>
  <style>
    /* Large CSS block */
    .patient-info { color: blue; font-size: 14px; }
    .diagnosis { background: yellow; }
    /* ... hundreds more rules ... */
  </style>
  <script>
    // Large JavaScript block
    function validateForm() {
      console.log("Validating...");
    }
  </script>
</head>
<body>
  <div class="header">
    <h1>Patient Portal</h1>
  </div>

  <div class="patient-demographics" data-testid="patient-info">
    <h2>Patient Information</h2>
    <div class="patient-name">
      <label>Name:</label>
      <input type="text" name="fullName" value="Marsh, Lola TEST" aria-label="Patient full name">
    </div>
    <div class="patient-dob">
      <label>Date of Birth:</label>
      <input type="text" name="dateOfBirth" value="05/15/1985" aria-label="Date of birth">
    </div>
    <div class="patient-mrn">
      <label>MRN:</label>
      <input type="text" name="mrn" value="MRN-123456" aria-label="Medical record number">
    </div>
  </div>

  <!-- Nested iframe content (simulating EHR iframe) -->
  <div data-iframe-content="&lt;div class=&quot;nested-patient-data&quot;&gt;&lt;p&gt;Additional patient information from iframe&lt;/p&gt;&lt;div class=&quot;insurance&quot;&gt;Insurance: Blue Cross&lt;/div&gt;&lt;/div&gt;">
  </div>

  <!-- Shadow DOM content -->
  <div data-shadow-root="&lt;div class=&quot;shadow-demographics&quot;&gt;&lt;span&gt;Primary Care: Dr. Smith&lt;/span&gt;&lt;/div&gt;">
  </div>
`;

  // Add many records to reach target size
  const recordTemplate = `
  <div class="medical-record">
    <h3>Visit Record #{{INDEX}}</h3>
    <div class="visit-details">
      <p><strong>Date:</strong> {{DATE}}</p>
      <p><strong>Chief Complaint:</strong> Patient presents with symptoms including headache, fatigue, and general malaise.</p>
      <p><strong>Assessment:</strong> After thorough examination and review of vital signs, the patient appears to be experiencing symptoms consistent with viral infection. Temperature elevated at 101.2°F, blood pressure 120/80, pulse 78 bpm.</p>
      <p><strong>Plan:</strong> Rest, hydration, over-the-counter fever reducer as needed. Follow up in 3-5 days if symptoms persist or worsen. Patient educated on warning signs requiring immediate medical attention.</p>
      <div class="medications">
        <ul>
          <li>Acetaminophen 500mg - Take 1-2 tablets every 4-6 hours as needed for fever or pain</li>
          <li>Ibuprofen 200mg - Alternative to acetaminophen, take 1-2 tablets every 6-8 hours</li>
        </ul>
      </div>
      <div class="lab-results">
        <table>
          <tr><td>Test Name</td><td>Value</td><td>Reference Range</td></tr>
          <tr><td>WBC</td><td>7.5 K/uL</td><td>4.5-11.0 K/uL</td></tr>
          <tr><td>RBC</td><td>4.8 M/uL</td><td>4.2-5.9 M/uL</td></tr>
          <tr><td>Hemoglobin</td><td>14.2 g/dL</td><td>13.5-17.5 g/dL</td></tr>
          <tr><td>Hematocrit</td><td>42%</td><td>38-51%</td></tr>
        </table>
      </div>
    </div>
    <div class="filler-content">
      <!-- Adding filler to increase size -->
      ${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50)}
    </div>
  </div>
`;

  let currentSize = Buffer.byteLength(html, 'utf-8');
  let index = 1;

  while (currentSize < targetSize) {
    const date = new Date(2025, 0, index % 31 + 1).toLocaleDateString();
    const record = recordTemplate
      .replace('{{INDEX}}', index.toString())
      .replace('{{DATE}}', date);

    html += record;
    currentSize = Buffer.byteLength(html, 'utf-8');
    index++;
  }

  html += `
</body>
</html>`;

  return html;
}

async function testOracleExtraction() {
  console.log('\n=== Oracle Extraction Test with Compression ===\n');

  // Generate large HTML
  console.log('Generating large EHR HTML...');
  const html = generateLargeEHRHTML(5);
  const sizeMB = (Buffer.byteLength(html, 'utf-8') / 1024 / 1024).toFixed(2);
  console.log(`✓ Generated HTML: ${sizeMB}MB\n`);

  // Test extraction
  console.log('Testing Oracle extraction...');
  console.log('Watch for these logs:');
  console.log('  - [HTMLCompressor] Compression ratio');
  console.log('  - [AIService] Token count');
  console.log('  - [AIService] Token estimation (if sampling used)');
  console.log('  - [AIService] Final HTML size for AI\n');

  const fields = ['firstName', 'lastName', 'middleName', 'fullName', 'dateOfBirth', 'mrn'];

  try {
    const result = await aiService.extractFromHTML(html, fields);

    console.log('\n=== Extraction Result ===');
    console.log(`Success: ${result.success}`);
    if (result.success) {
      console.log('Extracted Data:', JSON.stringify(result.extractedData, null, 2));
      console.log(`Confidence: ${result.confidence}`);
    } else {
      console.log('Error:', result.error);
    }
  } catch (error) {
    console.error('\n✗ Extraction failed:', error);
  }

  console.log('\n=== Test Complete ===\n');
  process.exit(0);
}

// Run test
testOracleExtraction().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
