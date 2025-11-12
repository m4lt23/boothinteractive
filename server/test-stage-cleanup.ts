import { storage } from './storage';
import { db } from './db';
import { stages } from '@shared/schema';
import { eq, or } from 'drizzle-orm';

/**
 * Stage Cleanup Test
 * Verifies that the deleteStaleStages method correctly removes stages
 * that are older than the specified duration.
 */

const TEST_EVENT_ID = '8b37ec05-c761-4d9e-a18e-c3dba6d12168'; // AFC Championship Game
const TEST_HOST_ID = '10ec3e06-2c35-4243-9593-fa1245f06214'; // ChrisV

async function runCleanupTest() {
  console.log('\n=== STAGE CLEANUP TEST ===\n');

  try {
    // Step 1: Create a fresh test stage
    const freshStageKey = `${TEST_EVENT_ID}_${TEST_HOST_ID}_fresh`;
    const freshStage = await storage.createStage({
      stageIdKey: freshStageKey,
      stageArn: 'arn:aws:ivs:us-east-1:190028273933:stage/TEST_FRESH',
      eventId: TEST_EVENT_ID,
      hostUserId: TEST_HOST_ID,
      sessionId: null,
    });
    console.log(`✓ Created fresh test stage: ${freshStage.id}`);
    console.log(`  Stage Key: ${freshStageKey}`);
    console.log(`  Created At: ${freshStage.createdAt}`);
    console.log(`  Updated At: ${freshStage.updatedAt}\n`);

    // Step 2: Create an aged test stage by manually updating its timestamp
    const agedStageKey = `${TEST_EVENT_ID}_${TEST_HOST_ID}_aged`;
    const agedStage = await storage.createStage({
      stageIdKey: agedStageKey,
      stageArn: 'arn:aws:ivs:us-east-1:190028273933:stage/TEST_AGED',
      eventId: TEST_EVENT_ID,
      hostUserId: TEST_HOST_ID,
      sessionId: null,
    });
    console.log(`✓ Created aged test stage: ${agedStage.id}`);
    console.log(`  Stage Key: ${agedStageKey}\n`);

    // Manually set the updatedAt timestamp to 25 hours ago
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await db
      .update(stages)
      .set({ updatedAt: twentyFiveHoursAgo })
      .where(eq(stages.id, agedStage.id));
    
    console.log(`✓ Manually aged the test stage to 25 hours old`);
    console.log(`  Aged Updated At: ${twentyFiveHoursAgo.toISOString()}\n`);

    // Step 3: Verify both stages exist before cleanup
    const beforeCleanup = await db
      .select()
      .from(stages)
      .where(or(
        eq(stages.stageIdKey, freshStageKey),
        eq(stages.stageIdKey, agedStageKey)
      ));
    console.log(`--- Before Cleanup ---`);
    console.log(`Total test stages in database: ${beforeCleanup.length}`);
    beforeCleanup.forEach(s => {
      console.log(`  - ${s.stageIdKey}: ${s.updatedAt?.toISOString() || 'N/A'}`);
    });
    console.log();

    // Step 4: Run the cleanup method with 24-hour threshold
    console.log(`--- Running Cleanup (24-hour threshold) ---`);
    const deletedArns = await storage.deleteStaleStages(24);
    console.log(`✓ Cleanup completed\n`);
    
    if (deletedArns.length > 0) {
      console.log(`--- Deleted ARNs ---`);
      console.log(`Returned ${deletedArns.length} ARN(s) for AWS deletion:`);
      deletedArns.forEach(arn => {
        console.log(`  - ${arn}`);
      });
      console.log();
    }

    // Step 5: Verify the results
    console.log(`--- After Cleanup ---`);
    const afterCleanup = await db
      .select()
      .from(stages)
      .where(or(
        eq(stages.stageIdKey, freshStageKey),
        eq(stages.stageIdKey, agedStageKey)
      ));
    console.log(`Total test stages remaining: ${afterCleanup.length}`);
    afterCleanup.forEach(s => {
      console.log(`  - ${s.stageIdKey}: ${s.updatedAt?.toISOString() || 'N/A'}`);
    });
    console.log();

    // Step 6: Validate the test results
    const freshStageExists = afterCleanup.some(s => s.stageIdKey === freshStageKey);
    const agedStageExists = afterCleanup.some(s => s.stageIdKey === agedStageKey);

    console.log('--- Validation ---');
    if (deletedArns.length === 1 && freshStageExists && !agedStageExists) {
      console.log('✓✓✓ TEST PASSED ✓✓✓');
      console.log(`Deleted ARNs count: ${deletedArns.length} (expected: 1)`);
      console.log(`Fresh stage still exists: ${freshStageExists} (expected: true)`);
      console.log(`Aged stage was deleted: ${!agedStageExists} (expected: true)`);
      console.log('\nThe cleanup successfully removed only the aged stage (>24 hours)');
      console.log('while preserving the fresh stage (<24 hours).');
      console.log('The returned ARN would be used to delete the IVS Stage from AWS.\n');
    } else {
      console.log('✗✗✗ TEST FAILED ✗✗✗');
      console.log(`Deleted ARNs count: ${deletedArns.length} (expected: 1)`);
      console.log(`Fresh stage still exists: ${freshStageExists} (expected: true)`);
      console.log(`Aged stage was deleted: ${!agedStageExists} (expected: true)\n`);
    }

    // Cleanup: Remove the remaining test stage
    console.log('--- Cleanup ---');
    if (freshStageExists) {
      await storage.deleteStage(freshStageKey);
      console.log(`✓ Removed fresh test stage: ${freshStageKey}`);
    }
    if (agedStageExists) {
      await storage.deleteStage(agedStageKey);
      console.log(`✓ Removed aged test stage: ${agedStageKey}`);
    }
    console.log();

  } catch (error) {
    console.error('\n✗✗✗ TEST ERROR ✗✗✗');
    console.error('An error occurred during the test:');
    console.error(error);
  }
}

// Run the test
runCleanupTest()
  .then(() => {
    console.log('=== TEST COMPLETE ===\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error running test:', error);
    process.exit(1);
  });
