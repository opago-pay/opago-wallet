// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract RevertingMerchant {
    receive() external payable {
        revert("merchant rejected payment");
    }
}
