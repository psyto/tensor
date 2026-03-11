import { PublicKey } from "@solana/web3.js";

export const TENSOR_PROGRAM_ID = new PublicKey(
  "3uztvRNHpQcS9KgbdY6NFoL9HamSZYujkH9FQWtFoP1h"
);

export function findMarginAccountPDA(
  owner: PublicKey,
  programId: PublicKey = TENSOR_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("margin_account"), owner.toBuffer()],
    programId,
  );
}

export function findMarginMarketPDA(
  programId: PublicKey = TENSOR_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("margin_market")],
    programId,
  );
}

export function findMarginConfigPDA(
  programId: PublicKey = TENSOR_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("margin_config")],
    programId,
  );
}

export function findIntentAccountPDA(
  marginAccount: PublicKey,
  intentId: bigint,
  programId: PublicKey = TENSOR_PROGRAM_ID,
): [PublicKey, number] {
  const intentIdBuf = Buffer.alloc(8);
  intentIdBuf.writeBigUInt64LE(intentId);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("intent"), marginAccount.toBuffer(), intentIdBuf],
    programId,
  );
}

export function findMarginMarketPDAByIndex(
  index: number,
  programId: PublicKey = TENSOR_PROGRAM_ID,
): [PublicKey, number] {
  const indexBuf = Buffer.alloc(2);
  indexBuf.writeUInt16LE(index);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("margin_market"), indexBuf],
    programId,
  );
}

export function findSolverRegistryPDA(
  programId: PublicKey = TENSOR_PROGRAM_ID,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("solver_registry")],
    programId,
  );
}
