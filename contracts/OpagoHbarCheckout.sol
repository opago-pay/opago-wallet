// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Opago HBAR Checkout
/// @notice Non-custodial, single-use HBAR checkout receipts for Hedera.
/// @dev Hedera exposes msg.value in tinybar. There is no owner, upgrade path,
///      fee, withdrawal function, fallback, or receive function.
contract OpagoHbarCheckout {
    error CheckoutExpired(uint64 expiresAt, uint64 currentTime);
    error ForwardingFailed();
    error IncorrectAmount(uint256 expectedTinybar, uint256 receivedTinybar);
    error InvalidAmount();
    error InvalidMerchant();
    error InvalidPaymentId();
    error PaymentAlreadyProcessed(bytes32 paymentId);
    error PaymentIdMismatch(bytes32 expectedPaymentId, bytes32 suppliedPaymentId);
    error ReentrantCall();

    bytes32 private constant _PAYMENT_DOMAIN =
        0x2cbcc7376617198b16e5d1ca7f3f2c64fb4cefed7bf20cd26d6e5a1af0230d9c;

    struct PaymentRecord {
        address payer;
        address merchant;
        uint256 amountTinybar;
        bytes32 requestNonce;
        uint64 expiresAt;
        uint64 paidAt;
    }

    mapping(bytes32 paymentId => PaymentRecord record) private _payments;
    bool private _entered;

    uint256 public paymentCount;
    uint256 public totalTinybarVolume;

    event PaymentSettled(
        bytes32 indexed paymentId,
        address indexed payer,
        address indexed merchant,
        uint256 amountTinybar,
        bytes32 requestNonce,
        uint64 expiresAt,
        uint64 paidAt
    );

    function checkoutPaymentId(
        bytes32 requestNonce,
        address merchant,
        uint256 expectedAmountTinybar,
        uint64 expiresAt
    ) public view returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                _PAYMENT_DOMAIN,
                block.chainid,
                address(this),
                requestNonce,
                merchant,
                expectedAmountTinybar,
                expiresAt
            )
        );
    }

    function pay(
        bytes32 paymentId,
        bytes32 requestNonce,
        address payable merchant,
        uint256 expectedAmountTinybar,
        uint64 expiresAt
    ) external payable returns (bytes32) {
        if (_entered) revert ReentrantCall();
        if (paymentId == bytes32(0) || requestNonce == bytes32(0)) {
            revert InvalidPaymentId();
        }
        if (
            merchant == address(0) ||
            merchant == address(this) ||
            merchant == msg.sender
        ) revert InvalidMerchant();
        if (expectedAmountTinybar == 0) revert InvalidAmount();

        bytes32 expectedPaymentId = checkoutPaymentId(
            requestNonce,
            merchant,
            expectedAmountTinybar,
            expiresAt
        );
        if (paymentId != expectedPaymentId) {
            revert PaymentIdMismatch(expectedPaymentId, paymentId);
        }
        if (msg.value != expectedAmountTinybar) {
            revert IncorrectAmount(expectedAmountTinybar, msg.value);
        }

        uint64 currentTime = uint64(block.timestamp);
        if (expiresAt <= currentTime) revert CheckoutExpired(expiresAt, currentTime);
        if (_payments[paymentId].payer != address(0)) {
            revert PaymentAlreadyProcessed(paymentId);
        }

        _entered = true;
        _payments[paymentId] = PaymentRecord({
            payer: msg.sender,
            merchant: merchant,
            amountTinybar: msg.value,
            requestNonce: requestNonce,
            expiresAt: expiresAt,
            paidAt: currentTime
        });
        paymentCount += 1;
        totalTinybarVolume += msg.value;

        (bool forwarded, ) = merchant.call{value: msg.value}("");
        if (!forwarded) revert ForwardingFailed();

        _entered = false;
        emit PaymentSettled(
            paymentId,
            msg.sender,
            merchant,
            msg.value,
            requestNonce,
            expiresAt,
            currentTime
        );
        return paymentId;
    }

    function payment(bytes32 paymentId) external view returns (PaymentRecord memory) {
        return _payments[paymentId];
    }

    function isPaymentProcessed(bytes32 paymentId) external view returns (bool) {
        return _payments[paymentId].payer != address(0);
    }
}