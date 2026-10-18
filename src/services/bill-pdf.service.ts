import fs from "node:fs/promises";
import path from "node:path";
import PDFDoc from "pdfkit";

import type { Prisma } from "#app/generated/prisma/client";
import { formatUTCDate } from "#app/lib/date";
import { formatEuros } from "#app/lib/money";
import PDFDocument = PDFKit.PDFDocument;
import PDFDocumentOptions = PDFKit.PDFDocumentOptions;

export const billDocumentInclude = {
  items: { orderBy: { position: "asc" } },
  account: { select: { reference: true } },
  replaces: { select: { number: true } },
} satisfies Prisma.BillInclude;

export type BillDocument = Prisma.BillGetPayload<{
  include: typeof billDocumentInclude;
}>;

const SIDE_MARGIN = 60;
const CONTENT_TOP = 60;
const CONTENT_BOTTOM = 40;
const LOGO_WIDTH = 60;

const BRAND_BLUE = "#23408f";
const TEXT_COLOR = "black";

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
    Title: "Arve",
    Author: "Laoküla merelaager",
  },
  margins: {
    top: CONTENT_TOP,
    left: SIDE_MARGIN,
    right: SIDE_MARGIN,
    bottom: CONTENT_BOTTOM,
  },
};

const billDir = (): string =>
  path.resolve(process.env.DATA_DIR ?? "data", "arved");

const billPdfPath = (billNr: number): string =>
  path.join(billDir(), `${billNr}.pdf`);

export const storeBillPdf = async (bill: BillDocument): Promise<void> => {
  const pdf = await renderBillPdf(bill);
  await fs.mkdir(billDir(), { recursive: true });
  await fs.writeFile(billPdfPath(bill.number), pdf);
};

