import "server-only";
import type { KeyPair } from "@/lib/aws-sync/decrypt";

/** Companies with a decrypt keypair configured for the AWS submissions sync. */
const RECEIVER_COMPANY_CODES = ["TRL", "SRM", "SLI"] as const;
type ReceiverCompanyCode = (typeof RECEIVER_COMPANY_CODES)[number];

function parseKey(raw: string | undefined, envVarName: string): Uint8Array {
  if (!raw?.trim()) {
    throw new Error(`Missing env var ${envVarName} required for AWS submission decryption`);
  }
  const bytes = raw.trim().split(/\s+/).map(Number);
  if (bytes.some(Number.isNaN)) {
    throw new Error(`Env var ${envVarName} does not look like a space-separated byte array`);
  }
  return new Uint8Array(bytes);
}

export function getSenderKeys(): KeyPair {
  return {
    publicKey: parseKey(process.env.S_PUB, "S_PUB"),
    secretKey: parseKey(process.env.S_SEC, "S_SEC"),
  };
}

/**
 * Returns the receiver keypair for a mill's company code, or null if this
 * mill isn't wired into the AWS decrypt pipeline (e.g. NFL, which uses its
 * own separate submission flow, or a mill with no keys configured yet).
 */
export function getReceiverKeys(companyCode: string): KeyPair | null {
  const code = companyCode.trim().toUpperCase();
  if (!RECEIVER_COMPANY_CODES.includes(code as ReceiverCompanyCode)) return null;

  return {
    publicKey: parseKey(process.env[`${code}_PUB`], `${code}_PUB`),
    secretKey: parseKey(process.env[`${code}_SEC`], `${code}_SEC`),
  };
}
