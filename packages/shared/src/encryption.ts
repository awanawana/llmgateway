import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
	const key = process.env.ENCRYPTION_KEY;
	if (!key) {
		throw new Error(
			"ENCRYPTION_KEY environment variable is required for API key encryption",
		);
	}

	const keyBuffer = Buffer.from(key, "base64");
	if (keyBuffer.length !== 32) {
		throw new Error(
			"ENCRYPTION_KEY must be a 32-byte key encoded as base64 (44 characters)",
		);
	}

	return keyBuffer;
}

export function encrypt(plaintext: string): string {
	const key = getEncryptionKey();
	const iv = randomBytes(IV_LENGTH);

	const cipher = createCipheriv(ALGORITHM, key, iv);
	const encrypted = Buffer.concat([
		cipher.update(plaintext, "utf8"),
		cipher.final(),
	]);
	const authTag = cipher.getAuthTag();

	const combined = Buffer.concat([iv, authTag, encrypted]);
	return combined.toString("base64");
}

export function decrypt(ciphertext: string): string {
	const key = getEncryptionKey();
	const combined = Buffer.from(ciphertext, "base64");

	const iv = combined.subarray(0, IV_LENGTH);
	const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
	const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

	const decipher = createDecipheriv(ALGORITHM, key, iv);
	decipher.setAuthTag(authTag);

	const decrypted = Buffer.concat([
		decipher.update(encrypted),
		decipher.final(),
	]);

	return decrypted.toString("utf8");
}

export function isEncrypted(value: string): boolean {
	if (!value) {
		return false;
	}
	try {
		const decoded = Buffer.from(value, "base64");
		return decoded.length > IV_LENGTH + AUTH_TAG_LENGTH;
	} catch {
		return false;
	}
}
