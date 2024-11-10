// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Vault is Ownable, ReentrancyGuard {
    IERC20 public immutable token;

    mapping(address => bool) public isWhiteList;

    constructor(IERC20 _token) Ownable(msg.sender) {
        token = _token;
    }

    modifier onlyWhiteList(address _contract) {
        require(
            isWhiteList[_contract],
            "The contract address isn't a whitelist"
        );
        _;
    }

    function addWhiteList(address _contract) external onlyOwner {
        isWhiteList[_contract] = true;
    }

    function removeWhiteList(address _contract) external onlyOwner {
        isWhiteList[_contract] = false;
    }

    function distributeToken(
        address _receiver,
        uint256 _amount
    ) external onlyWhiteList(msg.sender) {
        _safeTokenTransfer(_receiver, _amount);
    }

    function withdrawToken(uint256 _amount) external onlyOwner {
        _safeTokenTransfer(msg.sender, _amount);
    }

    function depositToken(uint256 _amount) external onlyOwner {
        token.transferFrom(msg.sender, address(this), _amount);
    }

    function _safeTokenTransfer(address _to, uint256 _amount) private {
        uint256 OPBTokenBal = token.balanceOf(address(this));

        if (_amount > OPBTokenBal) {
            token.transfer(_to, OPBTokenBal);
        } else {
            token.transfer(_to, _amount);
        }
    }
}
