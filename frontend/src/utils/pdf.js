import { jsPDF } from 'jspdf';

// Builds a simple diploma PDF. jsPDF stamps a creation date in the metadata,
// so generating twice gives two different hashes: always hash and upload the
// exact File returned here.
export function genererDiplomePdf({ nom, prenom, filiere, annee }) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const cx = 148.5;

  doc.setDrawColor(18, 38, 43);
  doc.setLineWidth(1.2);
  doc.rect(8, 8, 281, 194);
  doc.setLineWidth(0.3);
  doc.rect(12, 12, 273, 186);

  doc.setTextColor(18, 38, 43);
  doc.setFont('times', 'bold');
  doc.setFontSize(40);
  doc.text('DIPLÔME', cx, 55, { align: 'center' });

  doc.setFont('times', 'normal');
  doc.setFontSize(14);
  doc.text('Il est certifié que', cx, 85, { align: 'center' });

  doc.setFont('times', 'bold');
  doc.setFontSize(30);
  doc.text(`${prenom.trim()} ${nom.trim().toUpperCase()}`, cx, 108, { align: 'center' });

  doc.setFont('times', 'normal');
  doc.setFontSize(14);
  doc.text('a validé avec succès le cursus de', cx, 128, { align: 'center' });

  doc.setFont('times', 'bold');
  doc.setFontSize(22);
  doc.text(filiere.trim(), cx, 145, { align: 'center' });

  doc.setFont('times', 'normal');
  doc.setFontSize(14);
  doc.text(`Année universitaire ${annee}`, cx, 160, { align: 'center' });

  doc.setFontSize(10);
  doc.text(
    `Délivré le ${new Date().toLocaleDateString('fr-FR', { dateStyle: 'long' })} — authenticité vérifiable en ligne`,
    cx,
    185,
    { align: 'center' }
  );

  const name = `diplome-${nom.trim()}-${prenom.trim()}`.toLowerCase().replace(/\s+/g, '-') + '.pdf';
  return new File([doc.output('blob')], name, { type: 'application/pdf' });
}
