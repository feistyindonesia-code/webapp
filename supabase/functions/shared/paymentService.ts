/**
 * Payment Service - Shared service layer for payment operations
 */

export interface PaymentRequest {
  order_id: string;
}

export interface PaymentResponse {
  success: boolean;
  payment_url?: string;
  payment_reference?: string;
  message?: string;
}

export async function createPayment(orderId: string, supabaseUrl: string): Promise<PaymentResponse> {
  const response = await fetch(`${supabaseUrl}/functions/v1/create-payment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ order_id: orderId })
  });

  return await response.json();
}

export function redirectToPayment(paymentUrl: string) {
  window.location.href = paymentUrl;
}
