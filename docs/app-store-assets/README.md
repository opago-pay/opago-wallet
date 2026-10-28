# App Store screenshot set

Updated 20 October 2026 for the 18 October rejection of iOS 1.0.0 (46), submission `2af73989-d45a-4a68-8636-6678e3dbea67`.

The old Home screenshots (01, 07 and 09) showed the removed Buy action. Images 01 and 09 are now restored with the current light and dark iPhone screenshots supplied by Fabian on 20 October. Their original marketing backgrounds, English headlines and phone frames are preserved. Image 07 remains excluded because no current capture with the coin list expanded was supplied.

## Remaining images, in upload order

All eight finished PNGs are 1242 × 2688 pixels. The new Home captures show the actual German UI; the marketing headlines and the six other images remain English. The app text has not been translated or retouched. Filenames and printed counters retain the original nine-image sequence; those numbers are artwork identifiers, not App Store upload positions.

1. [Bitcoin for everyday life — updated light Home](OPAGO_01_Bitcoin_for_Everyday_Life_6_5.png)
2. [Scan a QR code](OPAGO_02_Scan_a_QR_Code_6_5.png)
3. [Check your payment](OPAGO_03_Check_Your_Payment_6_5.png)
4. [Paid. Next.](OPAGO_04_Paid_Next_6_5.png)
5. [Fund your Bitcoin wallet](OPAGO_05_Fund_Your_Bitcoin_Wallet_6_5.png)
6. [Top up via Lightning](OPAGO_06_Top_Up_Lightning_6_5.png)
7. [Receive HBAR](OPAGO_08_Receive_HBAR_6_5.png)
8. [Self-custodial. Your money. — updated dark Home](OPAGO_09_Self_Custodial_Your_Money_6_5.png)

Visual review confirmed that these eight images contain no Buy action or purchase offer. The supplied captures show Receive and Send only.

## Source captures and composition

- [Light Home](sources/home-light.png): unchanged copy of `IMG_0445.png`, 1260 × 2736.
- [Dark Home](sources/home-dark.png): unchanged copy of `IMG_0444.png`, 1260 × 2736.
- These source files are retained for future composition, not additional App Store upload images.
- For the final PNGs, each source was proportionally resized into the existing 805 × 1749 screen aperture at (219, 843), with rounded corners. All pixels outside that aperture are unchanged from the original artwork in commit `2fe7a53`. Balances, activity, German labels and status bars come from the supplied captures.
- Imagegen was used to preview the replacement with the instruction “replace only the phone-screen interior; preserve the original background, headlines, frame and all supplied UI text and values.” The final files use direct ImageMagick composition of the supplied captures and original artwork to preserve their pixels; generated previews are not included.

## App Store Connect follow-up

- Replace old images 01 and 09 with these updated versions and remove old image 07 from every affected screenshot set, including localized or custom product pages if present. Repository changes do not update App Store Connect.
- Compare the images with the final signed build and select the matching screenshot size slot and locale. Check the description, promotional text, previews and release notes for purchase claims too.
- Submit a new iOS build containing the camera permission fix. Confirm that Send → scanner shows Continue before the system prompt, and that denial leaves Paste and Type available.

See the [submission package](../app-store-submission-package.md) and [iOS release checklist](../ios-audit-release-checklist.md).
