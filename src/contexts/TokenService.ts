import { Preferences } from "@capacitor/preferences";
import { Effect, Either } from "effect";
import { z } from "zod";
import { CacophonyPlugin } from "./CacophonyApi";

/**
 * Schema for validated user data
 */
export const UserSchema = z.object({
  token: z.string(),
  id: z.string(),
  email: z.string().email(),
  expiry: z.string().optional(),
  refreshToken: z.string(),
  prod: z.boolean(),
});

export type User = z.infer<typeof UserSchema>;

/**
 * Schema for JWT token payload after decoding
 */
export interface JwtTokenPayload {
  exp: number;
  iat: number;
  _type: string;
  expiresAt: Date;
  createdAt: Date;
}

/**
 * Possible results from a token refresh operation
 */
export type TokenRefreshResult =
  | { status: "success"; user: User }
  | { status: "retry" }
  | { status: "expired"; message: string }
  | { status: "network-error"; user: User | null; message: string }
  | { status: "error"; message: string };

/**
 * Configuration options for token service
 */
export interface TokenServiceConfig {
  logger: {
    logSuccess: (data: { message: string; details?: string }) => void;
    logWarning: (data: {
      message: string;
      details?: string;
      warn?: boolean;
    }) => void;
    logError: (data: { message: string; error: any; details?: string }) => void;
  };
  bufferTimeMs: number;
  offlineGracePeriodMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

/**
 * TokenService interface defining the core functionality
 */
export interface TokenService {
  refreshToken: (user: User) => Promise<TokenRefreshResult>;
  validateToken: (user: User) => Promise<User | null>;
  saveUser: (user: User) => Promise<void>;
  clearUser: () => Promise<void>;
}

/**
 * Create a token service with dependency injection for easier testing
 */
export function createTokenService(config: TokenServiceConfig): TokenService {
  // Use a Map for a more maintainable solution than global variable
  const refreshOperations = new Map<string, Promise<TokenRefreshResult>>();

  /**
   * Decode JWT token to extract payload
   */
  const decodeJWT = (token: string): JwtTokenPayload | null => {
    try {
      const [, payload] = token.split(".");
      if (!payload) return null;

      const decoded = JSON.parse(atob(payload));
      return {
        ...decoded,
        expiresAt: new Date(decoded.exp * 1000),
        createdAt: new Date(decoded.iat * 1000),
      };
    } catch (error) {
      config.logger.logWarning({
        message: "Failed to decode JWT token",
        details: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  };

  /**
   * Check if token requires refresh based on expiry time
   */
  const isTokenExpiringSoon = (decodedToken: JwtTokenPayload): boolean => {
    const now = new Date();
    return (
      decodedToken.expiresAt.getTime() < now.getTime() + config.bufferTimeMs
    );
  };

  /**
   * Check if token is still valid with grace period for offline mode
   */
  const isTokenValidForOfflineUse = (
    decodedToken: JwtTokenPayload
  ): boolean => {
    const now = new Date();
    return (
      decodedToken.expiresAt.getTime() + config.offlineGracePeriodMs >
      now.getTime()
    );
  };

  /**
   * Perform token refresh operation with retry logic
   */
  const performTokenRefresh = async (
    user: User
  ): Promise<TokenRefreshResult> => {
    try {
      // Use Effect.retry for automatic retries on network failure
      const result = await Effect.runPromise(
        Effect.retry(
          Effect.tryPromise(() =>
            CacophonyPlugin.validateToken({ refreshToken: user.refreshToken })
          ),
          { times: config.maxRetries, delay: config.retryDelayMs }
        )
      );

      if (result.success) {
        const updatedUser: User = {
          ...user,
          token: result.data.token,
          refreshToken: result.data.refreshToken,
          expiry: result.data.expiry,
        };

        await saveUser(updatedUser);

        config.logger.logSuccess({
          message: "Token refreshed successfully",
          details: `New token expires at ${result.data.expiry}`,
        });

        return { status: "success", user: updatedUser };
      }

      if (result.message?.includes("Failed") && navigator.onLine) {
        config.logger.logWarning({
          message: "Token refresh failed - new login required",
          details: result.message,
        });

        return { status: "expired", message: result.message };
      }

      // Something went wrong but we're not sure what
      config.logger.logWarning({
        message: "Token refresh gave unexpected response",
        details: "Keeping existing token for now",
      });

      return { status: "retry" };
    } catch (error) {
      config.logger.logError({
        message: "Token refresh failed",
        error,
        details: error instanceof Error ? error.message : "Unknown error",
      });

      // If we're online, the error is likely permanent
      if (navigator.onLine) {
        return { status: "error", message: "Failed to refresh token" };
      }

      // If offline, keep existing token if it's within grace period
      const decodedToken = decodeJWT(user.token);
      if (decodedToken && isTokenValidForOfflineUse(decodedToken)) {
        return {
          status: "network-error",
          user,
          message: "Operating offline with valid token",
        };
      }

      return {
        status: "network-error",
        user: null,
        message: "Token expired and offline - login required when online",
      };
    }
  };

  /**
   * Refresh user token with duplicate request prevention
   */
  const refreshToken = async (user: User): Promise<TokenRefreshResult> => {
    // Use user ID as key to prevent multiple refresh operations for the same user
    const key = user.id;

    // If already refreshing, wait for that to complete
    if (refreshOperations.has(key)) {
      return refreshOperations.get(key) as Promise<TokenRefreshResult>;
    }

    // Create new refresh operation and store it
    const refreshOperation = performTokenRefresh(user);
    refreshOperations.set(key, refreshOperation);

    try {
      return await refreshOperation;
    } finally {
      // Clean up after operation completes (success or failure)
      refreshOperations.delete(key);
    }
  };

  /**
   * Validate user token and refresh if needed
   */
  const validateToken = async (user: User): Promise<User | null> => {
    if (!user) return null;

    try {
      const decodedToken = decodeJWT(user.token);
      if (!decodedToken) {
        config.logger.logWarning({ message: "Invalid token format" });
        return null;
      }

      // Handle offline scenario
      if (!navigator.onLine) {
        const now = new Date();
        const tokenExpiry = decodedToken.expiresAt.getTime();

        // Token still valid in offline mode
        if (tokenExpiry > now.getTime()) {
          config.logger.logWarning({
            message: "Operating offline with valid token",
            details: `Token expires in ${Math.floor(
              (tokenExpiry - now.getTime()) / 1000
            )} seconds`,
          });
          return user;
        }

        // Provide grace period when offline
        if (isTokenValidForOfflineUse(decodedToken)) {
          config.logger.logWarning({
            message: "Operating offline with grace period",
            details: "Will need to refresh token when back online",
          });
          return user;
        }

        config.logger.logError({
          message: "Token expired and offline - user will be logged out when online",
          error: new Error("Token expired and offline"), // Added error object
          details: "Keeping user data for now to allow offline operation",
        });
        return user; // Keep the user logged in even if token is expired and offline
      }

      // Online and token expiring soon - refresh it
      if (isTokenExpiringSoon(decodedToken)) {
        const result = await refreshToken(user);

        switch (result.status) {
          case "success":
            return result.user;
          case "retry":
            // Keep using current token if refresh failed but it's still valid
            if (decodedToken.expiresAt.getTime() > new Date().getTime()) {
              return user;
            }
            return null;
          case "network-error":
            return result.user; // Could be null or the existing user
          default:
            return null;
        }
      }

      // Token is valid and not expiring soon
      return user;
    } catch (error) {
      config.logger.logError({
        message: "Token validation error",
        error,
        details: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  };

  /**
   * Save user data to preferences
   */
  const saveUser = async (user: User): Promise<void> => {
    await Preferences.set({
      key: "user",
      value: JSON.stringify(user),
    });
  };

  /**
   * Clear user data from preferences
   */
  const clearUser = async (): Promise<void> => {
    await Preferences.set({ key: "user", value: "" });
  };

  return {
    refreshToken,
    validateToken,
    saveUser,
    clearUser,
  };
}
