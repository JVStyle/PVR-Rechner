// 1. Google Maps Autocomplete für Adresse
function initAutocomplete() {
  const input = document.getElementById('address');
  const ac = new google.maps.places.Autocomplete(input, { types: ['address'] });
  ac.addListener('place_changed', () => {
    const place = ac.getPlace();
    document.getElementById('latitude').value = place.geometry.location.lat();
    document.getElementById('longitude').value = place.geometry.location.lng();
  });
}
window.addEventListener('load', initAutocomplete);

// 2. EEG-Tarife ab 2005 (ct/kWh)
const eegRates = {
  2005:57.40,2006:48.37,2007:43.01,2008:41.00,
  2009:43.01,2010:33.01,2011:30.74,2012:24.43,
  2013:23.41,2014:13.11,2015:12.31,2016:11.14,
  2017:11.09,2018:10.74,2019:9.87,2020:8.79,
  2021:8.15,2022:7.44,2023:7.14,2024:6.81
};

const form  = document.getElementById('pvForm');
const verm  = document.getElementById('vermarktung');
const eegDiv= document.getElementById('eegInputs');
const dirDiv= document.getElementById('directInputs');

verm.addEventListener('change', () => {
  eegDiv .classList.toggle('hidden', verm.value!=='eeg');
  dirDiv .classList.toggle('hidden', verm.value!=='direct');
});

document.getElementById('calcBtn').addEventListener('click', berechnen);

// fetch Solar-Ertrag per PVGIS
async function fetchSolar(lat, lon) {
  try {
    const res = await fetch(`https://re.jrc.ec.europa.eu/api/v5_2/PVGIS/annualcalc?lat=${lat}&lon=${lon}&peakpower=1`);
    const j = await res.json();
    return j.outputs.annual_production; // kWh/kWp
  } catch(e) {
    console.warn('PVGIS error', e);
    return 900; // Fallback
  }
}

async function berechnen() {
  // 1. Eingaben
  const start = new Date(document.getElementById('startDate').value);
  const year  = start.getFullYear();
  const today = new Date();
  const age   = today.getFullYear() - year - (today.getMonth()<start.getMonth()?1:0);
  const older20 = age >= 20;

  // 2. Tarif bestimmen
  let tarif;
  if (older20 || verm.value==='direct') {
    const mp = +document.getElementById('marketPrice').value;
    const pr = +document.getElementById('marketPremium').value;
    tarif = (mp+pr)/100;
  } else {
    tarif = (eegRates[year]||eegRates[2024])/100;
  }

  // 3. Restliche Eingaben
  const anlage   = +document.getElementById('anlagegroesse').value;
  let verbrauch  = +document.getElementById('verbrauch').value;
  if (!verbrauch && year<2012) verbrauch = 0;
  verbrauch /= 100;

  const foerder  = +document.getElementById('foerderung').value;
  const invest   = +document.getElementById('investition').value;
  const wartung  = +document.getElementById('wartung').value;
  const wartInt  = +document.getElementById('wartungIntervall').value;
  const reEin    = document.getElementById('reinigungseinheit').value;
  const reK      = +document.getElementById('reinigungskosten').value;
  let schRate    = document.getElementById('verschmutzung').value;
  schRate = schRate==='gering'?0.05: schRate==='mittel'?0.10:0.20;
  let flaeche    = +document.getElementById('flaeche').value;
  if (!flaeche) flaeche = anlage*7;

  // 4. PVGIS Ertrag
  const lat = document.getElementById('latitude').value;
  const lon = document.getElementById('longitude').value;
  const yieldPerKwp = await fetchSolar(lat, lon);
  const specErStart = anlage * yieldPerKwp;

  // 5. Kalkulation über 20 Jahre
  let specEr = specErStart, cum=0, invRest=invest-foerder, amort=0;
  const data=[], cleaning=[];

  for(let j=1;j<=20;j++){
    specEr *= 0.995; // Degr.
    const interval = anlage<=30?5:2;
    let loss=0;
    if(j>=interval){
      loss = specEr*schRate; specEr -= loss;
    }
    if(j%interval===0){
      specEr += loss*0.9;
      const cost = (reEin==='kwp'? anlage*reK : flaeche*reK);
      cum -= cost; cleaning.push({j,loss,cost});
    }
    const ev = specEr*verbrauch, es=specEr-ev;
    const rev = ev*tarif + es*tarif - (j%wartInt===0?wartung:0);
    cum += rev; if(!amort&&cum>=invRest) amort=j;
    data.push({j,ertrag:specEr.toFixed(0),wert:rev.toFixed(2)});
  }

  // 6. HTML-Ausgabe (Tabellen)
  let out=`<h2>Ergebnis nach 20 Jahren</h2>
    <p>Kumulierte Erlöse: ${cum.toFixed(2)} €</p>
    <p>Amortisation: ${amort?amort+' Jahre':'nicht erreicht'}</p>
    <h3>Jährliche Übersicht</h3>
    <table id="jahresTabelle"><thead>
      <tr><th>Jahr</th><th>Ertrag (kWh)</th><th>Ertrag (€)</th></tr>
    </thead><tbody>`;
  data.forEach(d=>{
    out+=`<tr><td>${d.j}</td><td>${d.ertrag}</td><td>${d.wert}</td></tr>`;
  });
  out+=`</tbody></table>
    <h3>EEG-Tarife & Erträge</h3>
    <table id="eegTabelle"><thead>
      <tr><th>Jahr</th><th>Tarif (ct/kWh)</th><th>Monats-€</th><th>Jahres-€</th></tr>
    </thead><tbody>`;
  data.forEach(d=>{
    const yYear = year+d.j-1;
    const tVale = ((d.j<=20 && yYear<=2024)?(eegRates[yYear]||eegRates[2024]):(tarif*100)).toFixed(2);
    const mon = (d.ertrag/12 * (tVale/100)).toFixed(2), yr=(d.ertrag*(tVale/100)).toFixed(2);
    out+=`<tr><td>${yYear}</td><td>${tVale}</td><td>${mon}</td><td>${yr}</td></tr>`;
  });
  out+=`</tbody></table>
    <h3>Reinigungseffekte</h3><ul>`;
  cleaning.forEach(c=>{
    out+=`<li>J${c.j}: Verlust ${c.loss.toFixed(0)} kWh → Mehrerlös ${(c.loss*tarif).toFixed(2)} € (Kosten ${c.cost.toFixed(2)} €)</li>`;
  });
  out+=`</ul>`;
  document.getElementById('ergebnis').innerHTML = out;

  // 7. PDF-Export via html2pdf.js mit Sichtbarkeitsprüfung
function exportPDF() {
  const element = document.getElementById('ergebnis');

  if (!element || element.offsetHeight === 0) {
    console.warn('PDF-Element ist leer oder nicht sichtbar.');
    alert('PDF kann nicht generiert werden – Ergebnisse fehlen oder sind nicht sichtbar.');
    return;
  }

  html2pdf().set({
    margin:     10,
    filename:   `Urkunde_PV-Rentabilitaet_${new Date().toISOString().slice(0,10)}.pdf`,
    image:      { type: 'jpeg', quality: 0.98 },
    html2canvas:{ scale: 2, useCORS: true },
    jsPDF:      { unit: 'pt', format: 'a4', orientation: 'portrait' }
  }).from(element).save();
}
