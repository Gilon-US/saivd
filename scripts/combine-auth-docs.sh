#!/bin/bash

# Combine the split authentication and security documentation files
echo "Combining authentication and security documentation files..."

# Output file
OUTPUT_FILE="/Users/ben/Development/SAVD/CODE/savd-app/docs/architecture/04-authentication-security.md"

# Backup the original file
cp "$OUTPUT_FILE" "${OUTPUT_FILE}.bak"
echo "Original file backed up to ${OUTPUT_FILE}.bak"

# Combine the files
cat "/Users/ben/Development/SAVD/CODE/savd-app/docs/architecture/04-authentication-security-updated.md" > "$OUTPUT_FILE"
cat "/Users/ben/Development/SAVD/CODE/savd-app/docs/architecture/04-authentication-security-updated-part2.md" >> "$OUTPUT_FILE"
cat "/Users/ben/Development/SAVD/CODE/savd-app/docs/architecture/04-authentication-security-updated-part3.md" >> "$OUTPUT_FILE"
cat "/Users/ben/Development/SAVD/CODE/savd-app/docs/architecture/04-authentication-security-updated-part4.md" >> "$OUTPUT_FILE"

echo "Files combined successfully into $OUTPUT_FILE"

# Clean up temporary files
rm "/Users/ben/Development/SAVD/CODE/savd-app/docs/architecture/04-authentication-security-updated.md"
rm "/Users/ben/Development/SAVD/CODE/savd-app/docs/architecture/04-authentication-security-updated-part2.md"
rm "/Users/ben/Development/SAVD/CODE/savd-app/docs/architecture/04-authentication-security-updated-part3.md"
rm "/Users/ben/Development/SAVD/CODE/savd-app/docs/architecture/04-authentication-security-updated-part4.md"

echo "Temporary files removed"
echo "Documentation update complete!"
