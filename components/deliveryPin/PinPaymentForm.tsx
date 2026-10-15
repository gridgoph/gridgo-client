import { QrTopUpForm } from "@/components/QrTopUpForm";
import * as api from "@/lib/api";
import { usePinPayment } from "@/store/checkoutPayment";

type Props = {
  orderId: string;
  pin: api.DeliveryPin;
  change: api.DeliveryPinChange;
  /** The one yellow control on the screen, unless something else holds it. */
  primary: boolean;
  onSaved: (pin: api.DeliveryPin) => void;
  onConflict: () => void;
};

/**
 * The QR transfer for a dearer pin, sent to the pin's own route. Sending it is
 * not paying — Operations still matches it against GRIDGO's wallet before the
 * pin moves.
 */
export function PinPaymentForm({ orderId, pin, change, primary, onSaved, onConflict }: Props) {
  return (
    <QrTopUpForm
      draftKey={`pin:${orderId}:${change.id}`}
      draft={usePinPayment}
      amountMinor={change.feeDifferenceMinor}
      rejectionReason={change.rejectionReason}
      paymentKind="pin"
      afterConfirmed="Your new pin is saved once Operations verifies the transfer."
      primary={primary}
      send={async (input, key) => {
        onSaved(await api.submitDeliveryPinPayment(orderId, { expectedVersion: pin.version, ...input }, key));
      }}
      onConflict={onConflict}
    />
  );
}
