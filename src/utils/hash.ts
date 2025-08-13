import crypto from 'crypto';

/**
 * Create a SHA-256 hash of a string
 */
export function createHash(content: string): string {
  return crypto
    .createHash('sha256')
    .update(content)
    .digest('hex');
}

/**
 * Create a hash from multiple values
 */
export function createMultiHash(...values: any[]): string {
  const combined = values
    .map(v => JSON.stringify(v))
    .join('|');
  return createHash(combined);
}

/**
 * Generate a random ID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Create a short hash (first 8 characters)
 */
export function createShortHash(content: string): string {
  return createHash(content).substring(0, 8);
}