const PDFDocument = require("pdfkit");
const { getOrderDisplayId, buildOrderNumber } = require("./orderNumberHelper");

const GST_RATE = 0.18;

const SHIPPED_BY_TEXT =
  "REDECOM Tech Labs Pvt. Ltd., Delhi NCR | GSTN: 09AANCR6672DIZY | Email: foxecom99@gmail.com";

function safeNumber(value, fallback = 0) {
  const num = parseFloat(value);
  return Number.isFinite(num) ? num : fallback;
}

function computeInvoiceLines(orderItems = []) {
  const lines = [];
  let subtotal = 0;
  let gstTotal = 0;
  let grandTotal = 0;

  for (const item of orderItems) {
    const qty = safeNumber(item.quantity, 0);
    const sellingPricePerUnit = safeNumber(item.priceAtPurchase, 0); // assumed GST inclusive

    if (!qty || !sellingPricePerUnit) continue;

    const basePrice = sellingPricePerUnit / (1 + GST_RATE);
    const gstPerUnit = sellingPricePerUnit - basePrice;
    const lineBase = basePrice * qty;
    const lineGst = gstPerUnit * qty;
    const lineTotal = sellingPricePerUnit * qty;

    subtotal += lineBase;
    gstTotal += lineGst;
    grandTotal += lineTotal;

    lines.push({
      quantity: qty,
      title: item.product?.title || "Product",
      sku: item.product?.sku || "",
      unitPrice: basePrice,
      gstRate: GST_RATE * 100,
      gstAmountPerUnit: gstPerUnit,
      lineTotal,
    });
  }

  return {
    lines,
    totals: {
      subtotal,
      gstTotal,
      grandTotal,
    },
  };
}

function formatCurrency(amount) {
  const n = safeNumber(amount, 0);
  return `Rs. ${n.toFixed(2)}`;
}

function buildInvoiceMeta(order, orderItems = []) {
  const { lines, totals } = computeInvoiceLines(orderItems);
  const firstLine = lines[0];
  const discountAmount = safeNumber(order?.discountAmount, 0);
  const orderSubtotal = safeNumber(order?.subtotal, null);
  const orderTotal = safeNumber(order?.totalAmount, totals.grandTotal);
  // Use order's subtotal when available (matches backend); otherwise use computed total before discount
  const amountBeforeDiscount = orderSubtotal !== null && orderSubtotal > 0
    ? orderSubtotal
    : totals.grandTotal;
  // Grand total = final amount paid (always from order when available)
  const grandTotal = orderTotal;

  // Offer label for discount line (e.g. "UPI 10% (2nd purchase)")
  let discountLabel = "Offer / UPI Discount";
  if (discountAmount > 0 && order?.upiDiscountPercent) {
    const pct = order.upiDiscountPercent;
    const nth = order.orderNumberForUser === 2 ? "2nd" : order.orderNumberForUser === 3 ? "3rd" : "";
    discountLabel = nth ? `UPI Discount (${pct}% - ${nth} purchase)` : `UPI Discount (${pct}%)`;
  }

  return {
    shippedBy: SHIPPED_BY_TEXT,
    invoiceDate: order?.createdAt ? new Date(order.createdAt) : new Date(),
    deliveryDate: null,
    orderNumber: (() => {
      if (!order) return "";
      if (order.orderNumber) return `#${order.orderNumber}`;
      if (order.id != null && order.createdAt) {
        // Build order number from SKU_LAST4/DDMMYYYY/orderId.
        const firstSku = firstLine?.sku || "";
        return `#${buildOrderNumber(order.id, order.createdAt, firstSku)}`;
      }
      return `#${getOrderDisplayId(order)}`;
    })(),
    foxecomIp: firstLine?.sku || "",
    awb: order?.awbCode || order?.awb || order?.waybill || "",
    customerName: `${order?.firstName || ""} ${order?.lastName || ""}`.trim(),
    customerAddress: {
      flatNumber: order?.flatNumber || "",
      buildingName: order?.buildingName || "",
      fullAddress: order?.fullAddress || "",
      townOrCity: order?.townOrCity || "",
      state: order?.state || "",
      country: order?.country || "",
      pinCode: order?.pinCode || "",
      mobileNumber: order?.mobileNumber || "",
      emailAddress: order?.emailAddress || "",
    },
    lines,
    totals: {
      ...totals,
      amountBeforeDiscount,
      discountAmount,
      discountLabel,
      grandTotal,
    },
  };
}

