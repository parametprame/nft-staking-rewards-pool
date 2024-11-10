import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers, network } from "hardhat";

describe("Vault", function () {
  async function deployVaultFixture() {
    const [owner, addr1, addr2] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory("MockToken");
    const mockToken = await MockToken.deploy();

    const Vault = await ethers.getContractFactory("Vault");
    const vault = await Vault.deploy(mockToken);

    await mockToken.mint(owner, "100000000000000000000000");

    return {
      owner,
      addr1,
      addr2,
      mockToken,
      vault,
    };
  }

  describe("Whitelist functionality", () => {
    it("should allow the owner to add and remove addresses from the whitelist", async () => {
      const { vault, addr1 } = await loadFixture(deployVaultFixture);

      await vault.addWhiteList(addr1.address);

      expect(await vault.isWhiteList(addr1.address)).to.be.true;

      await vault.removeWhiteList(addr1.address);
      expect(await vault.isWhiteList(addr1.address)).to.be.false;
    });

    it("should prevent non-owners from adding or removing addresses from the whitelist", async () => {
      const { vault, addr1 } = await loadFixture(deployVaultFixture);

      await expect(
        vault.connect(addr1).getFunction("addWhiteList")(addr1.address)
      ).to.be.reverted;

      await expect(
        vault.connect(addr1).getFunction("removeWhiteList")(addr1.address)
      ).to.be.reverted;
    });

    describe("Token distribution", async () => {
      const { vault, mockToken, addr1, addr2 } = await loadFixture(
        deployVaultFixture
      );

      beforeEach(async () => {
        // Deposit some tokens in the vault
        await mockToken.approve(vault.target, ethers.parseUnits("100", 18));
        await vault.depositToken(ethers.parseUnits("100", 18));
      });

      it("should allow whitelisted addresses to distribute tokens", async () => {
        await vault.addWhiteList(addr1.address);

        await vault.connect(addr1).getFunction("distributeToken")(
          addr2.address,
          ethers.parseUnits("50", 18)
        );

        expect(await mockToken.balanceOf(addr2.address)).to.equal(
          ethers.parseUnits("50", 18)
        );
      });

      it("should prevent non-whitelisted addresses from distributing tokens", async () => {
        await expect(
          vault.connect(addr1).getFunction("distributeToken")(
            addr2.address,
            ethers.parseUnits("50", 18)
          )
        ).to.be.revertedWith("The contract address isn't a whitelist");
      });
    });

    describe("Token withdrawal", () => {
      it("should allow the owner to withdraw tokens from the vault", async () => {
        const { vault, mockToken, owner } = await loadFixture(
          deployVaultFixture
        );

        await mockToken.approve(vault.target, ethers.parseUnits("100", 18));
        await vault.depositToken(ethers.parseUnits("100", 18));

        const initialOwnerBalance = await mockToken.balanceOf(owner.address);

        await vault.withdrawToken(ethers.parseUnits("50", 18));

        const finalOwnerBalance = await mockToken.balanceOf(owner.address);
        expect(finalOwnerBalance).to.equal(
          initialOwnerBalance + ethers.parseUnits("50", 18)
        );
      });

      it("should prevent non-owners from withdrawing tokens", async () => {
        const { vault, mockToken, addr1 } = await loadFixture(
          deployVaultFixture
        );

        await mockToken.approve(vault.target, ethers.parseUnits("100", 18));
        await vault.depositToken(ethers.parseUnits("100", 18));

        await expect(
          vault.connect(addr1).getFunction("withdrawToken")(
            ethers.parseUnits("50", 18)
          )
        ).to.be.reverted;
      });
    });

    describe("Token deposit", () => {
      it("should allow the owner to deposit tokens", async () => {
        const { vault, mockToken } = await loadFixture(deployVaultFixture);

        await mockToken.approve(vault.target, ethers.parseUnits("100", 18));
        await vault.depositToken(ethers.parseUnits("100", 18));

        expect(await mockToken.balanceOf(vault.target)).to.equal(
          ethers.parseUnits("100", 18)
        );
      });

      it("should prevent non-owners from depositing tokens", async () => {
        const { vault, mockToken, addr1 } = await loadFixture(
          deployVaultFixture
        );
        await mockToken.connect(addr1).getFunction("approve")(
          vault.target,
          ethers.parseUnits("50", 18)
        );

        await expect(
          vault.connect(addr1).getFunction("depositToken")(
            ethers.parseUnits("50", 18)
          )
        ).to.be.reverted;
      });
    });

    describe("Edge cases", () => {
      it("should handle distributing more tokens than the vault balance", async () => {
        const { vault, mockToken, addr1, addr2, owner } = await loadFixture(
          deployVaultFixture
        );

        await mockToken.approve(vault.target, ethers.parseUnits("100", 18));
        await vault.depositToken(ethers.parseUnits("100", 18));

        await vault.addWhiteList(addr1.address);

        await vault.connect(addr1).getFunction("distributeToken")(
          addr2.address,
          ethers.parseUnits("150", 18)
        );

        // Since balance is only 100, it should transfer only 100
        expect(await mockToken.balanceOf(addr2.address)).to.equal(
          ethers.parseUnits("100", 18)
        );
      });

      it("should handle withdrawing more tokens than the vault balance", async () => {
        const { vault, mockToken, addr1, addr2, owner } = await loadFixture(
          deployVaultFixture
        );

        await mockToken.approve(vault.target, ethers.parseUnits("100", 18));
        await vault.depositToken(ethers.parseUnits("100", 18));

        await vault.withdrawToken(ethers.parseUnits("150", 18));

        // Since balance is only 100, it should transfer only 100
        expect(await mockToken.balanceOf(owner.address)).to.equal(
          ethers.parseUnits("100000", 18)
        );
      });
    });
  });
});
