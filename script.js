function berechnen() {
  // Eingaben
  const anlagegroesse = parseFloat(document.getElementById('anlagegroesse').value);
  const verbrauch = parseFloat(document.getElementById('verbrauch').value) / 100;
  const einspeiseverguetung = parseFloat(document.getElementById('einspeiseverguetung').value) / 100;
  const strompreis = parseFloat(document.getElementById('strompreis').value) / 100;
  const lage = document.getElementById('lage').value;
  const foerderung = parseFloat(document.getElementById('foerderung').value);
  const investition = parseFloat(document.getElementById('investition').value);
  const wartung = parseFloat(document.getElementById('wartung').value);
  const verschmutzung = document.getElementById('verschmutzung').value;
  const reinigungIntervall = parseInt(document.getElementById('reinigungIntervall').value);
  const reinigungseinheit = document.getElementById('reinigungseinheit').value;
  const reinigungskostenProEinheit = parseFloat(document.getElementById('reinigungskosten').value);
  let flaeche = parseFloat(document.getElementById('flaeche').value);

  if (!flaeche) {
    flaeche = anlagegroesse * 7; // Standard 7 m²/kWp
  }

  // Spezifischer Ertrag nach Lage
  let specificYield;
  switch (lage) {
    case 'gut': specificYield = 1050; break;
    case 'mittel': specificYield = 900; break;
    default: specificYield = 750; break;
  }

  // Reinigungskosten pro Event
  let kostenProReinigung = reinigungseinheit === 'kwp'
    ? anlagegroesse * reinigungskostenProEinheit
    : flaeche * reinigungskostenProEinheit;

  // Jahresberechnung
  let jahresertrag = anlagegroesse * specificYield;
  let kumuliert = 0;
  let invRest = investition - foerderung;
  let amortisation = 0;

  // Schmutzverlust
  let schmutzRate = verschmutzung === 'gering' ? 0.05
                  : verschmutzung === 'mittel' ? 0.10
                  : 0.20;

  const data = [];

  for (let jahr = 1; jahr <= 20; jahr++) {
    // Degradation 0,5 %
    jahresertrag *= 0.995;

    // Schmutzverlust
    jahresertrag *= (1 - schmutzRate);

    // Reinigung und Kosten
    if (jahr % reinigungIntervall === 0) {
      // Wiederherstellung auf 98% nach Reinigung
      jahresertrag /= (1 - schmutzRate);
      jahresertrag *= 0.98;
      kumuliert -= kostenProReinigung;
    }

    // Erlös
    const ev = jahresertrag * verbrauch;
    const es = jahresertrag - ev;
    const wert = ev * strompreis + es * einspeiseverguetung - wartung;

    kumuliert += wert;
    if (!amortisation && kumuliert >= invRest) {
      amortisation = jahr;
    }

    data.push({ jahr, ertrag: jahresertrag.toFixed(0), wert: wert.toFixed(2) });
  }

  // Ergebnis anzeigen
  const ergebnis = document.getElementById('ergebnis');
  ergebnis.innerHTML = `
    <h2>Ergebnis nach 20 Jahren</h2>
    <p>Erlös gesamt: ${kumuliert.toFixed(2)} €</p>
    <p>Amortisation: ${amortisation ? amortisation + ' Jahre' : 'nicht erreicht'}</p>
  `;

  // PDF-Export mit jsPDF
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text("Urkunde: PV-Rentabilität", 20, 20);
  doc.setFontSize(12);
  doc.text(`Anlage: ${anlagegroesse} kWp`, 20, 40);
  doc.text(`Dauer: 20 Jahre`, 20, 50);
  doc.text(`Erlös gesamt: ${kumuliert.toFixed(2)} €`, 20, 60);
  doc.text(`Amortisation: ${amortisation ? amortisation + ' Jahre' : 'nicht erreicht'}`, 20, 70);

  let y = 90;
  data.forEach(d => {
    doc.text(`Jahr ${d.jahr}: ${d.wert} €`, 20, y);
    y += 10;
    if (y > 280) { doc.addPage(); y = 20; }
  });

  doc.save("Urkunde_PV-Rentabilitaet.pdf");
}
