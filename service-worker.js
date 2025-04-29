// EEG-Tarife nach Inbetriebnahme-Jahr (ct/kWh):
const eegRates = {
  2009: 43.01, 2010: 33.01, 2011: 30.74, 2012: 24.43,
  2013: 23.41, 2014: 13.11, 2015: 12.31, 2016: 11.14,
  2017: 11.09, 2018: 10.74, 2019: 9.87, 2020: 8.79,
  2021: 8.15, 2022: 7.44, 2023: 7.14, 2024: 6.81
};

document.getElementById('vermarktung')
  .addEventListener('change', e => {
    document.getElementById('eegInputs').classList.toggle('hidden', e.target.value!=='eeg');
    document.getElementById('directInputs').classList.toggle('hidden', e.target.value!=='direct');
  });

document.getElementById('calcBtn').addEventListener('click', berechnen);

function berechnen() {
  const form = document.getElementById('pvForm');
  const start = new Date(document.getElementById('startDate').value);
  const year = start.getFullYear();
  const tarif = (document.getElementById('vermarktung').value==='eeg')
    ? (eegRates[year]||eegRates[2024])/100
    : (parseFloat(document.getElementById('marketPrice').value)
       + parseFloat(document.getElementById('marketPremium').value))/100;

  const anlage = parseFloat(document.getElementById('anlagegroesse').value);
  const verbrauch = parseFloat(document.getElementById('verbrauch').value)/100;
  const förder = parseFloat(document.getElementById('foerderung').value);
  const invest = parseFloat(document.getElementById('investition').value);
  const wartung = parseFloat(document.getElementById('wartung').value);
  const reEinheit = document.getElementById('reinigungseinheit').value;
  const reKosten = parseFloat(document.getElementById('reinigungskosten').value);
  let flaeche = parseFloat(document.getElementById('flaeche').value);
  if (!flaeche) flaeche = anlage * 7;

  // Ertragsparameter
  let specEr = anlage * 1000 * 0.9; // 900 kWh/kWp als Basis gängige Annahme
  let jahre = 20, cum = 0, invRest = invest - förder, amort = 0;
  const dataCleaning = [];

  for (let j=1; j<=jahre; j++) {
    // Basisleistung
    specEr *= (1 - 0.005); // 0,5 % Degradation
    // Verschmutzung
    let interval = anlage<=30 ? 5 : 2;
    let loss = (j<interval) ? 0 : (anlage<=30 ? 0.10 : 0.15);
    let yieldLost = specEr * loss;
    specEr -= yieldLost;
    // Cleaning-Effekt am Intervalljahr
    if (j % interval === 0) {
      specEr += yieldLost * 0.9; // 90 % Wiederherstellung
      const cost = (reEinheit==='kwp'? reKosten*anlage : reKosten*flaeche);
      cum -= cost;
      dataCleaning.push({jahr:j,verlust:yieldLost, kosten:cost});
    }
    // Erlöse
    const ev = specEr * verbrauch;
    const ei = specEr - ev;
    const rev = ev * tarif + ei * tarif - wartung;
    cum += rev;
    if (!amort && cum >= invRest) amort = j;
  }

  // Darstellung
  document.getElementById('ergebnis').innerHTML =
    `<h2>Ergebnisse nach 20 Jahren</h2>
     <p>Kumulierte Erlöse: ${cum.toFixed(2)} €</p>
     <p>Amortisation nach: ${amort? amort+' Jahren' : 'nicht erreicht'}</p>
     <h3>Reinigungseffekte</h3>
     <ul>${dataCleaning.map(d=>
       `<li>Jahr ${d.jahr}: Verlust ${d.verlust.toFixed(0)} kWh → Mehrerlös nach Reinigung <u>${(d.verlust*tarif).toFixed(2)} €</u> (Kosten ${d.kosten.toFixed(2)} €)</li>`
     ).join('')}</ul>`;

  // PDF­Export im Urkunden­stil
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit:'pt', format:'a4' });
  // Rand und Rahmen
  doc.setDrawColor(139,94,60);
  doc.setLineWidth(4);
  doc.rect(20,20,572,800);
  // Titel mittelalterlich
  doc.setFont('Times','BoldItalic');
  doc.setFontSize(24);
  doc.text('Urkunde der PV-Rentabilität', 100, 80);
  doc.setFont('Times','Roman');
  doc.setFontSize(12);
  doc.text(`Erstellt: ${new Date().toLocaleDateString()}`, 40, 110);
  doc.text(`Anlage: ${anlage.toFixed(1)} kWp (Inbetriebnahme: ${start.toLocaleDateString()})`, 40, 140);
  doc.text(`Erlöse (20 Jahre): ${cum.toFixed(2)} €`, 40, 170);
  doc.text(`Amortisation: ${amort? amort+' Jahren': 'nicht erreicht'}`, 40, 200);
  let y = 240;
  doc.text('Reinigung (Jahr Verlust Mehrerlös Kosten):', 40, y);
  dataCleaning.forEach(d=>{
    y += 20;
    doc.text(`J${d.jahr} – ${d.verlust.toFixed(0)}kWh – ${(d.verlust*tarif).toFixed(2)}€ – ${d.kosten.toFixed(2)}€`, 40, y);
    if (y > 740) { doc.addPage(); y = 40; }
  });
  doc.save('Urkunde_PV-Rentabilitaet.pdf');
}
