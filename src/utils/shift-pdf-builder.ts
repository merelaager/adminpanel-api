import type { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";
import pdfMake from "pdfmake";

const fonts: TFontDictionary = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
};

pdfMake.setFonts(fonts);

// Silence pdfmake's access policy warnings.
// No policies are needed here. Hopefully....
pdfMake.setUrlAccessPolicy(() => true);
pdfMake.setLocalAccessPolicy(() => true);

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
  const filepath = `data/files/${filename}`;

  try {
    await pdfMake.createPdf(createDoc(shiftNr, entries)).write(filepath);

    return filepath;
  } catch (e) {
    console.error(e);
    return "";
  }
};