function createInvoicePdf(order, orderItems = []) {
  return new Promise((resolve, reject) => {
    try {
      const invoice = buildInvoiceMeta(order, orderItems);
      const doc = new PDFDocument({ size: "A4", margin: 40 });

      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (err) => reject(err));

      const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const leftX = doc.page.margins.left;
      const safeWidth = pageWidth - 20;

      doc.fontSize(14).font("Helvetica-Bold");
      doc.text("CUSTOMER INVOICE", leftX, doc.y, { width: safeWidth });
      doc.moveDown(0.4);

      doc.fontSize(10).font("Helvetica-Bold").text("Order Number: ", { continued: true });
      doc.font("Helvetica").text(invoice.orderNumber || "-");
      doc.moveDown(0.5);

      doc.fontSize(9).font("Helvetica-Bold").text("Shipped By:", { width: safeWidth });
      doc.moveDown(0.2).font("Helvetica").text(invoice.shippedBy, { width: safeWidth });

      doc.moveDown(1);

      const rightX = leftX + 300;
      const labelWidth = 90;
      let headerY = doc.y;

      doc.fontSize(9).font("Helvetica-Bold").text("Invoice Date:", leftX, headerY);
      doc.font("Helvetica").text(invoice.invoiceDate.toLocaleDateString("en-IN"), leftX + labelWidth, headerY);

      doc.font("Helvetica-Bold").text("Deliver Date:", leftX, headerY + 14);
      doc.font("Helvetica").text("-", leftX + labelWidth, headerY + 14);

      doc.font("Helvetica-Bold").text("Order Number:", rightX, headerY);
      doc.font("Helvetica").text(invoice.orderNumber || "-", rightX + labelWidth, headerY, { width: 120 });

      doc.font("Helvetica-Bold").text("FOXECOM IP:", rightX, headerY + 14);
      doc.font("Helvetica").text(invoice.foxecomIp || "-", rightX + labelWidth, headerY + 14);

      doc.font("Helvetica-Bold").text("AWB / Waybill:", rightX, headerY + 28);
      doc.font("Helvetica").text(invoice.awb || "-", rightX + labelWidth, headerY + 28);

      doc.y = headerY + 42;
      doc.moveDown(1);

      doc.fontSize(10).font("Helvetica-Bold").text("Bill To:", leftX, doc.y);
      doc.moveDown(0.3).font("Helvetica");
      doc.text(invoice.customerName || "Customer");
      doc.text(`Flat / Door No: ${(invoice.customerAddress.flatNumber || "").trim() || "—"}`);
      doc.text(`Building / Society: ${(invoice.customerAddress.buildingName || "").trim() || "—"}`);
      doc.text(invoice.customerAddress.fullAddress || "—");
      doc.text(
        `${invoice.customerAddress.townOrCity}, ${invoice.customerAddress.state} - ${invoice.customerAddress.pinCode}`
      );
      doc.text(invoice.customerAddress.country);
      doc.text(`Phone: ${invoice.customerAddress.mobileNumber}`);
      doc.text(`Email: ${invoice.customerAddress.emailAddress}`);

      doc.moveDown(1.5);

      const tableTop = doc.y;
      const colX = {
        qty: leftX,
        desc: leftX + 60,
        unitPrice: leftX + 260,
        gst: leftX + 340,
        lineTotal: leftX + 420,
      };

      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("Quantity", colX.qty, tableTop)
        .text("Item Description", colX.desc, tableTop)
        .text("Unit Price", colX.unitPrice, tableTop, { width: 70, align: "right" })
        .text("GST %", colX.gst, tableTop, { width: 40, align: "right" })
        .text("Line Total", colX.lineTotal, tableTop, {
          width: 80,
          align: "right",
        });

      doc
        .moveTo(leftX, tableTop - 4)
        .lineTo(550, tableTop - 4)
        .stroke();
      doc
        .moveTo(leftX, tableTop + 14)
        .lineTo(550, tableTop + 14)
        .stroke();

      let rowY = tableTop + 24;
      doc.font("Helvetica").fontSize(9);
      invoice.lines.forEach((line) => {
        const rowHeight = 18;

        if (rowY + rowHeight > doc.page.height - 100) {
          doc.addPage();
          rowY = doc.y + 20;
        }

        doc.text(String(line.quantity), colX.qty, rowY);
        doc.text(line.title, colX.desc, rowY, { width: 180 });
        doc.text(formatCurrency(line.unitPrice), colX.unitPrice, rowY, {
          width: 70,
          align: "right",
        });
        doc.text(`${line.gstRate.toFixed(0)}%`, colX.gst, rowY, {
          width: 40,
          align: "right",
        });
        doc.text(formatCurrency(line.lineTotal), colX.lineTotal, rowY, {
          width: 80,
          align: "right",
        });

        rowY += rowHeight;
      });

      doc.moveTo(leftX, rowY).lineTo(550, rowY).stroke();

      const totalsY = rowY + 10;
      const labelX = colX.lineTotal - 80;
      let totalRow = 0;

      doc.font("Helvetica-Bold");
      doc.text("Subtotal:", labelX, totalsY + totalRow * 14, { width: 80, align: "right" });
      totalRow++;
      doc.text("GST (18%):", labelX, totalsY + totalRow * 14, {
        width: 80,
        align: "right",
      });
      totalRow++;
      if (invoice.totals.discountAmount > 0) {
        doc.text(invoice.totals.discountLabel || "Offer / UPI Discount:", labelX, totalsY + totalRow * 14, {
          width: 80,
          align: "right",
        });
        totalRow++;
      }
      doc.text("Grand Total:", labelX, totalsY + totalRow * 14, {
        width: 80,
        align: "right",
      });

      doc.font("Helvetica");
      totalRow = 0;
      doc.text(formatCurrency(invoice.totals.subtotal), colX.lineTotal, totalsY + totalRow * 14, {
        width: 80,
        align: "right",
      });
      totalRow++;
      doc.text(
        formatCurrency(invoice.totals.gstTotal),
        colX.lineTotal,
        totalsY + totalRow * 14,
        {
          width: 80,
          align: "right",
        }
      );
      totalRow++;
      if (invoice.totals.discountAmount > 0) {
        doc.text(
          `-${formatCurrency(invoice.totals.discountAmount)}`,
          colX.lineTotal,
          totalsY + totalRow * 14,
          { width: 80, align: "right" }
        );
        totalRow++;
      }
      doc.text(
        formatCurrency(invoice.totals.grandTotal),
        colX.lineTotal,
        totalsY + totalRow * 14,
        {
          width: 80,
          align: "right",
        }
      );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  buildInvoiceMeta,
  createInvoicePdf,
  computeInvoiceLines,
};

