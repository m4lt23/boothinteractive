import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Gets the display name for a user with proper priority:
 * 1. "You" if it's the current user (when currentUserId provided)
 * 2. screenname (if set) - highest priority
 * 3. firstName + lastName (if both available)
 * 4. firstName only (if available)
 * 5. "User [last4digits]" as fallback
 */
export function getUserDisplayName(
  user: {
    id?: string;
    screenname?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null | undefined,
  currentUserId?: string | null
): string {
  if (!user) return 'Unknown User';
  
  // Return "You" for current user if currentUserId is provided
  if (currentUserId && user.id === currentUserId) return "You";
  
  // Priority 1: screenname
  if (user.screenname) return user.screenname;
  
  // Priority 2: firstName + lastName
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  
  // Priority 3: firstName only
  if (user.firstName) return user.firstName;
  
  // Fallback: "User [last4digits]"
  return `User ${user.id?.slice(-4) || 'Unknown'}`;
}

/**
 * Gets avatar initials respecting privacy settings:
 * 1. Uses screenname first (preserves anonymity)
 * 2. Falls back to firstName/lastName only if no screenname
 * 3. Fallback to '??' if no usable data
 */
export function getUserInitials(
  user: {
    screenname?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  } | null | undefined
): string {
  if (!user) return '??';
  
  // Priority 1: screenname (preserves anonymity)
  if (user.screenname && user.screenname.length >= 2) {
    return user.screenname.substring(0, 2).toUpperCase();
  }
  
  // Priority 2: firstName + lastName initials
  if (user.firstName && user.lastName) {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  }
  
  // Priority 3: firstName only (first 2 chars)
  if (user.firstName && user.firstName.length >= 2) {
    return user.firstName.substring(0, 2).toUpperCase();
  }
  
  // Priority 4: firstName first char + '?'
  if (user.firstName) {
    return `${user.firstName[0]}?`.toUpperCase();
  }
  
  // Fallback
  return '??';
}

// Types for caster display formatting
interface SessionCaster {
  id: string;
  name: string;
  role: 'host' | 'cohost' | 'guest';
  joinedAt: number;
}

interface CasterDisplayOptions {
  maxNameLength?: number;
  truncateStyle?: 'ellipsis' | 'initials';
}

/**
 * Formats a list of casters for display with specific rules:
 * - Single name: just host
 * - 'A + B': host + 1 co-host  
 * - 'A + B (+N)': host + multiple co-hosts with additional count
 * - Always host-first ordering
 * - Handles name truncation
 */
export function formatCastersDisplay(
  casters: SessionCaster[], 
  options: CasterDisplayOptions = {}
): { text: string; fullText: string; truncated: boolean } {
  const { maxNameLength = 15, truncateStyle = 'ellipsis' } = options;
  
  if (!casters || casters.length === 0) {
    return { text: 'No broadcasters', fullText: 'No broadcasters', truncated: false };
  }

  // Sort with host first, then by join time
  const sortedCasters = [...casters].sort((a, b) => {
    if (a.role === 'host' && b.role !== 'host') return -1;
    if (b.role === 'host' && a.role !== 'host') return 1;
    return a.joinedAt - b.joinedAt;
  });

  // Helper to truncate names
  const truncateName = (name: string): { short: string; truncated: boolean } => {
    if (name.length <= maxNameLength) {
      return { short: name, truncated: false };
    }
    
    if (truncateStyle === 'initials') {
      // Use first and last word initials for very long names
      const words = name.split(' ');
      if (words.length >= 2) {
        return { 
          short: `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase(),
          truncated: true 
        };
      }
    }
    
    // Default ellipsis truncation
    return { 
      short: name.substring(0, maxNameLength - 1) + '…',
      truncated: true 
    };
  };

  const fullNames = sortedCasters.map(c => c.name);
  
  // Single caster
  if (sortedCasters.length === 1) {
    const { short, truncated } = truncateName(sortedCasters[0].name);
    return {
      text: short,
      fullText: fullNames[0],
      truncated
    };
  }

  // Two casters: 'A + B'
  if (sortedCasters.length === 2) {
    const name1 = truncateName(sortedCasters[0].name);
    const name2 = truncateName(sortedCasters[1].name);
    
    return {
      text: `${name1.short} + ${name2.short}`,
      fullText: `${fullNames[0]} + ${fullNames[1]}`,
      truncated: name1.truncated || name2.truncated
    };
  }

  // Multiple casters: 'A + B (+N)'
  const name1 = truncateName(sortedCasters[0].name);
  const name2 = truncateName(sortedCasters[1].name);
  const additionalCount = sortedCasters.length - 2;
  
  return {
    text: `${name1.short} + ${name2.short} (+${additionalCount})`,
    fullText: fullNames.join(', '),
    truncated: name1.truncated || name2.truncated
  };
}

/**
 * Gets a simple count description for casters
 */
export function getCasterCountText(casters: SessionCaster[]): string {
  if (!casters || casters.length === 0) return 'No broadcasters';
  if (casters.length === 1) return '1 broadcaster';
  return `${casters.length} broadcasters`;
}
