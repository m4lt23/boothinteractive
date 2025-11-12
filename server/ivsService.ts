import { IvsClient, CreateChannelCommand, GetChannelCommand, GetStreamCommand, ListStreamsCommand, DeleteChannelCommand } from "@aws-sdk/client-ivs";
import { IVSRealTimeClient, CreateParticipantTokenCommand, CreateParticipantTokenCommandInput, CreateStageCommand, GetStageCommand as GetRealTimeStageCommand, DeleteStageCommand } from "@aws-sdk/client-ivs-realtime";

// IVS service for managing Amazon IVS channels and streams
export class IVSService {
  private client: IvsClient;
  private realtimeClient: IVSRealTimeClient;

  constructor() {
    // Initialize AWS IVS client with credentials from environment variables
    // Force us-east-1 region for IVS since it's not available in all regions (e.g., ca-central-1)
    const ivsRegion = "us-east-1"; // AWS IVS is only available in specific regions
    
    this.client = new IvsClient({
      region: ivsRegion,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });

    this.realtimeClient = new IVSRealTimeClient({
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
      },
    });
  }

  // Create a new IVS channel for a caster
  async createChannel(name: string, userId: string) {
    try {
      const command = new CreateChannelCommand({
        name: `booth-${userId}-${Date.now()}`,
        latencyMode: "LOW", // For real-time audio streaming
        type: "STANDARD", // Standard channel type
        tags: {
          service: "BOOTH",
          userId: userId,
          userFriendlyName: name,
        },
      });

      const result = await this.client.send(command);
      
      if (!result.channel || !result.streamKey) {
        throw new Error("Failed to create IVS channel");
      }

      return {
        channelArn: result.channel.arn!,
        streamKey: result.streamKey.value!,
        playbackUrl: result.channel.playbackUrl!,
        ingestEndpoint: result.channel.ingestEndpoint!,
      };
    } catch (error) {
      console.error("Error creating IVS channel:", error);
      throw new Error(`Failed to create IVS channel: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // Get channel information
  async getChannel(channelArn: string) {
    try {
      const command = new GetChannelCommand({
        arn: channelArn,
      });

      const result = await this.client.send(command);
      return result.channel;
    } catch (error) {
      console.error("Error getting IVS channel:", error);
      throw new Error(`Failed to get IVS channel: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // Create a new IVS Real-Time Stage for collaborative streaming
  async createStage(name: string, eventId: string, hostUserId: string) {
    try {
      console.log(`[IVS] Creating new Real-Time Stage for event ${eventId}, host ${hostUserId.substring(0, 8)}...`);
      
      const command = new CreateStageCommand({
        name: `booth-stage-${eventId}-${hostUserId}-${Date.now()}`,
        tags: {
          service: "BOOTH",
          eventId: eventId,
          hostUserId: hostUserId,
          createdAt: new Date().toISOString(),
        },
      });

      const result = await this.realtimeClient.send(command);
      
      if (!result.stage?.arn) {
        throw new Error("Failed to create IVS Real-Time Stage - no ARN returned");
      }

      console.log(`[IVS] ✓ Created Real-Time Stage:`, {
        arn: result.stage.arn,
        eventId,
        hostUserId: hostUserId.substring(0, 8) + '...',
      });

      return {
        stageArn: result.stage.arn,
        stageName: result.stage.name || name,
      };
    } catch (error) {
      console.error(`[IVS] Error creating Real-Time Stage for event ${eventId}:`, error);
      throw new Error(`Failed to create IVS Real-Time Stage: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // Get Real-Time Stage information
  async getStage(stageArn: string) {
    try {
      const command = new GetRealTimeStageCommand({
        arn: stageArn,
      });

      const result = await this.realtimeClient.send(command);
      return result.stage;
    } catch (error) {
      console.error("Error getting IVS Real-Time Stage:", error);
      throw new Error(`Failed to get IVS Real-Time Stage: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // Delete a Real-Time Stage (cleanup when stage is stale)
  async deleteStageByArn(stageArn: string): Promise<void> {
    try {
      console.log(`[IVS] Calling DeleteStage for ARN: ${stageArn.substring(stageArn.length - 20)}`);
      
      const command = new DeleteStageCommand({
        arn: stageArn,
      });

      await this.realtimeClient.send(command);
      
      console.log(`[IVS] ✓ Successfully deleted IVS Real-Time Stage: ${stageArn.substring(stageArn.length - 20)}`);
    } catch (error) {
      // If the stage doesn't exist, it's safe to ignore the error
      if ((error as any)?.name === "ResourceNotFoundException") {
        console.log(`[IVS] Stage not found (already deleted): ${stageArn.substring(stageArn.length - 20)}`);
        return;
      }
      
      console.error(`[IVS] Error deleting IVS Real-Time Stage:`, {
        arn: stageArn.substring(stageArn.length - 20),
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(`Failed to delete IVS Real-Time Stage: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // Get current stream status for a channel with enhanced logging and validation
  async getStreamStatus(channelArn: string, options?: { validateConsistency?: boolean; userId?: string }) {
    try {
      const command = new GetStreamCommand({
        channelArn: channelArn,
      });

      console.log(`[IVS] Getting stream status for channel: ${channelArn.split('/').pop()?.substring(0, 8)}...`);
      const result = await this.client.send(command);
      
      const streamStatus = {
        streamId: result.stream?.streamId,
        state: result.stream?.state, // "LIVE", "OFFLINE"
        health: result.stream?.health, // "HEALTHY", "STARVED", "UNKNOWN"
        viewerCount: result.stream?.viewerCount || 0,
        startTime: result.stream?.startTime,
        playbackUrl: result.stream?.playbackUrl,
        channelArn: channelArn, // Include for consistency checking
      };

      console.log(`[IVS] Stream status retrieved:`, {
        channelId: channelArn.split('/').pop()?.substring(0, 8) + '...',
        state: streamStatus.state,
        health: streamStatus.health,
        viewerCount: streamStatus.viewerCount,
        streamId: streamStatus.streamId?.substring(0, 8) + '...' || 'none',
        userId: options?.userId?.substring(0, 8) + '...' || 'unknown'
      });

      return streamStatus;
    } catch (error) {
      // Enhanced error logging with context
      console.error(`[IVS] Error getting stream status for channel ${channelArn.split('/').pop()?.substring(0, 8)}...`, {
        errorName: (error as any)?.name,
        errorCode: (error as any)?.code,
        errorMessage: (error as any)?.message,
        userId: options?.userId?.substring(0, 8) + '...' || 'unknown',
        channelArn: channelArn.split('/').pop()?.substring(0, 8) + '...'
      });

      // If stream is not found or channel is not broadcasting, it means the channel is offline
      if ((error as any)?.name === "ResourceNotFoundException" || (error as any)?.name === "ChannelNotBroadcasting") {
        console.log(`[IVS] Stream not found or not broadcasting (channel offline) for ${channelArn.split('/').pop()?.substring(0, 8)}...`);
        return {
          streamId: null,
          state: "OFFLINE",
          health: "UNKNOWN",
          viewerCount: 0,
          startTime: null,
          playbackUrl: null,
          channelArn: channelArn,
        };
      }
      
      // Re-throw other errors with enhanced context
      throw new Error(`Failed to get stream status: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // List all streams (for monitoring/admin purposes)
  async listStreams() {
    try {
      const command = new ListStreamsCommand({});
      const result = await this.client.send(command);
      return result.streams || [];
    } catch (error) {
      console.error("Error listing streams:", error);
      throw new Error(`Failed to list streams: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // Delete a channel (cleanup when user disables casting)
  async deleteChannel(channelArn: string) {
    try {
      const command = new DeleteChannelCommand({
        arn: channelArn,
      });

      await this.client.send(command);
      return true;
    } catch (error) {
      console.error("Error deleting IVS channel:", error);
      throw new Error(`Failed to delete IVS channel: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  // Validate consistency between channel credentials and stream status
  async validateChannelConsistency(channelArn: string, streamKey: string, ingestEndpoint: string, userId?: string): Promise<{ isValid: boolean; issues: string[] }> {
    const issues: string[] = [];
    
    try {
      console.log(`[IVS] Validating channel consistency for user ${userId?.substring(0, 8)}...`);
      
      // Get channel information to validate endpoints match
      const channelInfo = await this.getChannel(channelArn);
      
      if (!channelInfo) {
        issues.push("Channel not found or inaccessible");
        return { isValid: false, issues };
      }
      
      // Validate ingest endpoint matches the channel
      if (channelInfo.ingestEndpoint !== ingestEndpoint) {
        issues.push(`Ingest endpoint mismatch: expected ${channelInfo.ingestEndpoint}, got ${ingestEndpoint}`);
        console.warn(`[IVS] Ingest endpoint mismatch for user ${userId?.substring(0, 8)}...`, {
          expected: channelInfo.ingestEndpoint,
          actual: ingestEndpoint
        });
      }
      
      // Note: AWS IVS Channel object doesn't have a 'state' property in the current SDK
      // Channel state is managed internally by IVS
      // We can validate other properties instead
      
      // Check if channel has required configuration for broadcasting
      if (!channelInfo.ingestEndpoint || !channelInfo.playbackUrl) {
        issues.push("Channel missing required endpoints");
      }
      
      // Log channel status for debugging
      console.log(`[IVS] Channel validation result:`, {
        userId: userId?.substring(0, 8) + '...' || 'unknown',
        channelId: channelArn.split('/').pop()?.substring(0, 8) + '...',
        hasIngestEndpoint: !!channelInfo.ingestEndpoint,
        hasPlaybackUrl: !!channelInfo.playbackUrl,
        issuesFound: issues.length
      });
      
      return { isValid: issues.length === 0, issues };
      
    } catch (error) {
      console.error(`[IVS] Error validating channel consistency:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: userId?.substring(0, 8) + '...' || 'unknown',
        channelId: channelArn.split('/').pop()?.substring(0, 8) + '...'
      });
      
      issues.push(`Validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { isValid: false, issues };
    }
  }

  // Check if streaming credentials need to be refreshed
  async shouldRefreshCredentials(channelArn: string, userId?: string): Promise<boolean> {
    try {
      // Check channel health
      const streamStatus = await this.getStreamStatus(channelArn, { userId });
      
      // If channel has been offline for a while and we expect it to be live, might need refresh
      if (streamStatus.state === "OFFLINE" && streamStatus.health === "UNKNOWN") {
        console.log(`[IVS] Channel appears to need credential refresh for user ${userId?.substring(0, 8)}...`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`[IVS] Error checking if credentials need refresh:`, error);
      // If we can't check status, assume refresh might help
      return true;
    }
  }

  // Create participant token for IVS Realtime Stage
  async createParticipantToken(
    stageArn: string, 
    sessionId: string, 
    userId: string,
    role: 'listener' | 'cohost' = 'cohost'
  ): Promise<{ participantToken: string }> {
    try {
      if (!stageArn) {
        throw new Error('stageArn parameter is required');
      }

      // Set capabilities based on role
      const capabilities = role === 'listener' 
        ? ['SUBSCRIBE'] 
        : ['PUBLISH', 'SUBSCRIBE'];

      const input: CreateParticipantTokenCommandInput = {
        stageArn,
        userId: `${role}-${userId}-${Date.now()}`,
        attributes: {
          eventId: sessionId.split(':')[0],
          role: role,
          sessionId: sessionId,
        },
        capabilities: capabilities as any,
        duration: 3600, // 1 hour TTL
      };

      const command = new CreateParticipantTokenCommand(input);
      const result = await this.realtimeClient.send(command);

      if (!result.participantToken?.token) {
        throw new Error('IVS Realtime returned no participant token');
      }

      console.log(`[IVS] Created ${role} participant token for user: ${userId.substring(0, 8)}... in session: ${sessionId.split(':')[0]}`, {
        stageArn: stageArn.substring(stageArn.length - 20),
        capabilities: capabilities.join(', ')
      });
      
      return {
        participantToken: result.participantToken.token,
      };
    } catch (error) {
      console.error(`[IVS] Error creating participant token:`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: userId.substring(0, 8) + '...',
        sessionId: sessionId.split(':')[0],
        role: role,
        stageArn: stageArn?.substring(stageArn.length - 20) || 'missing'
      });
      throw error;
    }
  }

  // Validate AWS credentials are configured
  isConfigured(): boolean {
    return !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  }
}

// Singleton instance
export const ivsService = new IVSService();

// Note: Stage manager is initialized in server/index.ts after both ivsService and storage are available
// This avoids circular dependency issues