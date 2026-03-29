const PDFDocument = require("pdfkit");
const path = require("path");
const fs = require("fs");
const { getOrderDisplayId } = require("./orderNumberHelper");

const generateInvoiceBuffer = (order, orderItems) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const logoPath = path.join(__dirname, "../assets/logo-2.png");
    try {
        const logoBoxWidth = 110;
        const logoBoxHeight = 34;
        const rightEdge = doc.page.width - doc.page.margins.right;
        const logoX = rightEdge - logoBoxWidth;
        const logoY = Math.max(doc.page.margins.top, 18);
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, logoX, logoY, {
            fit: [logoBoxWidth, logoBoxHeight], // preserve aspect ratio
            align: "right",
            valign: "top",
          });
        }
    } catch (error) {
        console.error("Error loading logo image:", error);
        doc.fontSize(10).text("Company Logo", 50, 30);
    }

    doc.moveDown(4);

    doc.fontSize(24).font("Helvetica-Bold").text("Invoice", { align: "center" });
    doc.moveDown(2); 

    const detailLeftX = 50;
    doc.fontSize(12).font("Helvetica");

    let currentY = doc.y;
    doc.font("Helvetica-Bold").text(`Order Number:`, detailLeftX, currentY);
    doc.font("Helvetica-Bold").text(getOrderDisplayId(order) || String(order.id), detailLeftX + 120, currentY); 

    currentY = doc.y;
    doc.font("Helvetica-Bold").text(`Customer:`, detailLeftX, currentY);
    doc.font("Helvetica").text(`${order.firstName} ${order.lastName}`, detailLeftX + 80, currentY);

    currentY = doc.y;
    doc.font("Helvetica-Bold").text(`Email:`, detailLeftX, currentY);
    doc.font("Helvetica").text(`${order.emailAddress}`, detailLeftX + 80, currentY);

    currentY = doc.y;
    doc.font("Helvetica-Bold").text(`Mobile:`, detailLeftX, currentY);
    doc.font("Helvetica").text(`${order.mobileNumber}`, detailLeftX + 80, currentY);

    currentY = doc.y;
    doc.font("Helvetica-Bold").text(`Address:`, detailLeftX, currentY);

    const addressParts = [];
    if (order.flatNumber) {
      addressParts.push(`Flat: ${order.flatNumber}`);
    }
    if (order.buildingName) {
      addressParts.push(order.buildingName);
    }
    addressParts.push(`${order.fullAddress}, ${order.townOrCity}, ${order.state} - ${order.pinCode}, ${order.country}`);

    doc.font("Helvetica").text(
        addressParts.join(", "),
        detailLeftX + 80, currentY, { width: doc.page.width - detailLeftX - 80 - 50, align: "left" }
    );
    doc.moveDown(2); 

    const tableLeftX = 50;
    const tableRightX = doc.page.width - 50; 

    const productColWidth = 250;
    const qtyColWidth = 70;
    const priceColWidth = 100;

    const qtyX = tableLeftX + productColWidth + 20; 
    const priceX = qtyX + qtyColWidth + 20;

    const getRightAlignedX = (text, columnStartX, columnWidth) => {
        return columnStartX + columnWidth - doc.widthOfString(text);
    };

    doc.font("Helvetica-Bold");
    currentY = doc.y;
    doc.text("Product", tableLeftX, currentY);
    doc.text("Qty", getRightAlignedX("Qty", qtyX, qtyColWidth), currentY);
    doc.text("Price (INR)", getRightAlignedX("Price (INR)", priceX, priceColWidth), currentY);
    doc.moveDown(0.5); 

    doc
      .strokeColor("#aaaaaa")
      .lineWidth(1)
      .moveTo(tableLeftX, doc.y)
      .lineTo(tableRightX, doc.y)
      .stroke();
    doc.moveDown(0.5); // Space after the line

    // Table Rows
    doc.font("Helvetica");
    orderItems.forEach((item) => {
      currentY = doc.y;
      doc.text(item.product.name, tableLeftX, currentY, { width: productColWidth });
      doc.text(item.quantity.toString(), getRightAlignedX(item.quantity.toString(), qtyX, qtyColWidth), currentY);

      const formattedPrice = `INR ${parseFloat(item.priceAtPurchase).toFixed(2)}`;
      doc.text(formattedPrice, getRightAlignedX(formattedPrice, priceX, priceColWidth), currentY);
      doc.moveDown(0.75); 
    });

    doc
      .strokeColor("#aaaaaa")
      .lineWidth(1)
      .moveTo(tableLeftX, doc.y)
      .lineTo(tableRightX, doc.y)
      .stroke();
    doc.moveDown(1.1);

    const signPath = path.join(__dirname, "../assets/sign.png");
    const signWidth = 120;
    const signHeight = 42;
    const signY = doc.y;
    if (fs.existsSync(signPath)) {
      doc.image(signPath, tableLeftX, signY, {
        fit: [signWidth, signHeight],
        align: "left",
        valign: "top",
      });
    }
    doc
      .fontSize(10)
      .font("Helvetica")
      .text("for foxecom.in", tableLeftX, signY + signHeight + 8, {
        width: signWidth,
        align: "left",
      });
    doc.y = signY + signHeight + 30;

    
    const totalTextLabel = "Total Paid:";
  
    const totalAmountValue = `INR ${parseFloat(order.totalAmount).toFixed(2)}`;

    doc.font("Helvetica-Bold");
    const totalAmountX = tableRightX - doc.widthOfString(totalAmountValue);
    const totalLabelX = totalAmountX - doc.widthOfString(totalTextLabel) - 10; // 10px spacing between label and value

    doc.text(totalTextLabel, totalLabelX, doc.y);
    doc.text(totalAmountValue, totalAmountX, doc.y);

    doc.end();
  });
};

module.exports = generateInvoiceBuffer;