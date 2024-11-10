// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IVault {
    function distributeToken(address _receiver, uint256 _amount) external;
}
