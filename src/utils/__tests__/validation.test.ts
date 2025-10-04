/**
 * Tests for validation utilities
 * Story 2.2: Public Profile API Endpoint
 */

import { isValidUUID, isValidEmail, isValidURL, sanitizeString } from '../validation';

describe('Validation Utilities', () => {
  describe('isValidUUID', () => {
    it('should return true for valid UUIDs', () => {
      const validUUIDs = [
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
        '00000000-0000-0000-0000-000000000000',
        'ffffffff-ffff-ffff-ffff-ffffffffffff'
      ];

      validUUIDs.forEach(uuid => {
        expect(isValidUUID(uuid)).toBe(true);
      });
    });

    it('should return false for invalid UUIDs', () => {
      const invalidUUIDs = [
        'invalid-uuid',
        '550e8400-e29b-41d4-a716',
        '550e8400-e29b-41d4-a716-446655440000-extra',
        '550e8400e29b41d4a716446655440000', // No hyphens
        '550e8400-e29b-41d4-a716-44665544000g', // Invalid character 'g'
        '',
        '   ',
        'null',
        'undefined'
      ];

      invalidUUIDs.forEach(uuid => {
        expect(isValidUUID(uuid)).toBe(false);
      });
    });

    it('should return false for non-string inputs', () => {
      const nonStringInputs = [
        null,
        undefined,
        123,
        {},
        [],
        true,
        false
      ];

      nonStringInputs.forEach(input => {
        expect(isValidUUID(input as any)).toBe(false);
      });
    });

    it('should be case insensitive', () => {
      const upperCaseUUID = '550E8400-E29B-41D4-A716-446655440000';
      const lowerCaseUUID = '550e8400-e29b-41d4-a716-446655440000';
      const mixedCaseUUID = '550e8400-E29B-41d4-A716-446655440000';

      expect(isValidUUID(upperCaseUUID)).toBe(true);
      expect(isValidUUID(lowerCaseUUID)).toBe(true);
      expect(isValidUUID(mixedCaseUUID)).toBe(true);
    });
  });

  describe('isValidEmail', () => {
    it('should return true for valid email addresses', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org',
        'user123@test-domain.com',
        'a@b.co'
      ];

      validEmails.forEach(email => {
        expect(isValidEmail(email)).toBe(true);
      });
    });

    it('should return false for invalid email addresses', () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user@.com',
        'user space@example.com',
        '',
        'user@@example.com'
      ];

      invalidEmails.forEach(email => {
        expect(isValidEmail(email)).toBe(false);
      });
    });

    it('should return false for non-string inputs', () => {
      expect(isValidEmail(null as any)).toBe(false);
      expect(isValidEmail(undefined as any)).toBe(false);
      expect(isValidEmail(123 as any)).toBe(false);
    });
  });

  describe('isValidURL', () => {
    it('should return true for valid URLs', () => {
      const validURLs = [
        'https://example.com',
        'http://example.com',
        'https://www.example.com/path',
        'https://example.com:8080',
        'ftp://files.example.com'
      ];

      validURLs.forEach(url => {
        expect(isValidURL(url)).toBe(true);
      });
    });

    it('should return false for invalid URLs', () => {
      const invalidURLs = [
        'invalid-url',
        'example.com',
        'http://',
        '',
        'javascript:alert(1)'
      ];

      invalidURLs.forEach(url => {
        expect(isValidURL(url)).toBe(false);
      });
    });

    it('should return false for non-string inputs', () => {
      expect(isValidURL(null as any)).toBe(false);
      expect(isValidURL(undefined as any)).toBe(false);
      expect(isValidURL(123 as any)).toBe(false);
    });
  });

  describe('sanitizeString', () => {
    it('should remove HTML-like characters', () => {
      expect(sanitizeString('<script>alert(1)</script>')).toBe('scriptalert(1)/script');
      expect(sanitizeString('Hello <world>')).toBe('Hello world');
      expect(sanitizeString('Test > < test')).toBe('Test   test');
    });

    it('should trim whitespace', () => {
      expect(sanitizeString('  hello world  ')).toBe('hello world');
      expect(sanitizeString('\n\ttest\n\t')).toBe('test');
    });

    it('should respect max length', () => {
      const longString = 'a'.repeat(2000);
      expect(sanitizeString(longString, 100)).toHaveLength(100);
      expect(sanitizeString(longString)).toHaveLength(1000); // default max
    });

    it('should handle non-string inputs', () => {
      expect(sanitizeString(null as any)).toBe('');
      expect(sanitizeString(undefined as any)).toBe('');
      expect(sanitizeString(123 as any)).toBe('');
    });

    it('should handle empty strings', () => {
      expect(sanitizeString('')).toBe('');
      expect(sanitizeString('   ')).toBe('');
    });
  });
});
