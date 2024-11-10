import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers, network } from "hardhat";

describe("ExamplePool", function () {
  async function deployExamplePool() {
    const [owner, account1, account2, trustedSigner] =
      await ethers.getSigners();

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();

    const MockCollection = await ethers.getContractFactory("MockCollection");
    const mockCollection = await MockCollection.deploy();

    const Vault = await ethers.getContractFactory("Vault");
    const vault = await Vault.deploy(mockToken);

    const ExamplePool = await ethers.getContractFactory("ExampleNftPool");

    const examplePool = await ExamplePool.deploy(
      mockCollection,
      vault,
      trustedSigner.address
    );

    // Set initial rewards

    for (let index = 0; index < 18; index++) {
      await mockCollection.mintToken(account1.address, index + 1);
    }

    await mockCollection.mintToken(account2.address, 19);
    await mockCollection.mintToken(account2.address, 20);
    await mockCollection.mintToken(account2.address, 21);

    await mockToken.mint(vault, "100000000000000000000000");

    await vault.addWhiteList(examplePool);

    return {
      examplePool,
      mockCollection,
      owner,
      account1,
      account2,
      trustedSigner,
      mockToken,
      vault,
    };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { examplePool, owner, trustedSigner, mockCollection, vault } =
        await loadFixture(deployExamplePool);

      expect(await examplePool.owner()).to.equal(owner.address);
      expect(await examplePool.trustedSigner()).to.equal(trustedSigner.address);
      expect(await examplePool.nft()).to.equal(
        await mockCollection.getAddress()
      );
      expect(await examplePool.vault()).to.equal(await vault.getAddress());
    });
  });

  describe("Admin Process", function () {
    describe("HAPPY CASE", function () {
      it("Should set trusted signer", async function () {
        const { examplePool, trustedSigner } = await loadFixture(
          deployExamplePool
        );

        await examplePool.getFunction("setTrustedSigner")(
          trustedSigner.address
        );

        expect(await examplePool.trustedSigner()).to.equal(
          trustedSigner.address
        );
      });

      it("Should set max supply", async function () {
        const { examplePool } = await loadFixture(deployExamplePool);

        await examplePool.getFunction("setMaxNFTSupply")(500);

        expect(await examplePool.maxSupply()).to.equal(BigInt(500));
      });

      it("Should set distribute token", async function () {
        const { examplePool } = await loadFixture(deployExamplePool);

        await examplePool.getFunction("setDistributeToken")(10);

        expect(await examplePool.distributeTokenPerBlock()).to.equal(
          BigInt(10)
        );
      });

      it("Should set common boost", async function () {
        const { examplePool } = await loadFixture(deployExamplePool);

        await examplePool.getFunction("setCommonBoost")(10);

        expect(await examplePool.COMMON_BOOST()).to.equal(BigInt(10));
      });

      it("Should set rare boost", async function () {
        const { examplePool } = await loadFixture(deployExamplePool);

        await examplePool.getFunction("setRareBoost")(10);

        expect(await examplePool.RARE_BOOST()).to.equal(BigInt(10));
      });

      it("Should set super rare boost", async function () {
        const { examplePool } = await loadFixture(deployExamplePool);

        await examplePool.getFunction("setSuperRareBoost")(10);

        expect(await examplePool.SUPER_RARE_BOOST()).to.equal(BigInt(10));
      });
    });

    describe("WORST CASE", function () {
      it("It should throw an error if the _maxSupply less than 1", async function () {
        const { examplePool } = await loadFixture(deployExamplePool);

        await expect(
          examplePool.getFunction("setMaxNFTSupply")(0)
        ).to.revertedWithCustomError(examplePool, "InputError");
      });

      it("It should throw an error if the _distributeTokenPerBlock less than 1", async function () {
        const { examplePool } = await loadFixture(deployExamplePool);

        await expect(
          examplePool.getFunction("setDistributeToken")(0)
        ).to.revertedWithCustomError(examplePool, "InputError");
      });
    });
  });

  describe("Emergency Withdraw Process", function () {
    describe("HAPPY CASE", function () {
      it("Should call emergency withdraw by owner", async function () {
        const { examplePool, account1, mockCollection, trustedSigner } =
          await loadFixture(deployExamplePool);

        await mockCollection.connect(account1).getFunction("setApprovalForAll")(
          await examplePool.target,
          true
        );

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

          const signature = await trustedSigner.signMessage(
            ethers.getBytes(messageHash)
          );
          signatures.push(signature);
        }

        // Create the message hash to sign off-chain
        // Assume user has tokenId 1 and rarity is common

        await examplePool.connect(account1).getFunction("stake")(
          tokenIds,
          rarities,
          signatures
        );

        await examplePool.connect(account1).getFunction("emergencyWithdraw")([
          1, 2, 3,
        ]);

        expect(await mockCollection.balanceOf(examplePool.target)).equal(
          BigInt(0)
        );
        expect(await mockCollection.ownerOf(1)).to.equal(account1.address);
        expect(await mockCollection.ownerOf(2)).to.equal(account1.address);
        expect(await mockCollection.ownerOf(3)).to.equal(account1.address);

        expect(await examplePool.totalNftCommon()).to.equal(BigInt(0));
        expect(await examplePool.totalNftRare()).to.equal(BigInt(0));
        expect(await examplePool.totalNftSuperRare()).to.equal(BigInt(0));

        expect(await examplePool.nftRarity(1)).to.equal(BigInt(0));
        expect(await examplePool.nftRarity(2)).to.equal(BigInt(0));
        expect(await examplePool.nftRarity(3)).to.equal(BigInt(0));

        expect(await examplePool.userStakedNfts(account1.address, 1)).to.eql([
          BigInt(0),
          BigInt(0),
          BigInt(0),
        ]);
        expect(await examplePool.userStakedNfts(account1.address, 2)).to.eql([
          BigInt(0),
          BigInt(0),
          BigInt(0),
        ]);
        expect(await examplePool.userStakedNfts(account1.address, 3)).to.eql([
          BigInt(0),
          BigInt(0),
          BigInt(0),
        ]);

        expect(await examplePool.totalNftIsStaked()).to.eql(BigInt(0));

        expect(await examplePool.balanceOf(account1.address)).to.equal(
          BigInt(0)
        );

        expect(await examplePool.tokensOfOwner(account1.address)).to.eql([]);
      });
    });

    describe("WORST CASE", function () {
      it("It should throw an error if the tokenId mismatch the owner", async function () {
        const { examplePool, account1, mockCollection, trustedSigner } =
          await loadFixture(deployExamplePool);

        await mockCollection.connect(account1).getFunction("setApprovalForAll")(
          await examplePool.target,
          true
        );

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

          const signature = await trustedSigner.signMessage(
            ethers.getBytes(messageHash)
          );
          signatures.push(signature);
        }

        // Create the message hash to sign off-chain
        // Assume user has tokenId 1 and rarity is common

        await examplePool.connect(account1).getFunction("stake")(
          tokenIds,
          rarities,
          signatures
        );

        await expect(
          examplePool.connect(account1).getFunction("emergencyWithdraw")([5])
        ).to.revertedWithCustomError(examplePool, "InputError");
      });
    });
  });

  describe("Calculate Reward Process", function () {
    describe("HAPPY CASE", function () {
      it("Should get user reward by tokenId", async function () {
        const { examplePool, account1, mockCollection, trustedSigner } =
          await loadFixture(deployExamplePool);

        await mockCollection.connect(account1).getFunction("setApprovalForAll")(
          await examplePool.target,
          true
        );

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

          const signature = await trustedSigner.signMessage(
            ethers.getBytes(messageHash)
          );
          signatures.push(signature);
        }

        await examplePool.connect(account1).getFunction("stake")(
          tokenIds,
          rarities,
          signatures
        );

        await network.provider.send("evm_mine");

        await examplePool.updatePool();

        const nftId1 = await examplePool.userStakedNfts(account1.address, 1);
        const nftId2 = await examplePool.userStakedNfts(account1.address, 2);
        const nftId3 = await examplePool.userStakedNfts(account1.address, 3);

        await expect(
          await examplePool.connect(account1).getFunction("getUserRewardByNFT")(
            1
          )
        ).to.equal((await examplePool.commonReward()) - nftId2[1]);

        expect(
          await examplePool.connect(account1).getFunction("getUserRewardByNFT")(
            2
          )
        ).to.equal((await examplePool.rareReward()) - nftId2[1]);

        expect(
          await examplePool.connect(account1).getFunction("getUserRewardByNFT")(
            3
          )
        ).to.equal((await examplePool.superRareReward()) - nftId3[1]);
      });
    });
  });

  describe("Stake Process", function () {
    describe("HAPPY CASE", function () {
      it("Should stake single nft", async function () {
        const { examplePool, account1, mockCollection, trustedSigner } =
          await loadFixture(deployExamplePool);

        await mockCollection.connect(account1).getFunction("setApprovalForAll")(
          await examplePool.target,
          true
        );

        const tokenId = [1];
        const rarity = [0];

        const signature = [];

        for (let i = 0; i < tokenId.length; i++) {
          const messageHash = ethers.keccak256(
            ethers.concat([
              ethers.zeroPadValue(ethers.toBeArray(tokenId[i]), 32), // Pad _tokenId to 32 bytes
              ethers.zeroPadValue(ethers.toBeArray(rarity[i]), 32), // Pad _rarity to 32 bytes
            ])
          );

          const a = await trustedSigner.signMessage(
            ethers.getBytes(messageHash)
          );
          signature.push(a);
        }

        await examplePool.connect(account1).getFunction("stake")(
          tokenId,
          rarity,
          signature
        );

        expect(await mockCollection.balanceOf(examplePool.target)).equal(
          BigInt(1)
        );
        expect(await mockCollection.ownerOf(1)).to.equal(examplePool.target);
        expect(await examplePool.totalNftCommon()).to.equal(BigInt(1));
        expect(await examplePool.totalNftRare()).to.equal(BigInt(0));
        expect(await examplePool.totalNftSuperRare()).to.equal(BigInt(0));
        expect(await examplePool.nftRarity(1)).to.equal(BigInt(0));
        expect(await examplePool.userStakedNfts(account1.address, 1)).to.eql([
          BigInt(1),
          BigInt(0),
          BigInt(0),
        ]);
        expect(await examplePool.totalNftIsStaked()).to.eql(BigInt(1));
        expect(await examplePool.lastRewardBlock()).not.equal(0);

        expect(await examplePool.balanceOf(account1.address)).to.equal(
          BigInt(1)
        );

        expect(await examplePool.tokensOfOwner(account1.address)).to.eql([
          BigInt(1),
        ]);
      });

      it("Should stake multiple nft", async function () {
        const { examplePool, account1, mockCollection, trustedSigner } =
          await loadFixture(deployExamplePool);

        await mockCollection.connect(account1).getFunction("setApprovalForAll")(
          await examplePool.target,
          true
        );

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

          const signature = await trustedSigner.signMessage(
            ethers.getBytes(messageHash)
          );
          signatures.push(signature);
        }

        // Create the message hash to sign off-chain
        // Assume user has tokenId 1 and rarity is common

        await examplePool.connect(account1).getFunction("stake")(
          tokenIds,
          rarities,
          signatures
        );

        expect(await mockCollection.balanceOf(examplePool.target)).equal(
          BigInt(3)
        );
        expect(await mockCollection.ownerOf(1)).to.equal(examplePool.target);
        expect(await mockCollection.ownerOf(2)).to.equal(examplePool.target);
        expect(await mockCollection.ownerOf(3)).to.equal(examplePool.target);

        expect(await examplePool.totalNftCommon()).to.equal(BigInt(1));
        expect(await examplePool.totalNftRare()).to.equal(BigInt(1));
        expect(await examplePool.totalNftSuperRare()).to.equal(BigInt(1));

        expect(await examplePool.nftRarity(1)).to.equal(BigInt(0));
        expect(await examplePool.nftRarity(2)).to.equal(BigInt(1));
        expect(await examplePool.nftRarity(3)).to.equal(BigInt(2));

        expect(await examplePool.userStakedNfts(account1.address, 1)).to.eql([
          BigInt(1),
          BigInt(0),
          BigInt(0),
        ]);
        expect(await examplePool.userStakedNfts(account1.address, 2)).to.eql([
          BigInt(2),
          BigInt(0),
          BigInt(1),
        ]);
        expect(await examplePool.userStakedNfts(account1.address, 3)).to.eql([
          BigInt(3),
          BigInt(0),
          BigInt(2),
        ]);

        expect(await examplePool.totalNftIsStaked()).to.eql(BigInt(3));
        expect(await examplePool.lastRewardBlock()).not.equal(0);

        expect(await examplePool.balanceOf(account1.address)).to.equal(
          BigInt(3)
        );

        expect(await examplePool.tokensOfOwner(account1.address)).to.eql([
          BigInt(1),
          BigInt(2),
          BigInt(3),
        ]);
      });
    });

    describe("WORST CASE", function () {
      it("It should throw an error if the lengths of tokenIds, rarities, and signatures do not match.", async function () {
        const { examplePool, account1, mockCollection } = await loadFixture(
          deployExamplePool
        );

        await mockCollection.connect(account1).getFunction("setApprovalForAll")(
          await examplePool.target,
          true
        );

        const tokenIds = [1, 2, 3];
        const rarities = [0, 1, 3];
        const signatures: string[] = [];

        await expect(
          examplePool.connect(account1).getFunction("stake")(
            tokenIds,
            rarities,
            signatures
          )
        ).to.revertedWithCustomError(examplePool, "InputError");
      });

      it("It should throw an error if invalid signature.", async function () {
        const { examplePool, account1, mockCollection } = await loadFixture(
          deployExamplePool
        );

        await mockCollection.connect(account1).getFunction("setApprovalForAll")(
          await examplePool.target,
          true
        );

        const messageHash = ethers.keccak256(
          ethers.concat([
            ethers.zeroPadValue(ethers.toBeArray(1), 32), // Pad _tokenId to 32 bytes
            ethers.zeroPadValue(ethers.toBeArray(0), 32), // Pad _rarity to 32 bytes
          ])
        );

        const signature = await account1.signMessage(
          ethers.getBytes(messageHash)
        );

        await expect(
          examplePool.connect(account1).getFunction("stake")(
            [1],
            [0],
            [signature]
          )
        ).to.revertedWithCustomError(examplePool, "InputError");
      });

      it("It should throw an error if not owner stake token.", async function () {
        const { examplePool, account1, trustedSigner } = await loadFixture(
          deployExamplePool
        );

        const messageHash = ethers.keccak256(
          ethers.concat([
            ethers.zeroPadValue(ethers.toBeArray(6), 32), // Pad _tokenId to 32 bytes
            ethers.zeroPadValue(ethers.toBeArray(0), 32), // Pad _rarity to 32 bytes
          ])
        );

        const signature = await trustedSigner.signMessage(
          ethers.getBytes(messageHash)
        );

        await expect(
          examplePool.connect(account1).getFunction("stake")(
            [6],
            [0],
            [signature]
          )
        ).to.be.reverted;
      });

      it("It should throw an error if the owner tries to stake a token that is already staked.", async function () {
        const { examplePool, account1, trustedSigner, mockCollection } =
          await loadFixture(deployExamplePool);

        await mockCollection.connect(account1).getFunction("setApprovalForAll")(
          await examplePool.target,
          true
        );

        const messageHash = ethers.keccak256(
          ethers.concat([
            ethers.zeroPadValue(ethers.toBeArray(5), 32), // Pad _tokenId to 32 bytes
            ethers.zeroPadValue(ethers.toBeArray(0), 32), // Pad _rarity to 32 bytes
          ])
        );

        const signature = await trustedSigner.signMessage(
          ethers.getBytes(messageHash)
        );

        await examplePool.connect(account1).getFunction("stake")(
          [5],
          [0],
          [signature]
        );

        await expect(
          examplePool.connect(account1).getFunction("stake")(
            [5],
            [0],
            [signature]
          )
        ).to.revertedWithCustomError(examplePool, "InputError");
      });
    });
  });

  describe("Claim Reward Process", function () {
    describe("HAPPY CASE", function () {
      it("Should claim reward", async function () {
        const {
          examplePool,
          account1,
          mockCollection,
          trustedSigner,
          mockToken,
        } = await loadFixture(deployExamplePool);

        await mockCollection.connect(account1).getFunction("setApprovalForAll")(
          await examplePool.target,
          true
        );

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

          const signature = await trustedSigner.signMessage(
            ethers.getBytes(messageHash)
          );
          signatures.push(signature);
        }

        await examplePool.connect(account1).getFunction("stake")(
          tokenIds,
          rarities,
          signatures
        );

        await examplePool.connect(account1).getFunction("claim")([1, 2, 3]);

        const balance = await mockToken.balanceOf(account1.address);

        const balanceBigInt = BigInt(balance.toString());

        expect(balanceBigInt).to.equal(
          BigInt((await examplePool.distributeTokenPerBlock()).toString())
        );
      });
    });

    describe("WORST CASE", function () {
      it("It should throw an error if the tokenId mismatch the owner", async function () {
        const {
          examplePool,
          account1,
          mockCollection,
          trustedSigner,
          mockToken,
        } = await loadFixture(deployExamplePool);

        await mockCollection.connect(account1).getFunction("setApprovalForAll")(
          await examplePool.target,
          true
        );

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

          const signature = await trustedSigner.signMessage(
            ethers.getBytes(messageHash)
          );
          signatures.push(signature);
        }

        await examplePool.connect(account1).getFunction("stake")(
          tokenIds,
          rarities,
          signatures
        );

        await expect(
          examplePool.connect(account1).getFunction("claim")([4])
        ).to.revertedWithCustomError(examplePool, "InputError");
      });
    });
  });

  describe("Un-Stake Process", function () {
    describe("HAPPY CASE", function () {
      it("Should un-stake single nft", async function () {
        const {
          examplePool,
          account1,
          mockCollection,
          trustedSigner,
          mockToken,
        } = await loadFixture(deployExamplePool);

        await mockCollection.connect(account1).getFunction("setApprovalForAll")(
          await examplePool.target,
          true
        );

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

          const signature = await trustedSigner.signMessage(
            ethers.getBytes(messageHash)
          );
          signatures.push(signature);
        }

        await examplePool.connect(account1).getFunction("stake")(
          tokenIds,
          rarities,
          signatures
        );

        await examplePool.connect(account1).getFunction("unstake")([2]);

        expect(await mockCollection.balanceOf(examplePool.target)).equal(
          BigInt(2)
        );
        expect(await mockCollection.ownerOf(1)).to.equal(examplePool.target);
        expect(await mockCollection.ownerOf(2)).to.equal(account1.address);
        expect(await mockCollection.ownerOf(3)).to.equal(examplePool.target);

        expect(await examplePool.totalNftCommon()).to.equal(BigInt(1));
        expect(await examplePool.totalNftRare()).to.equal(BigInt(0));
        expect(await examplePool.totalNftSuperRare()).to.equal(BigInt(1));

        expect(await examplePool.nftRarity(1)).to.equal(BigInt(0));
        expect(await examplePool.nftRarity(2)).to.equal(BigInt(0));
        expect(await examplePool.nftRarity(3)).to.equal(BigInt(2));

        expect(await examplePool.userStakedNfts(account1.address, 1)).to.eql([
          BigInt(1),
          BigInt(0),
          BigInt(0),
        ]);
        expect(await examplePool.userStakedNfts(account1.address, 2)).to.eql([
          BigInt(0),
          BigInt(0),
          BigInt(0),
        ]);
        expect(await examplePool.userStakedNfts(account1.address, 3)).to.eql([
          BigInt(3),
          BigInt(0),
          BigInt(2),
        ]);

        expect(await examplePool.totalNftIsStaked()).to.eql(BigInt(2));

        expect(await mockToken.balanceOf(account1.address)).greaterThan(0);
      });

      it("Should un-stake multiple nft", async function () {
        const {
          examplePool,
          account1,
          mockCollection,
          trustedSigner,
          mockToken,
        } = await loadFixture(deployExamplePool);

        await mockCollection.connect(account1).getFunction("setApprovalForAll")(
          await examplePool.target,
          true
        );

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

          const signature = await trustedSigner.signMessage(
            ethers.getBytes(messageHash)
          );
          signatures.push(signature);
        }

        await examplePool.connect(account1).getFunction("stake")(
          tokenIds,
          rarities,
          signatures
        );

        await examplePool.connect(account1).getFunction("unstake")([1, 2, 3]);

        expect(await mockCollection.balanceOf(examplePool.target)).equal(
          BigInt(0)
        );
        expect(await mockCollection.ownerOf(1)).to.equal(account1.address);
        expect(await mockCollection.ownerOf(2)).to.equal(account1.address);
        expect(await mockCollection.ownerOf(3)).to.equal(account1.address);

        expect(await examplePool.totalNftCommon()).to.equal(BigInt(0));
        expect(await examplePool.totalNftRare()).to.equal(BigInt(0));
        expect(await examplePool.totalNftSuperRare()).to.equal(BigInt(0));

        expect(await examplePool.nftRarity(1)).to.equal(BigInt(0));
        expect(await examplePool.nftRarity(2)).to.equal(BigInt(0));
        expect(await examplePool.nftRarity(3)).to.equal(BigInt(0));

        expect(await examplePool.userStakedNfts(account1.address, 1)).to.eql([
          BigInt(0),
          BigInt(0),
          BigInt(0),
        ]);
        expect(await examplePool.userStakedNfts(account1.address, 2)).to.eql([
          BigInt(0),
          BigInt(0),
          BigInt(0),
        ]);
        expect(await examplePool.userStakedNfts(account1.address, 3)).to.eql([
          BigInt(0),
          BigInt(0),
          BigInt(0),
        ]);

        expect(await examplePool.totalNftIsStaked()).to.eql(BigInt(0));

        expect(await mockToken.balanceOf(account1.address)).greaterThan(0);
      });
    });

    describe("WORST CASE", function () {
      it("It should throw an error if the owner tries to un-stake a token that not an owner.", async function () {
        const {
          examplePool,
          account1,
          account2,
          mockCollection,
          trustedSigner,
        } = await loadFixture(deployExamplePool);

        await mockCollection.connect(account1).getFunction("setApprovalForAll")(
          await examplePool.target,
          true
        );

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

          const signature = await trustedSigner.signMessage(
            ethers.getBytes(messageHash)
          );
          signatures.push(signature);
        }

        await examplePool.connect(account1).getFunction("stake")(
          tokenIds,
          rarities,
          signatures
        );

        await expect(
          examplePool.connect(account2).getFunction("unstake")([1])
        ).to.revertedWithCustomError(examplePool, "InputError");
      });
    });
  });
});
