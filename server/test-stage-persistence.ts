import { initializeStageManager } from './stageManager';
import { storage } from './storage';
import { IVSService } from './ivsService';

/**
 * Stage Persistence Test
 * Verifies that StageManager correctly retrieves persisted Stage ARNs from database
 * after simulated server restart, avoiding duplicate IVS Stage creation.
 */

const TEST_EVENT_ID = '88dee0e4-971c-4a47-8848-178b19df9563'; // Wimbledon Women's Final
const TEST_HOST_ID = '10ec3e06-2c35-4243-9593-fa1245f06214'; // ChrisV
const TEST_HOST_NAME = 'Test Host';
const EXPECTED_STAGE_KEY = `${TEST_EVENT_ID}_${TEST_HOST_ID}`;

async function runPersistenceTest() {
  console.log('\n=== STAGE PERSISTENCE TEST ===\n');
  console.log('Test Parameters:');
  console.log(`  Event ID: ${TEST_EVENT_ID}`);
  console.log(`  Host ID: ${TEST_HOST_ID}`);
  console.log(`  Expected Stage Key: ${EXPECTED_STAGE_KEY}\n`);

  try {
    // Initialize dependencies
    console.log('Initializing IVS Service and Stage Manager...');
    const ivsService = new IVSService();
    const stageManager = initializeStageManager(ivsService, storage);
    console.log('✓ Initialization complete\n');
    
    // STEP 1: Initial Stream & Persist
    console.log('--- STEP 1: Initial Stream & Persist ---');
    console.log(`Calling stageManager.getOrCreateStage('${TEST_EVENT_ID}', '${TEST_HOST_ID}', '${TEST_HOST_NAME}')...`);
    
    const stage1 = await stageManager.getOrCreateStage(TEST_EVENT_ID, TEST_HOST_ID, TEST_HOST_NAME);
    const OLD_ARN = stage1.stageArn;
    
    console.log(`✓ Returned Stage ARN: ${OLD_ARN}`);
    console.log(`  Stage Key: ${stage1.stageKey}`);
    console.log(`  Stored as: $OLD_ARN = ${OLD_ARN}\n`);

    // Verify in database
    console.log('Validating database persistence...');
    const dbStage = await storage.getStageByKey(EXPECTED_STAGE_KEY);
    
    if (!dbStage) {
      console.error('✗ FAILED: Stage not found in database!');
      return;
    }
    
    if (dbStage.stageArn !== OLD_ARN) {
      console.error(`✗ FAILED: Database ARN mismatch!`);
      console.error(`  Expected: ${OLD_ARN}`);
      console.error(`  Got: ${dbStage.stageArn}`);
      return;
    }
    
    console.log(`✓ Database verification passed`);
    console.log(`  DB Record ID: ${dbStage.id}`);
    console.log(`  DB Stage ARN: ${dbStage.stageArn}`);
    console.log(`  DB Event ID: ${dbStage.eventId}`);
    console.log(`  DB Host ID: ${dbStage.hostUserId}\n`);

    // STEP 2: Simulate Server Restart
    console.log('--- STEP 2: Simulate Server Restart ---');
    console.log('Clearing in-memory StageManager cache...');
    
    // Access the private cache and clear it to simulate server restart
    try {
      const cache = (stageManager as any).stageCache;
      if (cache && typeof cache.clear === 'function') {
        cache.clear();
        console.log('✓ In-memory StageManager cache cleared (simulated restart)\n');
      } else {
        console.log('Note: Unable to access cache directly, but proceeding with test\n');
      }
    } catch (e) {
      console.log('Note: Cache clearing not available, but proceeding with test\n');
    }

    // STEP 3: Reconnect & Retrieve
    console.log('--- STEP 3: Reconnect & Retrieve ---');
    console.log(`Calling stageManager.getOrCreateStage('${TEST_EVENT_ID}', '${TEST_HOST_ID}', '${TEST_HOST_NAME}') again...`);
    console.log('EXPECTED: Should retrieve from database, NOT create new IVS Stage\n');
    
    const stage2 = await stageManager.getOrCreateStage(TEST_EVENT_ID, TEST_HOST_ID, TEST_HOST_NAME);
    const NEW_ARN = stage2.stageArn;
    
    console.log(`✓ Returned Stage ARN: ${NEW_ARN}`);
    console.log(`  Stage Key: ${stage2.stageKey}\n`);

    // STEP 4: Final Validation
    console.log('--- STEP 4: Final Validation ---');
    console.log('Comparing ARNs:');
    console.log(`  $OLD_ARN (Step 1): ${OLD_ARN}`);
    console.log(`  NEW_ARN (Step 3):  ${NEW_ARN}`);
    
    if (OLD_ARN === NEW_ARN) {
      console.log('\n✓✓✓ TEST PASSED ✓✓✓');
      console.log('Stage ARNs are IDENTICAL - persistence and recovery successful!');
      console.log('The StageManager correctly retrieved the persisted Stage from the database');
      console.log('instead of creating a duplicate IVS Stage.\n');
    } else {
      console.log('\n✗✗✗ TEST FAILED ✗✗✗');
      console.log('Stage ARNs are DIFFERENT - this indicates a new Stage was created');
      console.log('when it should have been retrieved from the database.\n');
    }

    // Cleanup
    console.log('--- Cleanup ---');
    console.log(`Removing test stage: ${EXPECTED_STAGE_KEY}...`);
    await stageManager.removeStage(EXPECTED_STAGE_KEY);
    console.log('✓ Test stage removed\n');

  } catch (error) {
    console.error('\n✗✗✗ TEST ERROR ✗✗✗');
    console.error('An error occurred during the test:');
    console.error(error);
  }
}

// Run the test
runPersistenceTest()
  .then(() => {
    console.log('=== TEST COMPLETE ===\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error running test:', error);
    process.exit(1);
  });
