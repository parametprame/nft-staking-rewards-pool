// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockCollection is ERC721Enumerable {
    address public controllerCall;

    string public baseURI = "";
    string public baseExtension = ".json";
    bool public paused = false;

    constructor() ERC721("MOCK COLLECTION", "MOCK NFT") {}

    // internal
    function _baseURI() internal view virtual override returns (string memory) {
        return baseURI;
    }

    // external
    function mintToken(address minter, uint256 tokenId) external {
        _mint(minter, tokenId);
    }

    //Public Function
    function walletOfOwner(
        address _owner
    ) public view returns (uint256[] memory) {
        uint256 ownerTokenCount = balanceOf(_owner);
        uint256[] memory tokenIds = new uint256[](ownerTokenCount);
        for (uint256 i; i < ownerTokenCount; i++) {
            tokenIds[i] = tokenOfOwnerByIndex(_owner, i);
        }
        return tokenIds;
    }
}
