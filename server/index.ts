import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { seedDatabase } from "./seed";
import { ivsService } from "./ivsService.js";
import { storage } from "./storage.js";
import { initializeStageManager } from "./stageManager.js";

// Initialize stage manager with both ivsService and storage
initializeStageManager(ivsService, storage);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Middleware to ensure all API responses have JSON Content-Type
app.use('/api', (req, res, next) => {
  // Set default JSON Content-Type for all API responses
  res.set('Content-Type', 'application/json');
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    // Seed database with sample data (only if database is empty)
    await seedDatabase();
    
    const server = await registerRoutes(app);


    // Enhanced error handling middleware - ensures JSON-only responses
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      // Log the error for debugging
      console.error(`Error ${status}:`, err.message);
      if (status === 500) {
        console.error(err.stack);
      }

      // Ensure response is always JSON with proper Content-Type
      res.set('Content-Type', 'application/json');
      res.status(status).json({ 
        ok: false, 
        reason: message,
        error: message,
        status
      });
      // Do NOT throw the error - this would crash the application
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000', 10);
    
    // Log environment variable status on boot
    const awsRegion = process.env.AWS_REGION;
    const ivsStageArn = process.env.IVS_STAGE_ARN;
    console.log(`AWS_REGION= ${awsRegion || 'MISSING'}  IVS_STAGE_ARN set= ${ivsStageArn ? 'true' : 'false'}`);
    
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`serving on port ${port}`);
    });

  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
})().catch((error) => {
  console.error("Unhandled promise rejection during server startup:", error);
  process.exit(1);
});

// Handle uncaught exceptions and unhandled promise rejections
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
