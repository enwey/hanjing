const submitted = new Set();
const flights = new Set();

function acquire(appointmentId) {
  const key = String(appointmentId);
  if (flights.has(key)) return null;
  flights.add(key);
  return () => flights.delete(key);
}
const prefix = 'rewrite_appointment_payment_submitted:';

function hasSubmitted(appointmentId) {
  const key = prefix + appointmentId;
  if (submitted.has(key)) return true;
  try { return wx.getStorageSync(key) === true; } catch (_) { return false; }
}

function markSubmitted(appointmentId) {
  const key = prefix + appointmentId;
  submitted.add(key);
  try { wx.setStorageSync(key, true); } catch (_) {
    // Keep the in-memory receipt so a storage failure does not interrupt payment confirmation.
  }
}

async function preparePayment(api, appointmentId, isCurrent) {
  try {
    return await api.payAppointmentDeposit(appointmentId);
  } catch (error) {
    if (error?.data?.code !== 'ORDERPAID' && !/^(?:微信|商户)?订单已支付(?:[，。！]|$)/.test(error?.message || '')) throw error;
    if (!isCurrent()) return null;
    markSubmitted(appointmentId);
    await api.confirmAppointmentPayment(appointmentId);
    return { alreadyPaid: true };
  }
}

module.exports = { acquire, hasSubmitted, markSubmitted, preparePayment };
