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
 * `receiver` is the mill-specific keypair whose secret key decrypts the
 * submission.
 *
 * The sender public key comes from one of two places:
 *
 *   - `message.senderPublicKey`, when the submitting app generated an
 *     EPHEMERAL keypair for that one submission (sealed-box style). This is
 *     what the SLI online application does, so that it never has to ship a
 *     long-lived secret key to the browser.
 *   - otherwise `sender.publicKey` from the environment, which is how the
 *     older TRL/SRM forms work: one shared, long-lived sender keypair.
 *
 * Both are the same `nacl.box` primitive — only the provenance of the sender
 * key differs, so old and new records decrypt through this one path.
 */
export function decryptSubmission(
  message: {
    cipherText: Uint8Array;
    nonce: Uint8Array;
    senderPublicKey?: Uint8Array;
  },
  sender: KeyPair | null,
  receiver: KeyPair,
): unknown {
  const senderPublicKey = message.senderPublicKey ?? sender?.publicKey;
  if (!senderPublicKey) {
    throw new DecryptionError(
      "No sender public key: the record carries none and no legacy sender keypair is configured",
    );
  }

  const decoded = nacl.box.open(
    message.cipherText,
    message.nonce,
    senderPublicKey,
    receiver.secretKey,
  );

  if (!decoded) throw new DecryptionError();

  const plainText = encodeUTF8(decoded);
  return JSON.parse(plainText);
}
