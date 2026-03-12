const PDFDocument = require("pdfkit");

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
    orderNumber: order?.id ? `#${order.id}` : "",
    foxecomIp: firstLine?.sku || "",
    awb: order?.awbCode || "",
    customerName: `${order?.firstName || ""} ${order?.lastName || ""}`.trim(),
    customerAddress: {
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

      doc.fontSize(16).font("Helvetica-Bold").text("CUSTOMER INVOICE", {
        align: "left",
      });

      doc.moveDown(0.5);
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .text("Shipped By:", {
          align: "left",
        });
      doc
        .moveDown(0.2)
        .font("Helvetica")
        .text(invoice.shippedBy, {
          align: "left",
        });

      doc.moveDown(1);

      const leftX = doc.x;
      const rightX = 320;

      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .text("Invoice Date:", leftX, doc.y);
      doc
        .font("Helvetica")
        .text(
          invoice.invoiceDate.toLocaleDateString("en-IN"),
          leftX + 80,
          doc.y - 12
        );

      doc
        .font("Helvetica-Bold")
        .text("Deliver Date:", leftX, doc.y + 8);
      doc.font("Helvetica").text("-", leftX + 80, doc.y - 12);

      doc
        .font("Helvetica-Bold")
        .text("Order No:", rightX, doc.y - 8);
      doc.font("Helvetica").text(invoice.orderNumber, rightX + 70, doc.y - 12);

      doc
        .font("Helvetica-Bold")
        .text("FOXECOM IP:", rightX, doc.y + 8);
      doc.font("Helvetica").text(invoice.foxecomIp || "-", rightX + 70, doc.y - 12);

      doc
        .font("Helvetica-Bold")
        .text("AWB / Waybill:", rightX, doc.y + 8);
      doc.font("Helvetica").text(invoice.awb || "-", rightX + 70, doc.y - 12);

      doc.moveDown(2);

      doc
        .fontSize(10)
        .font("Helvetica-Bold")
        .text("Bill To:", leftX, doc.y);
      doc.font("Helvetica");
      doc.text(invoice.customerName || "Customer");
      doc.text(invoice.customerAddress.fullAddress);
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

