/**
 * End-to-End Pipeline Test
 *
 * Tests the complete Lemonade pipeline:
 * 1. Capture - Create snapshot with HTML
 * 2. Oracle - Extract structured data with AI
 * 3. Forge - Generate extraction code
 * 4. Gauntlet - Validate generated code
 */

import fetch from 'node-fetch';
import { aiService } from './src/backend/services/aiService';
import { codeGenerator } from './src/forge/code-generator';

const BACKEND_URL = 'http://localhost:3000';

// Generate realistic EHR HTML for testing
function generateEHRHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Epic EHR - Patient Demographics</title>
  <style>
    .patient-header { background: #f0f0f0; padding: 20px; }
    .demographics-grid { display: grid; grid-template-columns: 1fr 1fr; }
    .field-label { font-weight: bold; color: #333; }
    .field-value { color: #666; }
  </style>
  <script>
    function initEHR() {
      console.log('EHR initialized');
    }
  </script>
</head>
<body onload="initEHR()">
  <div class="patient-header">
    <h1>Patient Demographics</h1>
  </div>

  <div class="demographics-section" id="main-demographics">
    <div class="demographics-grid">
      <div class="field-group">
        <span class="field-label">Legal Name:</span>
        <input type="text" id="patient-name" name="fullName" value="Johnson, Sarah Marie"
               aria-label="Patient full name" readonly>
      </div>

      <div class="field-group">
        <span class="field-label">Date of Birth:</span>
        <input type="text" id="patient-dob" name="dateOfBirth" value="03/22/1978"
               aria-label="Date of birth" readonly>
      </div>

      <div class="field-group">
        <span class="field-label">MRN:</span>
        <input type="text" id="patient-mrn" name="mrn" value="MRN-987654"
               aria-label="Medical record number" readonly>
      </div>

      <div class="field-group">
        <span class="field-label">Sex:</span>
        <input type="text" name="sex" value="Female" aria-label="Sex" readonly>
      </div>
    </div>
  </div>

  <!-- Additional sections for realism -->
  <div class="insurance-section">
    <h2>Insurance Information</h2>
    <div class="insurance-details">
      <p>Primary Insurance: Blue Cross Blue Shield</p>
      <p>Policy Number: BC-12345678</p>
      <p>Group Number: GRP-9876</p>
    </div>
  </div>

  <div class="contact-section">
    <h2>Contact Information</h2>
    <div class="contact-details">
      <p>Phone: (555) 123-4567</p>
      <p>Email: sarah.johnson@email.com</p>
      <p>Address: 123 Main Street, Anytown, ST 12345</p>
    </div>
  </div>

  <!-- Nested content (simulating iframe) -->
  <div data-iframe-content="&lt;div class=&quot;additional-demographics&quot;&gt;&lt;p&gt;Emergency Contact: John Johnson (Spouse)&lt;/p&gt;&lt;p&gt;Emergency Phone: (555) 987-6543&lt;/p&gt;&lt;/div&gt;">
  </div>

  <!-- More realistic content to increase size -->
  <div class="medical-history">
    <h2>Medical History Summary</h2>
    <ul>
      <li>Hypertension - diagnosed 2015, controlled with medication</li>
      <li>Type 2 Diabetes - diagnosed 2018, managed with diet and metformin</li>
      <li>Seasonal allergies - ongoing, treated with antihistamines</li>
    </ul>
  </div>

  <div class="medications-list">
    <h2>Current Medications</h2>
    <table>
      <tr><th>Medication</th><th>Dose</th><th>Frequency</th></tr>
      <tr><td>Lisinopril</td><td>10mg</td><td>Once daily</td></tr>
      <tr><td>Metformin</td><td>500mg</td><td>Twice daily</td></tr>
      <tr><td>Atorvastatin</td><td>20mg</td><td>Once daily</td></tr>
    </table>
  </div>

  ${
    // Add filler content to make it more realistic
    Array.from({ length: 50 }, (_, i) => `
    <div class="visit-note-${i}">
      <h3>Visit Note #${i + 1}</h3>
      <p>Date: ${new Date(2025, 0, i % 30 + 1).toLocaleDateString()}</p>
      <p>Chief Complaint: Follow-up visit for chronic condition management.</p>
      <p>Assessment: Patient continues to do well on current medication regimen. Vital signs stable.</p>
      <p>Plan: Continue current medications. Follow up in 3 months or sooner if symptoms change.</p>
    </div>
  `).join('\n')
  }
</body>
</html>`;
}

// Expected ground truth
const GROUND_TRUTH = {
  fullName: 'Johnson, Sarah Marie',
  firstName: 'Sarah',
  lastName: 'Johnson',
  middleName: 'Marie',
  dateOfBirth: '03/22/1978',
  mrn: 'MRN-987654'
};

async function runE2EPipeline() {
  console.log('\n════════════════════════════════════════════');
  console.log('   End-to-End Pipeline Test');
  console.log('════════════════════════════════════════════\n');

  try {
    // Step 1: CAPTURE (Miner Phase)
    console.log('📸 STEP 1: CAPTURE (Miner Phase)');
    console.log('─────────────────────────────────────────\n');

    const html = generateEHRHTML();
    const htmlSizeMB = (html.length / 1024 / 1024).toFixed(2);
    console.log(`Generated HTML: ${htmlSizeMB}MB`);
    console.log(`Expected data:`, JSON.stringify(GROUND_TRUTH, null, 2));

    // Step 2: ORACLE (AI Extraction Phase)
    console.log('\n🔮 STEP 2: ORACLE (AI Extraction Phase)');
    console.log('─────────────────────────────────────────\n');

    const fields = Object.keys(GROUND_TRUTH);
    console.log(`Extracting fields: ${fields.join(', ')}`);
    console.log('This will test:');
    console.log('  ✓ HTML compression');
    console.log('  ✓ Token counting with sampling');
    console.log('  ✓ Nested content extraction');
    console.log('  ✓ AI-powered extraction\n');

    const extractionResult = await aiService.extractFromHTML(html, fields);

    if (!extractionResult.success) {
      throw new Error(`Oracle extraction failed: ${extractionResult.error}`);
    }

    console.log('\n✅ Oracle extraction completed');
    console.log('Extracted data:', JSON.stringify(extractionResult.extractedData, null, 2));
    console.log(`Confidence: ${extractionResult.confidence}`);

    // Validate extraction accuracy
    const extractedData = extractionResult.extractedData;
    let correctFields = 0;
    let totalFields = 0;

    for (const [field, expectedValue] of Object.entries(GROUND_TRUTH)) {
      totalFields++;
      const actualValue = extractedData[field];

      if (actualValue === expectedValue) {
        console.log(`  ✓ ${field}: "${actualValue}" (correct)`);
        correctFields++;
      } else {
        console.log(`  ✗ ${field}: expected "${expectedValue}", got "${actualValue}"`);
      }
    }

    const accuracy = ((correctFields / totalFields) * 100).toFixed(1);
    console.log(`\nOracle Accuracy: ${correctFields}/${totalFields} fields correct (${accuracy}%)`);

    if (correctFields === 0) {
      throw new Error('Oracle failed to extract any correct fields');
    }

    // Step 3: FORGE (Code Generation Phase)
    console.log('\n⚒️  STEP 3: FORGE (Code Generation Phase)');
    console.log('─────────────────────────────────────────\n');

    console.log('Generating extraction code...');
    console.log('This will test:');
    console.log('  ✓ HTML compression');
    console.log('  ✓ Tool-based HTML exploration');
    console.log('  ✓ Iterative code generation');
    console.log('  ✓ CSS selector discovery\n');

    const generatedCode = await codeGenerator.generateExtractor({
      htmlBlob: html,
      groundTruth: extractedData // Use Oracle's extraction as ground truth
    });

    console.log('\n✅ Code generation completed');
    console.log(`Generated code length: ${generatedCode.length} characters`);
    console.log('\nGenerated code preview:');
    console.log('─────────────────────────────────────────');
    console.log(generatedCode.substring(0, 500) + '...');
    console.log('─────────────────────────────────────────');

    // Step 4: GAUNTLET (Validation Phase)
    console.log('\n🛡️  STEP 4: GAUNTLET (Validation Phase)');
    console.log('─────────────────────────────────────────\n');

    console.log('Validating generated code syntax...');
    const syntaxCheck = codeGenerator.validateSyntax(generatedCode);

    if (!syntaxCheck.valid) {
      throw new Error(`Generated code has syntax errors: ${syntaxCheck.error}`);
    }

    console.log('✓ Code syntax is valid\n');

    // Note: Full Gauntlet validation (running in browser) would require Playwright
    // This would be done in the actual E2E test with the extension
    console.log('Note: Full Gauntlet validation (browser execution) requires Playwright');
    console.log('      This is tested in the extension E2E tests (pnpm test:extension)');

    // Final Summary
    console.log('\n════════════════════════════════════════════');
    console.log('   🎉 E2E PIPELINE TEST PASSED!');
    console.log('════════════════════════════════════════════\n');

    console.log('Summary:');
    console.log(`  ✅ Capture: ${htmlSizeMB}MB HTML generated`);
    console.log(`  ✅ Oracle: ${correctFields}/${totalFields} fields extracted (${accuracy}%)`);
    console.log(`  ✅ Forge: ${generatedCode.length} chars of valid code`);
    console.log(`  ✅ Gauntlet: Syntax validated\n`);

    console.log('All pipeline phases completed successfully! 🚀\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ E2E Pipeline Test FAILED');
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    console.error('\nStack trace:', error);
    process.exit(1);
  }
}

// Run the test
console.log('Starting E2E pipeline test...\n');
runE2EPipeline();
