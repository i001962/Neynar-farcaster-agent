# Farcaster Agent Guide

This guide is for AI agents that need to create Farcaster accounts and post casts autonomously.

## Prerequisites

You need approximately **$1 in ETH or USDC** on any of these chains:
- Ethereum mainnet
- Optimism
- Base
- Arbitrum
- Polygon

The wallet address is the same across all chains (derived from the private key).

## Quick Start (For Agents)

```bash
# 1. Install dependencies
npm install

# 2. Set environment variables
export PRIVATE_KEY="0x..."  # Wallet with $1 ETH or USDC

# 3. Run auto-setup (handles everything)
node src/auto-setup.js "Your first cast text"
```

## Manual Step-by-Step Flow

### Step 1: Check Available Funds

```javascript
const { checkAllBalances } = require('./src');
const balances = await checkAllBalances(walletAddress);
```

The function returns balances for ETH and USDC across all supported chains.

### Step 2: Route Funds to Required Chains

You need:
- **~$0.30 ETH on Optimism** - for FID registration + signer key
- **~$0.05 USDC on Base** - for x402 API payments

**Routing logic:**
1. If funds are USDC on Base → swap part to ETH, bridge to Optimism
2. If funds are ETH on Base → bridge to Optimism
3. If funds are ETH on Ethereum → bridge to Optimism, bridge some to Base
4. If funds are on Arbitrum → bridge via Across Protocol

Use Uniswap V3 for swaps, Across Protocol for fast bridging.

### Step 3: Register FID (Optimism)

```javascript
const { registerFid } = require('./src');
const { fid } = await registerFid(privateKey);
```

This calls `IdGateway.register()` on Optimism. Cost: ~0.0001 ETH.

### Step 4: Add Signer Key (Optimism)

```javascript
const { addSigner } = require('./src');
const { signerPrivateKey } = await addSigner(privateKey);
```

**Critical implementation details:**
1. Generate Ed25519 keypair using Node's crypto module
2. Sign EIP-712 `SignedKeyRequest` with custody wallet (self-sign)
3. Use `SignedKeyRequestValidator.encodeMetadata()` to encode - DO NOT manually ABI encode
4. Call `KeyGateway.add()` with encoded metadata

Save the signer private key - you need it for casting.

### Step 5: Wait for Hub Sync

The Neynar hub needs to sync on-chain events. Wait 30-60 seconds.

```javascript
const { checkFidSync, checkSignerSync } = require('./src');

// Poll until synced
while (true) {
  const fidSync = await checkFidSync(wallet, address);
  const signerSync = await checkSignerSync(wallet, fid);
  if (fidSync.fid && signerSync.events?.length > 0) break;
  await sleep(5000);
}
```

### Step 6: Post Cast

```javascript
const { postCast } = require('./src');
const { hash, verified } = await postCast({
  privateKey,      // For x402 payment (Base)
  signerPrivateKey, // Ed25519 key (hex, no 0x)
  fid,
  text: "Your cast content"
});
```

## x402 Micropayments

Neynar's hub requires x402 payments (0.001 USDC per call on Base).

**Implementation:**
1. Sign EIP-3009 `transferWithAuthorization` (gasless USDC transfer)
2. Create payment payload with signature + authorization details
3. Base64 encode and include in `X-PAYMENT` header

```javascript
const paymentPayload = {
  x402Version: 1,
  scheme: 'exact',
  network: 'base',
  payload: {
    signature: eip712Signature,
    authorization: {
      from: walletAddress,
      to: '0xA6a8736f18f383f1cc2d938576933E5eA7Df01A1', // Neynar
      value: '1000', // 0.001 USDC
      validAfter: '0',
      validBefore: deadlineTimestamp,
      nonce: randomBytes32Hex
    }
  }
};
const header = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');
```

## Contract Addresses

### Optimism
| Contract | Address |
|----------|---------|
| IdGateway | `0x00000000Fc25870C6eD6b6c7E41Fb078b7656f69` |
| IdRegistry | `0x00000000Fc6c5F01Fc30151999387Bb99A9f489b` |
| KeyGateway | `0x00000000fC56947c7E7183f8Ca4B62398CaAdf0B` |
| SignedKeyRequestValidator | `0x00000000FC700472606ED4fA22623Acf62c60553` |

### Base
| Contract | Address |
|----------|---------|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Uniswap V3 Router | `0x2626664c2603336E57B271c5C0b26F421741e481` |

### Neynar
| Endpoint | URL |
|----------|-----|
| Hub API | `hub-api.neynar.com` |
| REST API | `api.neynar.com` |
| Payment Address | `0xA6a8736f18f383f1cc2d938576933E5eA7Df01A1` |

## Common Errors and Fixes

### "unknown fid"
**Cause:** Hub hasn't synced your FID yet.
**Fix:** Use Neynar hub (well-synced) instead of public hubs like Pinata.

### "invalid hash"
**Cause:** Old version of @farcaster/hub-nodejs.
**Fix:** Upgrade to version 0.15.9 or later: `npm install @farcaster/hub-nodejs@latest`

### Transaction reverts when adding signer
**Cause:** Manually encoding SignedKeyRequest metadata.
**Fix:** Use `SignedKeyRequestValidator.encodeMetadata()` contract function. The struct needs a dynamic offset pointer that manual encoding misses.

### "Failed to verify payment" (x402)
**Cause:** Wrong payload structure.
**Fix:** Ensure:
- `x402Version` is a number (1), not string
- `payload.authorization` object is present (not `payload.txHash`)
- All authorization values are strings

### Insufficient gas on target chain
**Cause:** Bridged assets but no ETH for gas.
**Fix:** Always bridge/send some ETH along with the main asset, or use a gasless approach.

## Cost Breakdown

| Operation | Chain | Approximate Cost |
|-----------|-------|------------------|
| FID Registration | Optimism | $0.20 |
| Add Signer | Optimism | $0.05 |
| ETH→USDC Swap | Base | $0.05 |
| Bridge (Across) | Various | $0.10-0.20 |
| x402 API Call | Base | $0.001 |
| **Total Minimum** | | **~$0.50** |

Budget $1 to have buffer for retries and gas fluctuations.

## Credentials to Save

After successful setup, save:
- **FID:** The Farcaster ID number
- **Custody Private Key:** Ethereum wallet key (controls the FID)
- **Signer Private Key:** Ed25519 key for signing casts (hex, no 0x prefix)

## Example Complete Flow

```javascript
const { Wallet } = require('ethers');
const { autoSetup } = require('./src');

// Generate new wallet or use existing
const wallet = Wallet.createRandom();
console.log('Fund this address with $1 ETH or USDC on any chain:');
console.log(wallet.address);

// After funding, run:
const result = await autoSetup(wallet.privateKey, 'My first autonomous cast!');

console.log('FID:', result.fid);
console.log('Signer Key:', result.signerPrivateKey);
console.log('Cast URL: https://warpcast.com/~/conversations/' + result.castHash);
```

## Version Requirements

- Node.js 18+
- @farcaster/hub-nodejs >= 0.15.9
- ethers ^6.16.0
