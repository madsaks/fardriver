export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.replace(/\s+/g, "").toLowerCase();
  if (normalized.length % 2 !== 0) {
    throw new Error("hex string must contain an even number of digits");
  }
  if (!/^[0-9a-f]*$/.test(normalized)) {
    throw new Error("hex string contains non-hex characters");
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
