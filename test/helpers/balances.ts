/**
 * Balance tracking helpers for tests
 *
 * Utilities for tracking token balances before/after operations.
 */

import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

type TokenContract = {
  balanceOf(address: string): Promise<bigint>;
  getAddress(): Promise<string>;
};

/**
 * Get balance of a token for an account
 */
export async function getBalance(
  token: TokenContract | "native",
  account: string | SignerWithAddress
): Promise<bigint> {
  const address = typeof account === "string" ? account : account.address;

  if (token === "native") {
    return await ethers.provider.getBalance(address);
  }

  return await token.balanceOf(address);
}

/**
 * Get balances for multiple accounts
 */
export async function getBalances(
  token: TokenContract | "native",
  accounts: Array<string | SignerWithAddress>
): Promise<Map<string, bigint>> {
  const balances = new Map<string, bigint>();

  for (const account of accounts) {
    const address = typeof account === "string" ? account : account.address;
    balances.set(address, await getBalance(token, address));
  }

  return balances;
}

/**
 * Snapshot balances for multiple token/account pairs
 *
 * Returns a snapshot that can be compared later with expectBalanceChanges
 */
export async function snapshotBalances(
  pairs: Array<{
    token: TokenContract | "native";
    account: string | SignerWithAddress;
    label?: string;
  }>
): Promise<Map<string, bigint>> {
  const snapshot = new Map<string, bigint>();

  for (const { token, account, label } of pairs) {
    const address = typeof account === "string" ? account : account.address;
    const tokenLabel = token === "native" ? "native" : await token.getAddress();
    const key = label ?? `${tokenLabel}:${address}`;
    snapshot.set(key, await getBalance(token, address));
  }

  return snapshot;
}

/**
 * Execute an action and assert balance changed by expected amount
 *
 * @param token - Token contract or "native" for ETH
 * @param account - Account to check balance for
 * @param action - Async function that should change the balance
 * @param expectedChange - Expected change (positive for increase, negative for decrease)
 * @param message - Optional assertion message
 */
export async function expectBalanceChange(
  token: TokenContract | "native",
  account: string | SignerWithAddress,
  action: () => Promise<any>,
  expectedChange: bigint,
  message?: string
): Promise<void> {
  const before = await getBalance(token, account);
  await action();
  const after = await getBalance(token, account);

  const actualChange = after - before;
  expect(actualChange).to.equal(
    expectedChange,
    message ?? `Balance change mismatch`
  );
}

/**
 * Execute an action and assert balance changed by expected amount,
 * accounting for gas costs (useful for native token tests)
 *
 * @param account - Account to check balance for
 * @param action - Async function that returns a transaction
 * @param expectedChange - Expected change (before gas costs)
 */
export async function expectNativeBalanceChangeWithGas(
  account: SignerWithAddress,
  action: () => Promise<any>,
  expectedChange: bigint
): Promise<void> {
  const before = await ethers.provider.getBalance(account.address);
  const tx = await action();
  const receipt = await tx.wait();
  const gasUsed = receipt.gasUsed * receipt.gasPrice;
  const after = await ethers.provider.getBalance(account.address);

  const actualChange = after - before + gasUsed;
  expect(actualChange).to.equal(
    expectedChange,
    `Native balance change mismatch (after accounting for gas)`
  );
}

/**
 * Assert that a balance did NOT change during an action
 */
export async function expectBalanceUnchanged(
  token: TokenContract | "native",
  account: string | SignerWithAddress,
  action: () => Promise<any>
): Promise<void> {
  await expectBalanceChange(token, account, action, 0n, "Balance should not have changed");
}

/**
 * Get balance difference between two snapshots
 */
export function getBalanceDiff(
  before: Map<string, bigint>,
  after: Map<string, bigint>,
  key: string
): bigint {
  const beforeVal = before.get(key) ?? 0n;
  const afterVal = after.get(key) ?? 0n;
  return afterVal - beforeVal;
}

