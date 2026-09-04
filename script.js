if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(() => console.log('IronLog Service Worker Registered'))
    .catch(err => console.error('Service Worker Registration Failed:', err));
}

let rideData = JSON.parse(localStorage.getItem('ironlog_ride')) || null;

function init() {
  if (rideData) {
    document.getElementById('setup-card')?.classList.add('hidden');
    document.getElementById('dash-card')?.classList.remove('hidden');
    document.getElementById('log-card')?.classList.remove('hidden');
    document.getElementById('history-card')?.classList.remove('hidden');
    updateDashboard();
    setInterval(updateTimer, 1000);
  }
}

function updateFileLabel(inputId, labelId) {
  const input = document.getElementById(inputId);
  const label = document.getElementById(labelId);
  if (input && input.files.length > 0) {
    label.innerText = `✓ PHOTO CAPTURED`;
    label.style.borderColor = 'var(--success)';
    label.style.color = 'var(--success)';
  }
}

/**
 * Compresses camera uploads on an HTML Canvas to prevent localStorage quota errors.
 * Resizes max dimension to 1000px and applies JPEG quality compression.
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file selected'));
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 1000;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Compress image to JPEG at 60% quality (~50KB-100KB)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
        resolve(compressedBase64);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
}

async function startRide() {
  try {
    const locationInput = document.getElementById('start-location');
    const odoInput = document.getElementById('start-odo');
    const photoInput = document.getElementById('start-photo');

    const location = locationInput ? (locationInput.value || 'Start Point') : 'Start Point';
    const odo = odoInput ? parseFloat(odoInput.value) : NaN;

    if (isNaN(odo)) {
      alert('Please enter a valid starting odometer reading.');
      return;
    }

    if (!photoInput || photoInput.files.length === 0) {
      alert('Please capture a start receipt photo.');
      return;
    }

    // Compress photo before save
    const photoBase64 = await fileToBase64(photoInput.files[0]);

    rideData = {
      startTime: Date.now(),
      startOdo: odo,
      stops: [{
        type: 'START',
        timestamp: Date.now(),
        odo: odo,
        legDist: 0,
        location: location,
        photoData: photoBase64,
        gallons: '',
        cost: '',
        notes: ''
      }]
    };

    localStorage.setItem('ironlog_ride', JSON.stringify(rideData));
    window.location.reload();

  } catch (error) {
    console.error("Error starting ride:", error);
    alert("Could not start ride: " + error.message);
  }
}

function updateTimer() {
  if (!rideData) return;
  const elapsedMs = Date.now() - rideData.startTime;
  const totalMs = 24 * 60 * 60 * 1000;
  const remainingMs = totalMs - elapsedMs;

  if (remainingMs <= 0) {
    document.getElementById('time-remaining').innerText = "00:00:00";
    return;
  }

  const hrs = Math.floor(remainingMs / (1000 * 60 * 60));
  const mins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((remainingMs % (1000 * 60)) / 1000);

  document.getElementById('time-remaining').innerText = 
    `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function validateOdometer() {
  const inputOdo = parseFloat(document.getElementById('stop-odo').value);
  const warningBox = document.getElementById('odo-warning');
  const lastOdo = rideData.stops[rideData.stops.length - 1].odo;

  if (!inputOdo) {
    warningBox.style.display = 'none';
    return;
  }

  const leg = inputOdo - lastOdo;

  if (leg <= 0) {
    warningBox.innerText = `⚠️ Reading is less than or equal to previous stop (${lastOdo}).`;
    warningBox.style.display = 'block';
  } else if (leg > 350) {
    warningBox.innerText = `⚠️ Calculated leg is ${leg} miles (>350 max). Did you fat-finger a digit?`;
    warningBox.style.display = 'block';
  } else {
    warningBox.innerText = `Calculated leg: ${leg} miles.`;
    warningBox.style.display = 'block';
  }
}

async function saveStop() {
  try {
    const typeSelect = document.getElementById('stop-type');
    const photoInput = document.getElementById('stop-photo');
    const inputOdo = parseFloat(document.getElementById('stop-odo').value);
    const location = document.getElementById('stop-location').value || 'Unspecified Stop';
    const lastOdo = rideData.stops[rideData.stops.length - 1].odo;

    // Read dynamic stop type, default to 'FUEL' if missing
    const stopType = typeSelect ? typeSelect.value : 'FUEL';

    if (photoInput.files.length === 0) {
      alert('A receipt or witness photo is required to save a stop.');
      return;
    }

    const photoBase64 = await fileToBase64(photoInput.files[0]);
    const currentOdo = inputOdo || lastOdo;
    const legDist = currentOdo - lastOdo;

    rideData.stops.push({
      type: stopType,
      timestamp: Date.now(),
      odo: currentOdo,
      legDist: legDist > 0 ? legDist : 0,
      location: location,
      photoData: photoBase64,
      gallons: '',
      cost: '',
      notes: ''
    });

    localStorage.setItem('ironlog_ride', JSON.stringify(rideData));
    
    // Reset Form
    document.getElementById('stop-odo').value = '';
    document.getElementById('stop-location').value = '';
    document.getElementById('stop-photo').value = '';
    if (typeSelect) typeSelect.selectedIndex = 0;

    document.getElementById('odo-warning').style.display = 'none';
    document.getElementById('stop-file-label').innerText = '📷 SNAP RECEIPT PHOTO';
    document.getElementById('stop-file-label').style.borderColor = '#555';
    document.getElementById('stop-file-label').style.color = '#fff';

    updateDashboard();
  } catch (error) {
    console.error("Error saving stop:", error);
    alert("Could not save stop: " + error.message);
  }
}

function updateDashboard() {
  for (let i = 1; i < rideData.stops.length; i++) {
    rideData.stops[i].legDist = rideData.stops[i].odo - rideData.stops[i - 1].odo;
  }

  const lastStop = rideData.stops[rideData.stops.length - 1];
  const totalDist = lastStop.odo - rideData.startOdo;

  document.getElementById('total-dist').innerText = totalDist > 0 ? totalDist : 0;
  document.getElementById('stop-count').innerText = rideData.stops.length - 1;

  const listContainer = document.getElementById('log-list');
  listContainer.innerHTML = '';

  rideData.stops.forEach((stop, index) => {
    const timeStr = new Date(stop.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const item = document.createElement('div');
    item.className = 'stop-entry';
    item.onclick = () => openEditModal(index);
    item.innerHTML = `
      <div class="stop-info">
        <b>#${index} ${stop.type}</b> - ${timeStr}<br>
        Odo: ${stop.odo} | Leg: +${stop.legDist} mi | Loc: ${stop.location}
      </div>
      <div class="chevron">❯</div>
    `;
    listContainer.appendChild(item);
  });

  updateTimer();
}

function openEditModal(index) {
  const stop = rideData.stops[index];
  document.getElementById('edit-index').value = index;
  document.getElementById('edit-index-title').innerText = index;
  document.getElementById('edit-location').value = stop.location || '';
  document.getElementById('edit-odo').value = stop.odo;
  document.getElementById('edit-gallons').value = stop.gallons || '';
  document.getElementById('edit-cost').value = stop.cost || '';
  document.getElementById('edit-notes').value = stop.notes || '';
  
  const imgPreview = document.getElementById('edit-photo-preview');
  imgPreview.src = stop.photoData || '';

  document.getElementById('edit-modal').classList.remove('hidden');
}

async function handlePhotoReplace() {
  const input = document.getElementById('edit-photo-input');
  if (input.files.length > 0) {
    const newBase64 = await fileToBase64(input.files[0]);
    document.getElementById('edit-photo-preview').src = newBase64;
  }
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}

function saveEdit() {
  const index = parseInt(document.getElementById('edit-index').value);
  const newLoc = document.getElementById('edit-location').value;
  const newOdo = parseFloat(document.getElementById('edit-odo').value);
  const newGallons = document.getElementById('edit-gallons').value;
  const newCost = document.getElementById('edit-cost').value;
  const newNotes = document.getElementById('edit-notes').value;
  const newPhotoData = document.getElementById('edit-photo-preview').src;

  if (!newOdo) {
    alert('Odometer reading cannot be empty.');
    return;
  }

  rideData.stops[index].location = newLoc;
  rideData.stops[index].odo = newOdo;
  rideData.stops[index].gallons = newGallons;
  rideData.stops[index].cost = newCost;
  rideData.stops[index].notes = newNotes;
  rideData.stops[index].photoData = newPhotoData;

  if (index === 0) {
    rideData.startOdo = newOdo;
  }

  localStorage.setItem('ironlog_ride', JSON.stringify(rideData));
  closeEditModal();
  updateDashboard();
}

function toggleSettings() {
  document.getElementById('settings-area').classList.toggle('hidden');
}

function resetRide() {
  if (confirm('Are you SURE you want to purge all current ride data? This action cannot be undone.')) {
    localStorage.removeItem('ironlog_ride');
    location.reload();
  }
}

async function generateIBAPDF() {
  if (!rideData || rideData.stops.length === 0) {
    alert("No ride data available to export.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'letter' });

  const lastStop = rideData.stops[rideData.stops.length - 1];
  const totalDist = lastStop.odo - rideData.startOdo;
  const elapsedMs = lastStop.timestamp - rideData.startTime;
  const elapsedHrs = (elapsedMs / (1000 * 60 * 60)).toFixed(2);

  doc.setFontSize(18);
  doc.setTextColor(220, 120, 0);
  doc.text("IRONLOG - IBA LOGBOOK PACKET", 14, 20);

  doc.setFontSize(10);
  doc.setTextColor(50, 50, 50);
  doc.text(`Ride Start: ${new Date(rideData.startTime).toLocaleString()}`, 14, 28);
  doc.text(`Starting Odometer: ${rideData.startOdo} mi`, 14, 33);
  doc.text(`Total Distance: ${totalDist} mi`, 110, 28);
  doc.text(`Total Elapsed Time: ${elapsedHrs} hours`, 110, 33);

  doc.setLineWidth(0.5);
  doc.line(14, 37, 202, 37);

  const tableRows = rideData.stops.map((stop, index) => [
    `#${index} (${stop.type})`,
    new Date(stop.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    stop.location || 'N/A',
    stop.odo,
    `+${stop.legDist}`,
    stop.gallons || '-',
    stop.cost ? `$${stop.cost}` : '-',
    stop.notes || ''
  ]);

  doc.autoTable({
    startY: 42,
    head: [['Stop', 'Time', 'Location', 'Odometer', 'Leg (mi)', 'Gal', 'Cost', 'Notes']],
    body: tableRows,
    theme: 'grid',
    headStyles: { fillColor: [220, 120, 0], textColor: [255, 255, 255] },
    styles: { fontSize: 8, cellPadding: 2 }
  });

  doc.addPage();
  doc.setFontSize(16);
  doc.setTextColor(220, 120, 0);
  doc.text("RECEIPT DOCUMENTATION ANNEX", 14, 20);

  let yOffset = 30;

  for (let i = 0; i < rideData.stops.length; i++) {
    const stop = rideData.stops[i];
    if (stop.photoData) {
      if (yOffset > 210) {
        doc.addPage();
        yOffset = 20;
      }

      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(`Stop #${i} (${stop.type}) - Odometer: ${stop.odo} mi - ${stop.location || 'N/A'}`, 14, yOffset);

      try {
        doc.addImage(stop.photoData, 'JPEG', 14, yOffset + 3, 80, 60);
      } catch (e) {
        console.error(`Could not attach image for stop #${i}:`, e);
      }

      yOffset += 70;
    }
  }

  doc.save(`IronLog_${rideData.startOdo}.pdf`);
}

function exportIBACSV() {
  if (!rideData || rideData.stops.length === 0) {
    alert("No ride data available to export.");
    return;
  }

  const headers = ["Stop Number", "Stop Type", "Date", "Time", "Location", "Odometer", "Leg Distance (mi)", "Gallons", "Cost ($)", "Notes"];
  const csvRows = [headers.join(",")];

  rideData.stops.forEach((stop, index) => {
    const dateObj = new Date(stop.timestamp);
    const dateStr = dateObj.toLocaleDateString();
    const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    const row = [
      index,
      `"${stop.type}"`,
      `"${dateStr}"`,
      `"${timeStr}"`,
      `"${(stop.location || '').replace(/"/g, '""')}"`,
      stop.odo,
      stop.legDist,
      stop.gallons || '',
      stop.cost || '',
      `"${(stop.notes || '').replace(/"/g, '""')}"`
    ];

    csvRows.push(row.join(","));
  });

  const csvString = csvRows.join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `IronLog_${rideData.startOdo}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

document.addEventListener('DOMContentLoaded', () => {
  init();
});