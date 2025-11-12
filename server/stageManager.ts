import { IVSService } from "./ivsService.js";
import { IStorage } from "./storage.js";

// Stage management for unique IVS Stages per host with database persistence
// Key format: eventId_hostUserId
export class StageManager {
  private stages: Map<string, {
    stageArn: string;
    stageName: string;
    eventId: string;
    hostUserId: string;
    createdAt: number;
  }>;
  private ivsService: IVSService;
  private storage: IStorage;

  constructor(ivsService: IVSService, storage: IStorage) {
    this.stages = new Map();
    this.ivsService = ivsService;
    this.storage = storage;
  }

  // Generate composite key for stage identification
  private getStageKey(eventId: string, hostUserId: string): string {
    return `${eventId}_${hostUserId}`;
  }

  // Get or create a stage for a specific host on a specific event
  async getOrCreateStage(eventId: string, hostUserId: string, hostName: string): Promise<{
    stageArn: string;
    stageName: string;
    stageKey: string;
  }> {
    const stageKey = this.getStageKey(eventId, hostUserId);
    
    // Check in-memory cache first
    const cachedStage = this.stages.get(stageKey);
    if (cachedStage) {
      console.log(`[STAGE_MANAGER] Reusing cached stage for ${stageKey}:`, {
        arn: cachedStage.stageArn,
        createdAt: new Date(cachedStage.createdAt).toISOString(),
      });
      
      return {
        stageArn: cachedStage.stageArn,
        stageName: cachedStage.stageName,
        stageKey,
      };
    }

    // Check database for existing stage
    console.log(`[STAGE_MANAGER] Checking database for stage ${stageKey}`);
    const dbStage = await this.storage.getStageByKey(stageKey);
    
    if (dbStage) {
      console.log(`[STAGE_MANAGER] Found existing stage in database for ${stageKey}`);
      
      // Populate cache from database
      this.stages.set(stageKey, {
        stageArn: dbStage.stageArn,
        stageName: `${hostName}-${eventId.substring(0, 8)}`,
        eventId: dbStage.eventId,
        hostUserId: dbStage.hostUserId,
        createdAt: dbStage.createdAt?.getTime() || Date.now(),
      });
      
      return {
        stageArn: dbStage.stageArn,
        stageName: `${hostName}-${eventId.substring(0, 8)}`,
        stageKey,
      };
    }

    // Create new stage in IVS
    console.log(`[STAGE_MANAGER] Creating new stage for ${stageKey}`);
    const { stageArn, stageName } = await this.ivsService.createStage(
      hostName,
      eventId,
      hostUserId
    );

    // Store in database
    await this.storage.createStage({
      stageIdKey: stageKey,
      stageArn,
      eventId,
      hostUserId,
      sessionId: null,
    });

    // Store in cache
    this.stages.set(stageKey, {
      stageArn,
      stageName,
      eventId,
      hostUserId,
      createdAt: Date.now(),
    });

    console.log(`[STAGE_MANAGER] ✓ Created and persisted stage for ${stageKey}:`, {
      arn: stageArn,
      totalStages: this.stages.size,
    });

    return {
      stageArn,
      stageName,
      stageKey,
    };
  }

  // Get stage ARN by composite key
  getStageArn(stageKey: string): string | null {
    const stage = this.stages.get(stageKey);
    return stage?.stageArn || null;
  }

  // Get stage ARN by eventId and hostUserId
  getStageArnByHost(eventId: string, hostUserId: string): string | null {
    const stageKey = this.getStageKey(eventId, hostUserId);
    return this.getStageArn(stageKey);
  }

  // Remove stage from tracking and database (cleanup)
  async removeStage(stageKey: string): Promise<void> {
    // Remove from cache
    const removed = this.stages.delete(stageKey);
    
    // Remove from database
    try {
      await this.storage.deleteStage(stageKey);
      if (removed) {
        console.log(`[STAGE_MANAGER] Removed stage ${stageKey} from cache and database, remaining in cache: ${this.stages.size}`);
      }
    } catch (error) {
      console.error(`[STAGE_MANAGER] Error removing stage ${stageKey} from database:`, error);
    }
  }

  // Get all active stages (for monitoring)
  getAllStages() {
    return Array.from(this.stages.entries()).map(([key, stage]) => ({
      stageKey: key,
      ...stage,
    }));
  }

  // Cleanup old stages (e.g., older than 24 hours)
  async cleanupOldStages(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    const maxAgeHours = maxAgeMs / (60 * 60 * 1000);
    
    // First, clean up stale stages from the database and get their ARNs
    let arnsToDelete: string[] = [];
    try {
      arnsToDelete = await this.storage.deleteStaleStages(maxAgeHours);
      if (arnsToDelete.length > 0) {
        console.log(`[STAGE_MANAGER] Database cleanup: removed ${arnsToDelete.length} stale stage(s)`);
      }
    } catch (error) {
      console.error('[STAGE_MANAGER] Error during database cleanup:', error);
    }

    // Second, delete the IVS Stages from AWS
    if (arnsToDelete.length > 0) {
      console.log(`[STAGE_MANAGER] Deleting ${arnsToDelete.length} IVS Stage(s) from AWS...`);
      let successCount = 0;
      let failCount = 0;
      
      for (const arn of arnsToDelete) {
        try {
          await this.ivsService.deleteStageByArn(arn);
          successCount++;
        } catch (error) {
          failCount++;
          console.error(`[STAGE_MANAGER] Failed to delete IVS Stage ${arn.substring(arn.length - 20)}:`, error);
        }
      }
      
      console.log(`[STAGE_MANAGER] AWS IVS cleanup complete: ${successCount} deleted, ${failCount} failed`);
    }

    // Finally, clean up old stages from in-memory cache
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (const [key, stage] of Array.from(this.stages.entries())) {
      if (now - stage.createdAt > maxAgeMs) {
        keysToRemove.push(key);
      }
    }

    // Remove from cache
    for (const key of keysToRemove) {
      this.stages.delete(key);
    }
    
    if (keysToRemove.length > 0) {
      console.log(`[STAGE_MANAGER] Cache cleanup: removed ${keysToRemove.length} old stage(s) from memory`);
    }
  }
}

// Singleton instance
let stageManagerInstance: StageManager | null = null;

export function initializeStageManager(ivsService: IVSService, storage: IStorage): StageManager {
  if (!stageManagerInstance) {
    stageManagerInstance = new StageManager(ivsService, storage);
    console.log('[STAGE_MANAGER] Initialized stage manager with database persistence');
    
    // Run cleanup every hour
    setInterval(() => {
      stageManagerInstance?.cleanupOldStages();
    }, 60 * 60 * 1000);
  }
  return stageManagerInstance;
}

export function getStageManager(): StageManager {
  if (!stageManagerInstance) {
    throw new Error('StageManager not initialized. Call initializeStageManager first.');
  }
  return stageManagerInstance;
}