export const readBillPdf = async (billNr: number): Promise<Buffer | null> => {
  try {
    return await fs.readFile(billPdfPath(billNr));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
};

const formatDate = (date: Date): string =>
  formatUTCDate(date, DATE_LOCALE, DATE_OPTIONS);

const renderBillPdf = (bill: BillDocument): Promise<Buffer> => {
  const doc = new PDFDoc(BILL_META);

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const oneThird = (doc.page.width - SIDE_MARGIN * 2 - 10) / 3;
  const rightEdge = doc.page.width - SIDE_MARGIN;
  const reference = bill.account.reference;

  doc.image(
    "./media/files/bluelogo.png",
    rightEdge - LOGO_WIDTH,
    CONTENT_TOP / 2,
    { width: LOGO_WIDTH },
  );

  doc
    .fontSize(22)
    .font(FONT_PRIMARY_BOLD)
    .text(bill.payerName, SIDE_MARGIN, CONTENT_TOP);
  doc.fontSize(11).font(FONT_PRIMARY).text(bill.payerEmail);

  const singleDeadline =
    bill.bookingFeeDue.getTime() === bill.campFeeDue.getTime();
  const valueRight = doc.page.width - 310;
  const detail = (
    label: string,
    value: string,
    style: { bold?: boolean; color?: string } = {},
  ) => {
    const top = doc.y;
    doc.fillColor(style.color ?? TEXT_COLOR);
    doc.font(FONT_PRIMARY).text(label, SIDE_MARGIN, top);
    doc
      .font(style.bold ? FONT_PRIMARY_BOLD : FONT_PRIMARY)
      .text(value, valueRight - doc.widthOfString(value), top);
    doc.fillColor(TEXT_COLOR);
  };

  doc.y = CONTENT_TOP + 80;
  detail("Arve number:", `${bill.number}`, { bold: true });
  detail("Arve kuupäev:", formatDate(bill.issuedAt));
  detail("Viitenumber:", reference, { color: BRAND_BLUE });
  doc.moveDown();
  if (singleDeadline) {
    detail("Maksetähtaeg:", formatDate(bill.bookingFeeDue));
  } else {
    detail("Broneerimistasu maksetähtaeg:", formatDate(bill.bookingFeeDue));
    detail("Laagritasu maksetähtaeg:", formatDate(bill.campFeeDue));
  }

  doc.moveDown().font(FONT_PRIMARY).fontSize(10);
  if (bill.replaces) {
    doc.text(`See arve asendab arvet nr ${bill.replaces.number}.`, SIDE_MARGIN);
  }
  doc
    .text("Maksekorraldusel palume kindlasti märkida ", SIDE_MARGIN, doc.y, {
      continued: true,
    })
    .font(FONT_PRIMARY_BOLD)
    .text("viitenumber", { continued: true })
    .font(FONT_PRIMARY)
    .text(" ja ", { continued: true })
    .font(FONT_PRIMARY_BOLD)
    .text("selgituseks arve number!")
    .font(FONT_PRIMARY);

  const bookingTotal = bill.items.reduce((sum, i) => sum + i.bookingFee, 0);
  const total = bill.items.reduce((sum, i) => sum + i.amount, 0);

  type LineGroup = {
    description: string;
    unitPrice: number;
    children: string[];
  };
  const groups = new Map<string, LineGroup>();
  const bookingFees = new Map<number, number>();
  for (const item of bill.items) {
    const unitPrice = item.amount - item.bookingFee;
    const key = `${item.description}|${unitPrice}`;
    const group = groups.get(key) ?? {
      description: item.description,
      unitPrice,
      children: [],
    };
    group.children.push(`${item.childName} (${item.shiftNr}. vahetus)`);
    groups.set(key, group);
    if (item.bookingFee > 0) {
      bookingFees.set(
        item.bookingFee,
        (bookingFees.get(item.bookingFee) ?? 0) + 1,
      );
    }
  }

  const quantityRight = rightEdge - 70;
  const row = (description: string, quantity: string, price: string) => {
    const top = doc.y;
    doc.text(description, SIDE_MARGIN, top, {
      width: quantityRight - SIDE_MARGIN - 60,
    });
    const bottom = doc.y;
    doc.text(quantity, quantityRight - doc.widthOfString(quantity), top);
    doc.text(price, rightEdge - doc.widthOfString(price), top);
    doc.y = bottom;
  };

  doc.moveDown(4).fontSize(12).font(FONT_PRIMARY_BOLD);
  row("Kirjeldus", "Kogus", "Hind");
  doc.moveDown().fontSize(10).font(FONT_PRIMARY);

  for (const group of groups.values()) {
    row(
      group.description,
      `${group.children.length} tk`,
      formatEuros(group.unitPrice),
    );
    doc.fontSize(9);
    for (const child of group.children) {
      doc.text(`• ${child}`, SIDE_MARGIN + 12);
    }
    doc.fontSize(10).moveDown();
  }
  for (const [fee, count] of bookingFees) {
    row("Broneerimistasu", `${count} tk`, formatEuros(fee));
    doc.moveDown();
  }

  doc.moveDown().fontSize(11);
  const summary = (text: string) =>
    doc.text(text, SIDE_MARGIN, doc.y, {
      align: "right",
      width: rightEdge - SIDE_MARGIN,
    });
  summary(`Broneerimistasu: ${formatEuros(bookingTotal)}`);
  summary(`Laagritasu: ${formatEuros(total - bookingTotal)}`);
  doc.moveDown().fontSize(12).font(FONT_PRIMARY_BOLD);
  summary(`Tasumisele kuulub: ${formatEuros(total)}`);

  const children = bill.items.map(
    (item) => `${item.childName} ${item.shiftNr}v`,
  );
  doc.moveDown(4).fontSize(11).text("Selgitus", SIDE_MARGIN);
  doc.moveDown().fontSize(10).font(FONT_PRIMARY);
  doc.text(
    [`Arve ${bill.number}`, ...new Set(children)].join(", "),
    SIDE_MARGIN,
  );

  generateFooter(doc, oneThird);

  doc.end();
  return done;
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
