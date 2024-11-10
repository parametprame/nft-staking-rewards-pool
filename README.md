# NFT Staking Pool Contract

This repository contains the ``ExampleNftPool`` smart contract, a Solidity-based system for staking NFTs and earning token rewards. The contract supports NFTs with different rarities, each with specific reward multipliers, and is designed to operate on the Ethereum blockchain.


⚠️ Disclaimer: This contract is intended for demonstration purposes and is not recommended for production without thorough security audits and testing. Please use at your own risk.

## Features
1. NFT Staking and Unstaking: Users can stake and unstake their NFTs, classified by rarity levels (Common, Rare, Super Rare).
2. Rewards Calculation: Tokens are distributed based on the rarity of staked NFTs, with configurable multipliers for each rarity level.
3. Signature Verification: Uses signatures to validate rarity data with a trusted signer.
4. Emergency Withdraw: Allows users to withdraw their NFTs without claiming rewards.
5. Admin Controls: Adjust reward rates, max supply, and trusted signer address.

## Setup
### Prerequisites
1. Solidity >=0.8.0
2. OpenZeppelin Contracts for Ownable, ReentrancyGuard, and cryptographic utilities.
3. IERC721 Interface for interacting with NFTs.
4. IVault Interface for token distribution.

### Installation

1. Clone this repository:
```
git clone https://github.com/parametprame/nft-staking-rewards-pool.git
```
2. Install dependencies:
```
npm install
```

## Usage
### Deployment

Deploy the contract with your chosen NFT and vault addresses, and specify a trusted signer.

### Staking

Call ``stake`` with token IDs, corresponding rarities, and signatures:

```
const tokenIds = [1, 2, 3];
const rarities = [0, 1, 2];
const signatures = [];

for (let i = 0; i < tokenIds.length; i++) {
  const messageHash = ethers.keccak256(
    ethers.concat([
      ethers.zeroPadValue(ethers.toBeArray(tokenIds[i]), 32), // Pad _tokenId to 32 bytes
      ethers.zeroPadValue(ethers.toBeArray(rarities[i]), 32), // Pad _rarity to 32 bytes
    ])
  );

  const signature = await trustedSigner.signMessage(ethers.getBytes(messageHash));
  signatures.push(signature);
}

// Example staking call
await exampleNftPool.stake(tokenIds, rarities, signatures);
```
### Unstaking
Call ``unstake`` to retrieve staked NFTs:
```
await exampleNftPool.unstake([1, 2]);
```
### Claim Rewards
Use ``claim`` to claim accumulated rewards:
```
await exampleNftPool.claim();
```
## Example Usage (Local Testing)
The following is an example setup for testing the staking contract locally.

1. **Setup:** Deploy the contract on a local Ethereum environment like Hardhat or Ganache.

2. **Generate Signatures:** Use a trusted signer account to sign the rarity and token ID data. Each ``stake`` transaction requires valid signatures for token IDs and rarity values.

3. **Staking:** Interact with the contract using the ``stake`` function and pass the required token IDs, rarities, and generated signatures.

4. **Claim Rewards:** After a period, call ``claim`` to see rewards based on the staked NFTs' rarity.

5. **Unstaking:** Call ``unstake`` to retrieve NFTs and optionally claim rewards.





