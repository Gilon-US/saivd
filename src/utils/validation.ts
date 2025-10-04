/**
 * Validation utilities for the SAVD application
 * Story 2.2: Public Profile API Endpoint
 */

/**
 * Validates if a string is a valid UUID (RFC 4122 compliant)
 * 
 * @param uuid - String to validate as UUID
 * @returns true if valid UUID format, false otherwise
 * 
 * @example
 * isValidUUID('550e8400-e29b-41d4-a716-446655440000') // true
 * isValidUUID('invalid-uuid') // false
 * isValidUUID('') // false
 * isValidUUID(null) // false
 */
export function isValidUUID(uuid: string): boolean {
  // Check if input is a string
  if (typeof uuid !== 'string') {
    return false;
  }
  
  // UUID v4 regex pattern (RFC 4122)
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  // where x is any hexadecimal digit and y is one of 8, 9, A, or B
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  return uuidRegex.test(uuid);
}

/**
 * Validates if a string is a valid email address
 * 
 * @param email - String to validate as email
 * @returns true if valid email format, false otherwise
 */
export function isValidEmail(email: string): boolean {
  if (typeof email !== 'string') {
    return false;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validates if a string is a valid URL
 * 
 * @param url - String to validate as URL
 * @returns true if valid URL format, false otherwise
 */
export function isValidURL(url: string): boolean {
  if (typeof url !== 'string') {
    return false;
  }
  
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitizes a string for display purposes
 * Removes potentially harmful characters
 * 
 * @param input - String to sanitize
 * @param maxLength - Maximum length (default: 1000)
 * @returns Sanitized string
 */
export function sanitizeString(input: string, maxLength: number = 1000): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input
    .trim()
    .slice(0, maxLength)
    .replace(/[<>]/g, ''); // Remove potential HTML tags
}
