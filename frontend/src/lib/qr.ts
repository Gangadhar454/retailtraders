import QRCode from "qrcode";

/**
 * Renders a UPI payment intent as a QR data URL.
 *
 * The QR encodes a plain `upi://pay` intent, so scanning it opens the
 * supporter's UPI app directly. No money flows through this site.
 */
export async function generateUpiQrDataUrl(
  upiId: string,
  payeeName?: string,
  amount?: number,
  note?: string,
  width = 512,
): Promise<string> {
  const params = new URLSearchParams();
  params.set("pa", upiId);
  if (payeeName) params.set("pn", payeeName.slice(0, 48));
  if (amount && amount > 0) params.set("am", amount.toFixed(2));
  params.set("cu", "INR");
  if (note) params.set("tn", note.slice(0, 48));

  const payload = `upi://pay?${params.toString()}`;

  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width,
    color: {
      dark: "#05060a",
      light: "#ffffff",
    },
  });
}
