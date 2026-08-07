// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract ReentrantMerchant {
    address private _target;
    bytes private _callData;

    bool public attempted;
    bytes4 public observedError;

    function configure(address target, bytes calldata callData) external {
        _target = target;
        _callData = callData;
    }

    receive() external payable {
        attempted = true;
        (bool succeeded, bytes memory result) = _target.call(_callData);
        require(!succeeded, "reentry unexpectedly succeeded");
        if (result.length >= 4) {
            bytes4 selector;
            assembly {
                selector := mload(add(result, 32))
            }
            observedError = selector;
        }
    }
}