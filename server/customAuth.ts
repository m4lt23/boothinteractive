import * as crypto from "crypto";
import { Strategy as LocalStrategy } from "passport-local";
import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { insertAuthUserSchema, PublicUser, User } from "@shared/schema";
import { z } from "zod";

// Helper function to safely convert User to PublicUser (removes sensitive fields)
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    screenname: user.screenname,
    profileImageUrl: user.profileImageUrl,
    role: user.role,
    canCast: user.canCast,
    requiresOnboarding: user.requiresOnboarding,
    bio: user.bio,
    socialLinks: user.socialLinks,
    ivsPlaybackUrl: user.ivsPlaybackUrl,
    agreedToTerms: user.agreedToTerms,
    termsAcceptedAt: user.termsAcceptedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// Password hashing utilities using Node.js built-in scrypt
export async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(32).toString('hex');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

export async function comparePasswords(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(':');
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      // Use timing-safe comparison to prevent timing attacks
      const keyBuffer = Buffer.from(key, 'hex');
      const derivedBuffer = derivedKey;
      
      // Ensure buffers are same length for timing-safe comparison
      if (keyBuffer.length !== derivedBuffer.length) {
        resolve(false);
        return;
      }
      
      resolve(crypto.timingSafeEqual(keyBuffer, derivedBuffer));
    });
  });
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  
  // Use a development secret for demo - in production this would be a secure secret
  const sessionSecret = process.env.SESSION_SECRET || "sports-cast-demo-secret-key-for-development";
  
  return session({
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Secure in production
      sameSite: 'lax', // CSRF protection
      maxAge: sessionTtl,
    },
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Rate limiting for auth endpoints
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: {
      message: "Too many authentication attempts, please try again later.",
      type: "rate_limit_exceeded"
    },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Local strategy for email/password authentication
  passport.use(new LocalStrategy(
    {
      usernameField: 'email',
      passwordField: 'password'
    },
    async (email: string, password: string, done) => {
      try {
        const user = await storage.getUserByEmail(email);
        if (!user) {
          return done(null, false, { message: 'Invalid email or password' });
        }

        const isValidPassword = await comparePasswords(password, user.password);
        if (!isValidPassword) {
          return done(null, false, { message: 'Invalid email or password' });
        }

        // Return full user (will be serialized to ID only)
        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  ));

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }

      // Return only safe user data (PublicUser)
      const publicUser = toPublicUser(user);
      done(null, publicUser);
    } catch (error) {
      done(error);
    }
  });

  // Authentication routes
  app.post('/api/register', authRateLimit, async (req, res) => {
    try {
      // Validate request body
      const validatedData = insertAuthUserSchema.parse(req.body);
      
      // Hash password
      const hashedPassword = await hashPassword(validatedData.password);

      // Create user (termsAcceptedAt timestamp is added in storage.createUser)
      const newUser = await storage.createUser({
        ...validatedData,
        password: hashedPassword,
      });
      
      // Log the user in with session regeneration for security
      req.session.regenerate((sessionErr) => {
        if (sessionErr) {
          console.error("Session regeneration error during registration:", sessionErr);
          return res.status(500).json({ message: "Registration successful but login failed" });
        }
        
        req.login(newUser, (err) => {
          if (err) {
            console.error("Error logging in new user:", err);
            return res.status(500).json({ message: "Registration successful but login failed" });
          }
          // Convert to safe PublicUser for response
          const publicUser = toPublicUser(newUser);
          res.status(201).json({ message: "Registration successful", user: publicUser });
        });
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid input", 
          errors: error.errors.map(e => e.message),
          type: "validation_error"
        });
      }
      
      // Handle database unique constraint violations
      if (error && typeof error === 'object' && 'code' in error) {
        const dbError = error as any;
        if (dbError.code === '23505') {
          return res.status(409).json({ 
            message: "Email or screen name already exists", 
            type: "uniqueness_conflict"
          });
        }
      }
      
      console.error("Registration error:", error);
      res.status(500).json({ message: "Failed to register user" });
    }
  });

  app.post('/api/login', authRateLimit, (req, res, next) => {
    passport.authenticate('local', (err: any, user: User | false, info: any) => {
      if (err) {
        console.error("Login error:", err);
        return res.status(500).json({ message: "Internal server error" });
      }
      
      if (!user) {
        return res.status(401).json({ 
          message: info?.message || "Invalid email or password" 
        });
      }
      
      // Regenerate session to prevent session fixation attacks
      req.session.regenerate((sessionErr) => {
        if (sessionErr) {
          console.error("Session regeneration error:", sessionErr);
          return res.status(500).json({ message: "Login failed" });
        }
        
        req.login(user, (err) => {
          if (err) {
            console.error("Session login error:", err);
            return res.status(500).json({ message: "Login failed" });
          }
          
          // Convert to safe PublicUser for response
          const publicUser = toPublicUser(user);
          res.json({ message: "Login successful", user: publicUser });
        });
      });
    })(req, res, next);
  });

  app.post('/api/logout', (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Logout failed" });
      }
      res.json({ message: "Logout successful" });
    });
  });

  app.get('/api/user', isAuthenticated, (req, res) => {
    res.json(req.user);
  });
}

export const isAuthenticated: RequestHandler = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
};