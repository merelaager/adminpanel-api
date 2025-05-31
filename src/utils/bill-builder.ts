import fs from "fs";
import PDFDoc from "pdfkit";

import prisma from "./prisma";
import PDFDocument = PDFKit.PDFDocument;
import PDFDocumentOptions = PDFKit.PDFDocumentOptions;

type CamperBillData = {
  name: string;
  isOld: boolean;
  shiftNr: number;
  priceToPay: number;
};

type Contact = {
  name: string;
  email: string;
};

const SIDE_MARGIN = 60;
const CONTENT_TOP = 60;
const CONTENT_BOTTOM = 40;
const LOGO_WIDTH = 60;

const FONT_PRIMARY = "Helvetica";
const FONT_PRIMARY_BOLD = "Helvetica-Bold";

const DATE_LOCALE = "et";
const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  month: "2-digit",
  day: "2-digit",
  year: "numeric",
};

const BILL_META: PDFDocumentOptions = {
  size: "A4",
  info: {
    Title: "Makseteatis",
    Author: "Laoküla merelaager",
  },
  margins: {
    top: CONTENT_TOP,
    left: SIDE_MARGIN,
    right: SIDE_MARGIN,
    bottom: CONTENT_BOTTOM,
  },
};

const getBillDeadline = async (shiftNumbers: number[]) => {
  // Compute the deadline which is one month before the start of the first shift.
  let firstShift = 10;
  shiftNumbers.forEach((shiftNr) => {
    if (shiftNr < firstShift) firstShift = shiftNr;
  });

  const shiftStartDate = (
    await prisma.shiftInfo.findUnique({
      where: { id: firstShift },
      select: { startDate: true },
    })
  )?.startDate;

  if (!shiftStartDate) {
    // Also happens if the list of shift numbers is empty, but it is the caller's
    // responsibility to ensure that a non-empty list is passed.
    throw new Error(`Found no shift with number '${firstShift}'`);
  }

  return new Date(
    shiftStartDate.getUTCFullYear(),
    shiftStartDate.getUTCMonth() - 1,
    shiftStartDate.getUTCDate(), // It is fine if the date overflows by a day.
  );
};

/**
 * Create a bill for the campers.
 *
 * @param registeredCampers A non-empty list of campers
 * @param contact The contact details of the recipient
 * @param billNr The bill number
 */
