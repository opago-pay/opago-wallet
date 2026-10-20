# App Store screenshot set

Updated 19 October 2026 for the 18 October rejection of iOS 1.0.0 (46), submission `2af73989-d45a-4a68-8636-6678e3dbea67`.

The three Home screenshots (01, 07 and 09) showed the removed Buy action, including the dark-mode image. They have been removed from this folder and the repository gallery. Their originals remain in Git history. No app UI has been painted over or generated.

## Remaining images, in upload order

All six PNGs are English artwork at 1242 × 2688 pixels. Their filenames and printed counters retain the original nine-image sequence; those numbers are artwork identifiers, not App Store upload positions.

1. [Scan a QR code](OPAGO_02_Scan_a_QR_Code_6_5.png)
2. [Check your payment](OPAGO_03_Check_Your_Payment_6_5.png)
3. [Paid. Next.](OPAGO_04_Paid_Next_6_5.png)
4. [Fund your Bitcoin wallet](OPAGO_05_Fund_Your_Bitcoin_Wallet_6_5.png)
5. [Top up via Lightning](OPAGO_06_Top_Up_Lightning_6_5.png)
6. [Receive HBAR](OPAGO_08_Receive_HBAR_6_5.png)

Visual review confirmed that these six images contain no Buy action or purchase offer. This is a correction of the existing set, not a fresh capture from a new signed build.

## App Store Connect follow-up

- Remove the old images 01, 07 and 09 from every screenshot set where they were uploaded, including localized or custom product pages if present. Repository changes do not update App Store Connect.
- Compare the remaining images with the final signed build and select the matching screenshot size slot. Check the description, promotional text, previews and release notes for purchase claims too.
- If a Home screenshot is needed, capture it from the current iOS app, which shows Receive and Send, using controlled test data. Do not reconstruct the app UI in an image editor.
- Submit a new iOS build containing the camera permission fix. Confirm that Send → scanner shows Continue before the system prompt, and that denial leaves Paste and Type available.

See the [submission package](../app-store-submission-package.md) and [iOS release checklist](../ios-audit-release-checklist.md).
