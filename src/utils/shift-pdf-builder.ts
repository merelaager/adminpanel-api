import fs, { WriteStream } from "fs";
import type {
  BufferOptions,
  TDocumentDefinitions,
  TFontDictionary,
} from "pdfmake/interfaces";
import PdfPrinter from "pdfmake";
import PDFDocument = PDFKit.PDFDocument;

export interface PrintEntry {
  name: string;
  sex: string;
  dob: Date;
  old: boolean;
  shirtSize: string;
  contactName: string;
  contactEmail: string;
  contactNumber: string;
}

const createDoc = (
  shiftNr: number,
  entries: PrintEntry[],
): TDocumentDefinitions => {
  const tableHeaders: string[] = [
    "Nimi",
    "Sugu",
    "Sünnipäev",
    "Uus?",
    "Särk",
    "Kontakt",
    "Number",
    "Meil",
  ];
  const tableRows: string[][] = [tableHeaders];
  entries.forEach((entry: PrintEntry) => {
    tableRows.push([
      entry.name,
      entry.sex,
      new Date(entry.dob).toLocaleDateString("et-EE", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
      entry.old ? "" : "X",
      entry.shirtSize,
      entry.contactName,
      entry.contactNumber,
      entry.contactEmail,
    ]);
  });

  return {
    content: [
      { text: `${shiftNr}v ${new Date().getFullYear()}`, style: "header" },
      { table: { body: tableRows } },
    ],
    defaultStyle: { font: "Helvetica" },
    pageOrientation: "landscape",
  };
};

export const generateShiftCamperListPDF = async (
  shiftNr: number,
  entries: PrintEntry[],
): Promise<string> => {
  const filename = `${shiftNr}v_nimekiri.pdf`;
  const options: BufferOptions = {};
  const fonts: TFontDictionary = {
    Helvetica: {
      normal: "Helvetica",
      bold: "Helvetica-Bold",
      italics: "Helvetica-Oblique",
      bolditalics: "Helvetica-BoldOblique",
    },
  };

  const printer: PdfPrinter = new PdfPrinter(fonts);
  const filepath = `data/files/${filename}`;

  try {
    // PDF document
    const pdfDoc: PDFDocument = printer.createPdfKitDocument(
      createDoc(shiftNr, entries),
      options,
    );

    // PDF output
    const writeStream: WriteStream = fs.createWriteStream(filepath);

    // Write the document to file.
    pdfDoc.pipe(writeStream);
    pdfDoc.end();

    // Emulate async behaviour in async/await syntax.
    await new Promise<void>((resolve) => {
      writeStream.on("finish", () => resolve());
    });

    return filepath;
  } catch (e) {
    console.error(e);
    return "";
  }
};