export const generateBillPdf = async (
  registeredCampers: CamperBillData[],
  contact: Contact,
  billNr: number,
) => {
  const doc = new PDFDoc(BILL_META);

  const oneThird = (doc.page.width - SIDE_MARGIN * 2 - 10) / 3;

  const billName = `${billNr}.pdf`;
  const regCount = registeredCampers.length;

  const writeStream = fs.createWriteStream(`./data/arved/${billName}`);
  doc.pipe(writeStream);

  // ML logo
  doc.image(
    "./media/files/bluelogo.png",
    doc.page.width - SIDE_MARGIN - LOGO_WIDTH,
    CONTENT_TOP / 2,
    { width: LOGO_WIDTH },
  );

  // Target name
  doc
    .fontSize(22)
    .font(FONT_PRIMARY_BOLD)
    .text(contact.name, SIDE_MARGIN, CONTENT_TOP);
  doc.fontSize(11).font(FONT_PRIMARY).text(contact.email);

  // Bill details
  const billTop = CONTENT_TOP + 80;

  const today = new Date();
  const finalDeadline = await getBillDeadline(
    registeredCampers.map((c) => c.shiftNr),
  );
  const due = new Date();
  due.setDate(today.getDate() + 3);

  // If bill coincides with final deadline.
  const lenientDeadline = due > finalDeadline;

  const billDate = today.toLocaleDateString(DATE_LOCALE, DATE_OPTIONS);
  const billDue = due.toLocaleDateString(DATE_LOCALE, DATE_OPTIONS);
  const billDeadline = finalDeadline.toLocaleDateString(
    DATE_LOCALE,
    DATE_OPTIONS,
  );

  const billNrLength = doc.widthOfString(`${billNr}`);
  const billDateLength = doc.widthOfString(billDate);
  const billDueLength = doc.widthOfString(billDue);
  const billFinalLength = doc.widthOfString(billDeadline);

  const billDataRightOffset = 310;

  doc
    .text("Makseteatise number:", SIDE_MARGIN, billTop)
    .text("Makseteatise kuupäev:");

  if (lenientDeadline) {
    doc.text("Maksetähtaeg:");
  } else {
    doc.text("Broneerimistasu maksetähtaeg:").text("Laagritasu maksetähtaeg:");
  }

  doc
    .font(FONT_PRIMARY_BOLD)
    .text(
      `${billNr}`,
      doc.page.width - billDataRightOffset - billNrLength,
      billTop,
    )
    .font(FONT_PRIMARY)
    .text(billDate, doc.page.width - billDataRightOffset - billDateLength)
    .text(billDue, doc.page.width - billDataRightOffset - billDueLength);

  if (!lenientDeadline)
    doc.text(
      billDeadline,
      doc.page.width - billDataRightOffset - billFinalLength,
    );
  doc.moveDown();
  doc
    .fontSize(10)
    .text(
      "Maksekorraldusel palume kindlasti märkida selgituseks makseteatise numbri ning lapse nime ja vahetuse.",
      SIDE_MARGIN,
    );

  // Main contents
  doc.moveDown(4);
  doc.fontSize(12).font(FONT_PRIMARY_BOLD);
  doc.text("Kirjeldus");
  doc.moveUp();
  doc.text(
    "Kogus",
    doc.page.width - SIDE_MARGIN - 50 - doc.widthOfString("Kogus"),
  );
  doc.moveUp();
  doc.text("Hind", doc.page.width - SIDE_MARGIN - doc.widthOfString("Hind"));
  doc.moveDown();
  doc.fontSize(10).font(FONT_PRIMARY);

  const counters = {
    childShortOld: {
      txt: "10päevane vahetus vanale olijale",
      count: 0,
      price: 180,
    },
    childShortNew: {
      txt: "10päevane vahetus uuele tulijale",
      count: 0,
      price: 190,
    },
    childOld: {
      txt: "12päevane vahetus vanale olijale",
      count: 0,
      price: 230,
    },
    childNew: {
      txt: "12päevane vahetus uuele tulijale",
      count: 0,
      price: 250,
    },
    booking: {
      txt: "Broneerimistasu",
      count: regCount,
      price: 100,
    },
  };

  registeredCampers.forEach((camper) => {
    if (camper.isOld) {
      if (camper.shiftNr === 1) ++counters.childShortOld.count;
      else ++counters.childOld.count;
    } else {
      if (camper.shiftNr === 1) ++counters.childShortNew.count;
      else ++counters.childNew.count;
    }
  });

  let netPriceTotal = 0;
  const bookingPriceTotal = counters.booking.count * counters.booking.price;
  for (const [key, value] of Object.entries(counters)) {
    if (value.count) {
      if (key !== "booking") netPriceTotal += value.count * value.price;
      doc.text(value.txt, SIDE_MARGIN);
      doc.moveUp();
      const valueText = `${value.count} tk`;
      doc.text(
        valueText,
        doc.page.width - SIDE_MARGIN - 50 - doc.widthOfString(valueText),
      );
      doc.moveUp();
      const priceText = `${value.price} €`;
      doc.text(
        priceText,
        doc.page.width - SIDE_MARGIN - doc.widthOfString(priceText),
      );
      doc.moveDown();
    }
  }

  // Calculate price in db
  let realPrice = 0;
  registeredCampers.forEach((camper) => {
    realPrice += camper.priceToPay;
  });

  // Calculate discount
  let discount = 0;
  if (realPrice !== netPriceTotal + bookingPriceTotal)
    discount = netPriceTotal + bookingPriceTotal - realPrice;

  doc.moveDown();
  doc.fontSize(11);
  doc.text("", SIDE_MARGIN);
  const brText = `Broneerimistasu: ${bookingPriceTotal} €`;
  doc.text(brText, { align: "right" });
  const preText = `Laagritasu: ${netPriceTotal} €`;
  doc.text(preText, { align: "right" });
  const sumText = `Kogusumma: ${netPriceTotal + bookingPriceTotal} €`;
  doc.text(sumText, { align: "right" });

  if (discount) {
    doc.moveDown();

    const discountText = `Soodustus: ${discount} €`;
    doc.text(discountText, { align: "right" });
  }

  doc.text("", SIDE_MARGIN);
  doc.moveDown();
  doc.fontSize(12).font(FONT_PRIMARY_BOLD);
  doc.text(`Tasumisele kuulub: ${realPrice} €`, { align: "right" });

  // Camper names
  doc.moveDown(4).fontSize(11);
  doc.text("Selgitus", SIDE_MARGIN);
  doc.moveDown();
  doc.fontSize(10).font(FONT_PRIMARY);
  doc.text(`Makseteatis ${billNr}, `, { continued: true });

  registeredCampers.forEach((camper, i) => {
    doc.text(`${camper.name} ${camper.shiftNr}v`, {
      continued: true,
    });
    // No comma after last entry.
    if (i !== regCount - 1) doc.text(", ", { continued: true });
  });

  // Footer
  generateFooter(doc, oneThird);

  doc.save();
  doc.end();

  await new Promise<void>((resolve) => {
    writeStream.on("finish", () => {
      resolve();
    });
  });

  return billName;
};

const generateFooter = (doc: PDFDocument, oneThird: number) => {
  doc
    .moveTo(SIDE_MARGIN, doc.page.height - 110)
    .lineTo(doc.page.width - SIDE_MARGIN, doc.page.height - 110)
    .stroke();
  doc.fontSize(9).font(FONT_PRIMARY);
  doc.text("", SIDE_MARGIN);

  doc
    .text(
      "Sõudebaasi tee 23, 13517 Tallinn",
      SIDE_MARGIN,
      doc.page.height - 70,
      {
        width: oneThird,
      },
    )
    .text("Reg nr. 80067875");
  doc
    .text(
      "info@merelaager.ee",
      SIDE_MARGIN + 5 + oneThird,
      doc.page.height - 70,
      {
        width: oneThird,
      },
    )
    .text("+372 5628 6586");
  doc
    .text(
      "Swedbank EE862200221011493003",
      SIDE_MARGIN + 10 + 2 * oneThird,
      doc.page.height - 70,
      {
        align: "right",
        width: oneThird,
      },
    )
    .text("HABAEE2X", {
      align: "right",
      width: oneThird,
    });

  const bankLength = doc.widthOfString("Swedbank EE862200221011493003");
  doc.font(FONT_PRIMARY_BOLD);
  doc
    .text("MTÜ Noorte Mereklubi", SIDE_MARGIN, doc.page.height - 90, {
      width: oneThird,
    })
    .text("Kontakt", SIDE_MARGIN + 5 + oneThird, doc.page.height - 90, {
      width: oneThird * 2,
    })
    .text(
      "Arveldus",
      doc.page.width - SIDE_MARGIN - bankLength,
      doc.page.height - 90,
      {
        width: oneThird,
      },
    );

  return doc;
};
