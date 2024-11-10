//SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "./interfaces/IVault.sol";

contract ExampleNftPool is Ownable, ReentrancyGuard {
    error InputError(string message);

    enum Rarity {
        COMMON,
        RARE,
        SUPER_RARE
    }

    struct NftDetail {
        uint256 tokenId;
        uint256 rewardDebt;
        Rarity rarity;
    }

    IERC721 public immutable nft;
    IVault public immutable vault;

    uint256 public totalNftIsStaked;

    uint256 public lastRewardBlock;

    uint256 public distributeTokenPerBlock = 3e18; // 1 token per block

    uint256 public COMMON_BOOST = 1;
    uint256 public RARE_BOOST = 2;
    uint256 public SUPER_RARE_BOOST = 3;

    uint256 public commonReward;
    uint256 public rareReward;
    uint256 public superRareReward;

    uint256 public totalNftCommon;
    uint256 public totalNftRare;
    uint256 public totalNftSuperRare;

    address public trustedSigner;

    uint256 public maxSupply = 1000;

    mapping(address => mapping(uint256 => NftDetail)) public userStakedNfts; // address => tokenId => NftDetail
    mapping(uint256 => Rarity) public nftRarity; // tokenId => rarity
    mapping(uint256 => uint256) public stakingStartTimes; // tokenId => staking start time

    event NFTStaked(address indexed owner, uint256 tokenId, uint256 date);
    event NFTUnstaked(address indexed owner, uint256 tokenId, uint256 value);
    event ClaimToken(address indexed owner, uint256 amount, uint256 datenit);

    constructor(
        IERC721 _nft,
        IVault _vault,
        address _trustedSigner
    ) Ownable(msg.sender) {
        nft = _nft;
        vault = _vault;
        trustedSigner = _trustedSigner;
    }

    function stake(
        uint256[] calldata _tokenIds,
        uint256[] calldata _rarities,
        bytes[] calldata _signatures
    ) external {
        updatePool();

        if (
            _tokenIds.length != _rarities.length ||
            _tokenIds.length != _signatures.length
        ) {
            revert InputError("mismatched arrays");
        }

        unchecked {
            for (uint256 i = 0; i < _tokenIds.length; ++i) {
                uint256 cacheTokenId = _tokenIds[i];
                uint256 cacheRarity = _rarities[i];
                bytes memory cacheSignature = _signatures[i];

                bool signatureIsValid = _verifySignature(
                    cacheTokenId,
                    cacheRarity,
                    cacheSignature
                );

                if (stakingStartTimes[cacheTokenId] != 0) {
                    revert InputError("NFT is already staked");
                }

                if (!signatureIsValid) {
                    revert InputError("invalid rarity data");
                }

                if (nft.ownerOf(cacheTokenId) != msg.sender) {
                    revert InputError("this token id isn't your token");
                }

                nft.transferFrom(msg.sender, address(this), cacheTokenId);

                (Rarity _rarity, uint256 _rewardDebt) = _getRarityAndRewardDebt(
                    cacheRarity
                );

                if (_rarity == Rarity.COMMON) {
                    totalNftCommon++;
                }
                if (_rarity == Rarity.RARE) {
                    totalNftRare++;
                }
                if (_rarity == Rarity.SUPER_RARE) {
                    totalNftSuperRare++;
                }

                nftRarity[cacheTokenId] = _rarity;

                stakingStartTimes[cacheTokenId] = block.number;

                userStakedNfts[msg.sender][cacheTokenId] = (
                    NftDetail({
                        tokenId: uint256(cacheTokenId),
                        rarity: _rarity,
                        rewardDebt: _rewardDebt
                    })
                );

                emit NFTStaked(msg.sender, cacheTokenId, block.timestamp);
            }
        }

        totalNftIsStaked += _tokenIds.length;
    }

    function unstake(uint256[] calldata _tokenIds) external nonReentrant {
        updatePool();

        unchecked {
            for (uint256 i = 0; i < _tokenIds.length; ++i) {
                uint256 cacheTokenId = _tokenIds[i];

                NftDetail memory nftUser = userStakedNfts[msg.sender][
                    cacheTokenId
                ];

                if (nftUser.tokenId == 0) {
                    revert InputError("not an owner");
                }

                if (nftUser.rarity == Rarity.COMMON) {
                    totalNftCommon--;
                }
                if (nftUser.rarity == Rarity.RARE) {
                    totalNftRare--;
                }
                if (nftUser.rarity == Rarity.SUPER_RARE) {
                    totalNftSuperRare--;
                }

                uint256 reward = getUserRewardByNFT(cacheTokenId);

                _safeTokenTransfer(msg.sender, reward);

                nft.transferFrom(address(this), msg.sender, cacheTokenId);

                delete stakingStartTimes[cacheTokenId];
                delete nftRarity[cacheTokenId];
                delete userStakedNfts[msg.sender][cacheTokenId];

                emit NFTUnstaked(msg.sender, cacheTokenId, block.timestamp);
            }
        }

        totalNftIsStaked -= _tokenIds.length;
    }

    function updatePool() public {
        if (block.number <= lastRewardBlock) {
            return;
        }

        if (totalNftIsStaked == 0) {
            lastRewardBlock = block.number;

            return;
        }

        (
            uint256 commonRewardPerNFT,
            uint256 rareRewardPerNFT,
            uint256 superRareRewardPerNFT
        ) = _calculateReward(totalNftCommon, totalNftRare, totalNftSuperRare);

        commonReward += commonRewardPerNFT;
        rareReward += rareRewardPerNFT;
        superRareReward += superRareRewardPerNFT;

        lastRewardBlock = block.number;
    }

    function claim(uint256[] calldata _tokenIds) external nonReentrant {
        uint256 totalReward;

        updatePool();

        unchecked {
            for (uint256 i = 0; i < _tokenIds.length; ++i) {
                uint256 cacheTokenId = _tokenIds[i];

                Rarity rarity = nftRarity[cacheTokenId];

                NftDetail storage cacheNftDetail = userStakedNfts[msg.sender][
                    cacheTokenId
                ];

                if (cacheNftDetail.tokenId < 1) {
                    revert InputError("token is not staked");
                }

                uint256 reward = getUserRewardByNFT(cacheTokenId);

                totalReward += reward;

                if (rarity == Rarity.COMMON) {
                    cacheNftDetail.rewardDebt = commonReward;
                } else if (rarity == Rarity.RARE) {
                    cacheNftDetail.rewardDebt = rareReward;
                } else if (rarity == Rarity.SUPER_RARE) {
                    cacheNftDetail.rewardDebt = superRareReward;
                }
            }
        }

        _safeTokenTransfer(msg.sender, totalReward);

        emit ClaimToken(msg.sender, totalReward, block.timestamp);
    }

    function emergencyWithdraw(
        uint256[] calldata _tokenIds
    ) external nonReentrant {
        unchecked {
            for (uint256 i = 0; i < _tokenIds.length; ++i) {
                uint256 cacheTokenId = _tokenIds[i];

                NftDetail memory nftUser = userStakedNfts[msg.sender][
                    cacheTokenId
                ];

                if (nftUser.tokenId == 0) {
                    revert InputError("not an owner");
                }

                if (nftUser.rarity == Rarity.COMMON) {
                    totalNftCommon--;
                }
                if (nftUser.rarity == Rarity.RARE) {
                    totalNftRare--;
                }
                if (nftUser.rarity == Rarity.SUPER_RARE) {
                    totalNftSuperRare--;
                }

                delete stakingStartTimes[cacheTokenId];
                delete nftRarity[cacheTokenId];
                delete userStakedNfts[msg.sender][cacheTokenId];

                nft.transferFrom(address(this), msg.sender, cacheTokenId);

                emit NFTUnstaked(msg.sender, cacheTokenId, block.timestamp);
            }
        }

        totalNftIsStaked -= _tokenIds.length;
    }

    function getUserRewardByNFT(
        uint256 _tokenId
    ) public view returns (uint256 reward) {
        Rarity rarity = nftRarity[_tokenId];

        NftDetail memory cacheNftDetail = userStakedNfts[msg.sender][_tokenId];

        uint256 cacheCommonReward = commonReward;
        uint256 cacheRareReward = rareReward;
        uint256 cacheSuperRareReward = superRareReward;

        if (block.number > lastRewardBlock && totalNftIsStaked != 0) {
            (
                uint256 commonRewardPerNFT,
                uint256 rareRewardPerNFT,
                uint256 superRareRewardPerNFT
            ) = _calculateReward(
                    totalNftCommon,
                    totalNftRare,
                    totalNftSuperRare
                );

            cacheCommonReward += commonRewardPerNFT;
            cacheRareReward += rareRewardPerNFT;
            cacheSuperRareReward += superRareRewardPerNFT;
        }

        if (rarity == Rarity.COMMON) {
            reward = cacheCommonReward;
        } else if (rarity == Rarity.RARE) {
            reward = cacheRareReward;
        } else if (rarity == Rarity.SUPER_RARE) {
            reward = cacheSuperRareReward;
        }

        reward = reward - cacheNftDetail.rewardDebt;
    }

    function getUserReward(
        address _owner
    ) public view returns (uint256 totalReward) {
        uint256[] memory tokens = tokensOfOwner(_owner);

        uint256 cacheCommonReward = commonReward;
        uint256 cacheRareReward = rareReward;
        uint256 cacheSuperRareReward = superRareReward;

        if (block.number > lastRewardBlock && totalNftIsStaked != 0) {
            (
                uint256 commonRewardPerNFT,
                uint256 rareRewardPerNFT,
                uint256 superRareRewardPerNFT
            ) = _calculateReward(
                    totalNftCommon,
                    totalNftRare,
                    totalNftSuperRare
                );

            cacheCommonReward += commonRewardPerNFT;
            cacheRareReward += rareRewardPerNFT;
            cacheSuperRareReward += superRareRewardPerNFT;
        }

        for (uint256 i = 0; i < tokens.length; ++i) {
            uint256 cacheTokenId = tokens[i];
            NftDetail memory nftDetail = userStakedNfts[_owner][cacheTokenId];

            if (nftDetail.rarity == Rarity.COMMON) {
                uint256 pending = cacheCommonReward - nftDetail.rewardDebt;
                totalReward += pending;
            }

            if (nftDetail.rarity == Rarity.RARE) {
                uint256 pending = cacheRareReward - nftDetail.rewardDebt;
                totalReward += pending;
            }

            if (nftDetail.rarity == Rarity.SUPER_RARE) {
                uint256 pending = cacheSuperRareReward - nftDetail.rewardDebt;
                totalReward += pending;
            }
        }
    }

    function getMultiplier(
        uint256 _from,
        uint256 _to
    ) public pure returns (uint256) {
        return _to - _from;
    }
    function tokensOfOwner(
        address _owner
    ) public view returns (uint256[] memory) {
        uint256[] memory tempTokens = new uint256[](maxSupply);
        uint256 countNftOfOwner = 0;

        for (uint256 i = 1; i <= maxSupply; ++i) {
            NftDetail memory nftDetail = userStakedNfts[_owner][i];

            if (nftDetail.tokenId != 0) {
                tempTokens[countNftOfOwner] = nftDetail.tokenId;
                countNftOfOwner++;
            }
        }

        uint256[] memory tokens = new uint256[](countNftOfOwner);
        for (uint256 j = 0; j < countNftOfOwner; ++j) {
            tokens[j] = tempTokens[j];
        }

        return tokens;
    }

    function balanceOf(address _owner) public view returns (uint256) {
        uint256 balance = 0;

        for (uint256 i = 1; i <= maxSupply; i++) {
            if (userStakedNfts[_owner][i].tokenId != 0) {
                balance += 1;
            }
        }
        return balance;
    }

    function _calculateReward(
        uint256 _amountCommon,
        uint256 _amountRare,
        uint256 _amountSuperRare
    )
        private
        view
        returns (
            uint256 commonRewardPerNFT,
            uint256 rareRewardPerNFT,
            uint256 superRareRewardPerNFT
        )
    {
        uint256 multiplier = getMultiplier(lastRewardBlock, block.number);

        uint256 reward = distributeTokenPerBlock * multiplier;

        uint256 boostCommon = _amountCommon * COMMON_BOOST;
        uint256 boostRare = _amountRare * RARE_BOOST;
        uint256 boostSuperRare = _amountSuperRare * SUPER_RARE_BOOST;

        uint256 totalBoost = boostCommon + boostRare + boostSuperRare;

        commonRewardPerNFT = reward / totalBoost;
        rareRewardPerNFT = commonRewardPerNFT * RARE_BOOST;
        superRareRewardPerNFT = commonRewardPerNFT * SUPER_RARE_BOOST;
    }

    function _safeTokenTransfer(address _to, uint256 _amount) private {
        vault.distributeToken(_to, _amount);
    }

    function _verifySignature(
        uint256 _tokenId,
        uint256 _rarity,
        bytes memory _signature
    ) private view returns (bool) {
        bytes32 messageHash = keccak256(abi.encodePacked(_tokenId, _rarity));
        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(
            messageHash
        );

        address messageSigner = ECDSA.recover(ethSignedMessageHash, _signature);

        if (messageSigner == trustedSigner) {
            return true;
        } else {
            return false;
        }
    }

    function _getRarityAndRewardDebt(
        uint256 _rarity
    ) private view returns (Rarity, uint256) {
        if (_rarity == 0) {
            return (Rarity.COMMON, commonReward);
        }
        if (_rarity == 1) {
            return (Rarity.RARE, rareReward);
        }
        if (_rarity == 2) {
            return (Rarity.SUPER_RARE, superRareReward);
        }
    }

    // Admin Function
    function setCommonBoost(uint256 _rate) external onlyOwner {
        COMMON_BOOST = _rate;
    }

    function setRareBoost(uint256 _rate) external onlyOwner {
        RARE_BOOST = _rate;
    }

    function setSuperRareBoost(uint256 _rate) external onlyOwner {
        SUPER_RARE_BOOST = _rate;
    }

    function setDistributeToken(
        uint256 _distributeTokenPerBlock
    ) external onlyOwner {
        if (_distributeTokenPerBlock < 1) {
            revert InputError(
                "reward paid per day and per block must be more than 0"
            );
        }

        distributeTokenPerBlock = _distributeTokenPerBlock;
    }

    function setMaxNFTSupply(uint256 _maxSupply) external onlyOwner {
        if (_maxSupply < 1) {
            revert InputError("maxSupply must be more than 0");
        }

        maxSupply = _maxSupply;
    }

    function setTrustedSigner(address _trustedSigner) external onlyOwner {
        trustedSigner = _trustedSigner;
    }
}
