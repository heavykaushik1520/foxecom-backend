# Delhivery auto shipment – exact flow and why it might not create

## When does shipment get created?

Only **after a successful PayU payment**, when the user is redirected to your success URL and the backend runs the **PayU success callback**.

---

## Exact flow (step by step)

1. **User completes payment on PayU**  
   PayU redirects the browser to:  
   `GET/POST /api/payment/payu-success?udf1=<orderId>&...`

2. **Backend: PayU success callback** (`paymentController.payuSuccessCallback`)
   - Validates PayU hash and reads `orderId` from `udf1`.
   - Loads the order; if already `status = 'paid'`, redirects to frontend and **does not run shipment logic**.
   - Updates order: PayU fields + `status: 'paid'`.
   - Sends response to browser with **`setImmediate(...)`** so the next steps run **in the background after the response**.

3. **Background job (same request, after redirect)**  
   Inside `setImmediate`:
   - Loads full order (with address and items).
   - Sends order confirmation emails (if configured).
   - **Delhivery block:**
     - If **Delhivery is not configured** → logs and exits (no shipment).
     - If configured → calls `createOrderShipment(order)`.

4. **createOrderShipment** (`services/delhivery/orderShipment.js`)
   - **Step A – Prepare (before create):**
     - Reads `order.pinCode` (6 digits).
     - Calls Delhivery **pincode serviceability** for that pincode.
     - If API fails or pincode is **not serviceable** → returns `success: false` with reason (e.g. `"Pincode not serviceable by Delhivery"` or `"Invalid pincode"`). **No shipment is created.**
     - If serviceable → continues.
   - **Step B – Create:**
     - Builds payload (name, address, pin, phone, payment_mode, pickup_location, client, etc.).
     - Calls Delhivery **POST /api/cmu/create.json**.
     - If create fails (auth, client name, validation, etc.) → returns `success: false` with API error. **No shipment is created.**
     - If create succeeds → returns waybill, shipmentId, labelUrl.

5. **Backend: save to DB**
   - If `createOrderShipment` returned `success: true`, backend runs:
     - `Order.update({ shipmentId, awbCode, shippingLabelUrl, shipmentStatus: 'created' }, { where: { id: order.id } })`.
   - If update fails (e.g. missing column), shipment exists at Delhivery but order row is not updated (you’ll see a log about DB update failure).

---

## Why shipment might not be created (and what to check)

| Reason | What you see in backend logs | What to do |
|--------|------------------------------|------------|
| **Delhivery not configured** | `[Delhivery] Skipping auto shipment: not configured` | Set in `.env`: `DELHIVERY_API_KEY`, `DELHIVERY_BASE_URL`, `DELHIVERY_PICKUP_LOCATION` or `DELHIVERY_WAREHOUSE_CODE`. For B2C set `DELHIVERY_CLIENT` (e.g. REDECOMSURFACE-B2C). Restart server. |
| **Order already paid** | No Delhivery log for this request | Shipment runs only when status *changes* to paid. For already-paid orders use admin “Create shipment” API. |
| **Invalid or non-serviceable pincode** | `[Delhivery OrderShipment] Prepare failed` with `error: "Pincode not serviceable by Delhivery"` or `"Invalid pincode"` | Use a real, serviceable 6-digit Indian pincode. Example: test with 400001 (Mumbai). Pincode like `000000` will not be serviceable. |
| **Pincode API / network error** | `[Delhivery OrderShipment] Prepare failed` with error like "Pincode check failed" or API error | Check Delhivery staging URL, API key, and network. |
| **Create API failed** | `[Delhivery] Auto shipment FAILED for order <id> reason: <...>` or `[Delhivery OrderShipment] Create failed` | Check full error (auth, client/pickup name, mandatory fields). Set `DELHIVERY_CLIENT` (e.g. REDECOMSURFACE-B2C) and ensure `DELHIVERY_PICKUP_LOCATION` / `DELHIVERY_WAREHOUSE_CODE` match exactly what is registered with Delhivery (case-sensitive). |
| **DB update failed after create** | `[Delhivery] Shipment created at Delhivery but DB update failed` | Run migrations so `orders` has `shipmentId`, `awbCode`, `shipping_label_url`, `shipmentStatus`. Then for that order you can either re-trigger create or update AWB manually from Delhivery dashboard. |
| **Exception in background job** | `[Delhivery] Error in post-payment job (emails/shipment): <message>` | Fix the reported error (e.g. missing column, bad payload). |

---

## How to see the exact reason for order #16

1. Reproduce with a **new** order (place order → pay with PayU test → success).
2. In the **same terminal where the backend is running**, look for lines right after the PayU success request:
   - `[Delhivery] Creating shipment for order 16 pinCode: XXXXXX`
   - Then either:
     - `[Delhivery] Auto shipment created for order 16 AWB: ...`  
     - or `[Delhivery] Auto shipment FAILED for order 16 reason: <exact reason>`
     - or `[Delhivery OrderShipment] Prepare failed` / `Create failed` with `error: ...`
3. For **already paid** order #16: shipment will not run again automatically. Either:
   - Call admin API to create shipment for that order:  
     `POST /api/shipping/delhivery/shipment/create` with body `{ "orderId": 16 }` (admin auth),  
   - Or create a new test order with a **valid, serviceable pincode** (e.g. 400001) and pay again; then check logs for that order.

---

## Quick checklist

- [ ] `.env` has `DELHIVERY_API_KEY`, `DELHIVERY_BASE_URL`, `DELHIVERY_PICKUP_LOCATION` or `DELHIVERY_WAREHOUSE_CODE`.
- [ ] For B2C: set `DELHIVERY_CLIENT` (e.g. `REDECOMSURFACE-B2C`) for waybill and create API.
- [ ] Optional: `DELHIVERY_ORIGIN_PIN` (warehouse pincode) for TAT (expected delivery days) API.
- [ ] Order pincode is 6 digits and **serviceable** by Delhivery (not e.g. 000000).
- [ ] PayU success callback is hit (user is redirected to success page after payment).
- [ ] Backend logs show either “Creating shipment for order X” or “Skipping auto shipment: not configured”.
- [ ] For already-paid orders, use admin “Create shipment” API to backfill.
