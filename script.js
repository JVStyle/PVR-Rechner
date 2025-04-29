// EEG-Tarife ab 2005 (ct/kWh)
const eegRates = {
  2005:57.40,2006:48.37,2007:43.01,2008:41.00,
  2009:43.01,2010:33.01,2011:30.74,2012:24.43,
  2013:23.41,2014:13.11,2015:12.31,2016:11.14,
  2017:11.09,2018:10.74,2019:9.87,2020:8.79,
  2021:8.15,2022:7.44,2023:7.14,2024:6.81
};

const form = document.getElementById('pvForm');
const eegDiv = document.getElementById('eegInputs');
const directDiv = document.getElementById('directInputs');
const vermarktung = document.getElementById('vermarktung');

vermarktung.addEventListener('change', () => {
  eegDiv.classList.toggle('hidden', vermarktung.value!=='eeg');
  directDiv.classList.toggle('hidden', vermarktung.value!=='direct');
});

document.getElementById('calcBtn').addEventListener('click', berechnen);

async function fetchSolarExpected(lat, lon) {
  const url = `https://re.jrc.ec.europa.eu/api/v5_2/PVGIS/annualcalc?lat=${lat}&lon=${lon}&peakpower=1`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    return json.outputs.annual_production; // kWh/kWp
  } catch(e) {
    console.warn('PVGIS API error', e);
    return null;
  }
}

async function berechnen() {
  // 1. Eingaben
  const start = new Date(document.getElementById('startDate').value);
  const year = start.getFullYear();
  const month = start.getMonth()+1;
  const today = new Date();
  const age = today.getFullYear() - year - (today.getMonth()<start.getMonth()?1:0);
  const older20 = age >= 20;

  let tarif;
  if (older20 || vermarktung.value==='direct') {
    const mp = parseFloat(document.getElementById('marketPrice').value);
    const pr = parseFloat(document.getElementById('marketPremium').value);
    tarif = (mp + pr)/100;
  } else {
    tarif = (eegRates[year]||eegRates[2024])/100;
  }

  const anlage = +document.getElementById('anlagegroesse').value;
  let verbrauch = +document.getElementById('verbrauch').value;
  if (!verbrauch && year<2012) verbrauch = 0;
  verbrauch /= 100;

  const foerder = +document.getElementById('foerderung').value;
  const invest = +document.getElementById('investition').value;
  const wartung = +document.getElementById('wartung').value;
  const wartInter = +document.getElementById('wartungIntervall').value;
  const reEin = document.getElementById('reinigungseinheit').value;
  const reK  = +document.getElementById('reinigungskosten').value;
  let sch = document.getElementById('verschmutzung').value;
  sch = sch==='gering'?0.05: sch==='mittel'?0.10:0.20;
  let fl = +document.getElementById('flaeche').value;
  if (!fl) fl = anlage*7;

  // 2. Erwarteter Ertrag per kWp via PVGIS
  const lat = document.getElementById('latitude').value;
  const lon = document.getElementById('longitude').value;
  const expectedYield = lat&&lon ? await fetchSolarExpected(lat,lon)
                                  : anlage*900; // fallback 900 kWh/kWp
  const specErStart = anlage * expectedYield; 

  // 3. Schleife
  let specEr = specErStart;
  const jahre = 20;
  let cum=0, invRest=invest-foerder, amort=0;
  const data = [], cleaning=[];

  for(let j=1;j<=jahre;j++){
    specEr *= 0.995;                              // Degradation
    const interval = anlage<=30?5:2;             
    let loss=0;
    if(j>=interval){
      loss = specEr*sch; specEr -= loss;
    }
    if(j%interval===0){
      specEr += loss*0.9;
      const cost = (reEin==='kwp'?anlage*reK:fl*reK);
      cum -= cost;
      cleaning.push({j,loss,cost});
    }
    // Erlöse
    const ev=specEr*verbrauch, es=specEr-ev;
    const rev=ev*tarif + es*tarif - (j%wartInter===0?wartung:0);
    cum += rev;
    if(!amort && cum>=invRest) amort=j;
    data.push({j,ertrag:specEr.toFixed(0), wert:rev.toFixed(2)});
  }

  // 4. EEG-Tabelle
  let eegHtml = `<h3>EEG-Tarife & Erträge</h3>
    <table id="eegTabelle"><thead>
      <tr><th>Jahr</th><th>Tarif (ct/kWh)</th><th>Monats-€</th><th>Jahres-€</th></tr>
    </thead><tbody>`;
  data.forEach(d=>{
    const t = ((d.j<=20 && year+d.j-1<=2024)?(eegRates[year+d.j-1]||eegRates[2024]):(tarif*100)).toFixed(2);
    const mon = (d.ertrag/12 * (t/100)).toFixed(2);
    const yr  = (d.ertrag * (t/100)).toFixed(2);
    eegHtml += `<tr><td>${year+d.j-1}</td><td>${t}</td><td>${mon}</td><td>${yr}</td></tr>`;
  });
  eegHtml += `</tbody></table>`;

  // 5. Ergebnis ausgeben
  let out = `<h2>Ergebnis nach 20 Jahren</h2>
    <p>Kumulierte Erlöse: ${cum.toFixed(2)} €</p>
    <p>Amortisation: ${amort? amort+' Jahre':'nicht erreicht'}</p>
    <h3>Jährliche Übersicht</h3>
    <table id="jahresTabelle">
      <thead><tr><th>Jahr</th><th>Ertrag (kWh)</th><th>Ertrag (€)</th></tr></thead><tbody>`;
  data.forEach(d=>{
    out += `<tr><td>${d.j}</td><td>${d.ertrag}</td><td>${d.wert}</td></tr>`;
  });
  out += `</tbody></table>` + eegHtml +
    `<h3>Reinigungseffekte</h3><ul>`+
    cleaning.map(c=>`<li>J${c.j}: Verlust ${c.loss.toFixed(0)} kWh → Mehrerlös ${(c.loss*tarif).toFixed(2)} € (Kosten ${c.cost.toFixed(2)} €)</li>`).join('')+
    `</ul>`;

  document.getElementById('ergebnis').innerHTML = out;

  // 6. PDF-Export
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({unit:'pt',format:'a4'});
  doc.setDrawColor(139,94,60).setLineWidth(4).rect(20,20,572,800);
  doc.setFont('Times','BoldItalic').setFontSize(24).text('Urkunde PV-Rentabilität',100,80);
  doc.setFont('Times','Roman').setFontSize(12);
  doc.text(`Anlage: ${anlage} kWp (Start: ${start.toLocaleDateString()})`,40,120);
  doc.text(`Erlöse: ${cum.toFixed(2)} €`,40,140);
  doc.text(`Amortisation: ${amort?amort+' Jahre':'nicht erreicht'}`,40,160);
  let y=200;
  doc.text('Jahr | kWh | €',40,y);
  data.forEach(d=>{
    y+=16; doc.text(`${d.j} | ${d.ertrag} | ${d.wert}`,40,y);
    if(y>740){doc.addPage();y=40;}
  });
  doc.save('Urkunde_PV-Rentabilitaet.pdf');
}
