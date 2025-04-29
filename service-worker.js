// EEG-Tarife ab 2005 (ct/kWh)
const eegRates = {
  2005:57.40,2006:48.37,2007:43.01,2008:41.00,
  2009:43.01,2010:33.01,2011:30.74,2012:24.43,
  2013:23.41,2014:13.11,2015:12.31,2016:11.14,
  2017:11.09,2018:10.74,2019:9.87,2020:8.79,
  2021:8.15,2022:7.44,2023:7.14,2024:6.81
};

document.getElementById('vermarktung')
  .addEventListener('change', e => {
    document.getElementById('eegInputs').classList.toggle('hidden', e.target.value!=='eeg');
    document.getElementById('directInputs').classList.toggle('hidden', e.target.value!=='direct');
  });

document.getElementById('calcBtn').addEventListener('click', berechnen);

function berechnen() {
  // Eingaben
  const start = new Date(document.getElementById('startDate').value);
  const year = start.getFullYear();
  const today = new Date();
  const age = today.getFullYear() - year - (today.getMonth()<start.getMonth()?1:0);
  const isOlder20 = age >= 20;

  let tarif;
  if (isOlder20 || document.getElementById('vermarktung').value==='direct') {
    const mp = parseFloat(document.getElementById('marketPrice').value);
    const pr = parseFloat(document.getElementById('marketPremium').value);
    tarif = (mp + pr) / 100;
  } else {
    tarif = (eegRates[year] || eegRates[2024]) / 100;
  }

  const anlage = parseFloat(document.getElementById('anlagegroesse').value);
  const verbrauch = parseFloat(document.getElementById('verbrauch').value)/100;
  const förder = parseFloat(document.getElementById('foerderung').value);
  const invest = parseFloat(document.getElementById('investition').value);
  const wartung = parseFloat(document.getElementById('wartung').value);
  const reEin = document.getElementById('reinigungseinheit').value;
  const reK = parseFloat(document.getElementById('reinigungskosten').value);
  let fl = parseFloat(document.getElementById('flaeche').value);
  if (!fl) fl = anlage * 7;

  // Berechnung
  let specEr = anlage * 1000 * 0.9; // Start: 900 kWh/kWp
  const jahre = 20;
  let cum = 0, invRest = invest - förder, amort=0;
  const cleaningLog = [];

  for (let j=1;j<=jahre;j++) {
    specEr *= 0.995;                        // Degradation
    const interval = anlage<=30?5:2;
    const lossRate = j<interval?0:(anlage<=30?0.10:0.15);
    const loss = specEr * lossRate;
    specEr -= loss;
    if (j % interval === 0) {
      specEr += loss * 0.9;                 // Reinigungseffekt
      const cost = (reEin==='kwp'? reK*anlage : reK*fl);
      cum -= cost;
      cleaningLog.push({j, loss, cost});
    }
    const ev = specEr * verbrauch;
    const ei = specEr - ev;
    const rev = ev*tarif + ei*tarif - wartung;
    cum += rev;
    if (!amort && cum >= invRest) amort = j;
  }

  // Ergebnis anzeigen
  const out = document.getElementById('ergebnis');
  out.innerHTML = `
    <h2>Ergebnis nach 20 Jahren</h2>
    <p>Erlöse: ${cum.toFixed(2)} €</p>
    <p>Amortisation: ${amort? amort+' Jahre':'nicht erreicht'}</p>
    <h3>Reinigungseffekte</h3>
    <ul>${cleaningLog.map(d=>
      `<li>Jahr ${d.j}: Verlust ${d.loss.toFixed(0)} kWh → Mehrerlös ${(d.loss*tarif).toFixed(2)} € (Kosten ${d.cost.toFixed(2)} €)</li>`
    ).join('')}</ul>`;

  // PDF-Export
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'pt',format:'a4'});
  doc.setDrawColor(139,94,60).setLineWidth(4).rect(20,20,572,800);
  doc.setFont('Times','BoldItalic').setFontSize(24).text('Urkunde der PV-Rentabilität',100,80);
  doc.setFont('Times','Roman').setFontSize(12);
  doc.text(`Erstellt: ${today.toLocaleDateString()}`,40,110);
  doc.text(`Anlage: ${anlage.toFixed(1)} kWp (Start: ${start.toLocaleDateString()})`,40,140);
  doc.text(`Erlöse: ${cum.toFixed(2)} €`,40,170);
  doc.text(`Amortisation: ${amort?amort+' Jahre':'nicht erreicht'}`,40,200);
  let y=240;
  doc.text('Reinigung (Jahr – Verlust – Mehrerlös – Kosten):',40,y);
  cleaningLog.forEach(d=>{
    y+=20;
    doc.text(`J${d.j} – ${d.loss.toFixed(0)}kWh – ${(d.loss*tarif).toFixed(2)}€ – ${d.cost.toFixed(2)}€`,40,y);
    if (y>740){doc.addPage();y=40;}
  });
  doc.save('Urkunde_PV-Rentabilitaet.pdf');
}
