//SPDX-License-Identifier: Unlicense

pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    constructor() ERC20("MockOP Token", "OP") {}

    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }
}
