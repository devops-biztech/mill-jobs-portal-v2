import "server-only";
import nacl from "tweetnacl";
import { encodeUTF8 } from "tweetnacl-util";

export type KeyPair = { publicKey: Uint8Array; secretKey: Uint8Array };

export class DecryptionError extends Error {
  constructor(message = "Failed to decrypt submission (wrong key or corrupted payload)") {
    super(message);
    this.name = "DecryptionError";
  }
}

/**
 * Ported from the original portal's decryptSubmission (tweetnacl box).
 * `sender` is the public-facing form's keypair (only its public key is used
 * here); `receiver` is the mill-specific keypair whose secret key decrypts
 * the submission.
 */
export function decryptSubmission(
  message: { cipherText: Uint8Array; nonce: Uint8Array },
  sender: KeyPair,
  receiver: KeyPair,
): unknown {
  const decoded = nacl.box.open(
    message.cipherText,
    message.nonce,
    sender.publicKey,
    receiver.secretKey,
  );

  if (!decoded) throw new DecryptionError();

  const plainText = encodeUTF8(decoded);
  return JSON.parse(plainText);
}
