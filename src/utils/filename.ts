const SAFE_FILENAME_BYTE = /^[A-Za-z0-9._~-]$/;

/**
 * Encode an arbitrary identifier as one reversible, cross-platform filename component.
 * Percent signs are encoded too, so distinct source identifiers cannot collapse onto the
 * same Windows-safe filename.
 */
export function encodeFilenameComponent(value: string): string {
  let encoded = '';
  for (const byte of Buffer.from(value, 'utf8')) {
    const char = String.fromCharCode(byte);
    encoded += SAFE_FILENAME_BYTE.test(char)
      ? char
      : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return encoded;
}
