// *** START: PICKUP TIME MANAGEMENT FUNCTIONS ***
async function addPickupTime() {
  const dateInput = document.getElementById('pickup-date-input');
  const timeInput = document.getElementById('pickup-time-input');
  const date = dateInput.value;
  const time = timeInput.value.trim();

  if (!date || !time) {
    showStatus('Please enter both a date and a time range.', 'warning');
    return;
  }

  const btn = event.target;
  const stopLoading = showLoading(btn);

  try {
    await firebase.firestore().collection('pickupTimes').add({
      date,
      time,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    showStatus('Pickup time added successfully!', 'success');
    dateInput.value = '';
    timeInput.value = '';
    loadPickupTimes(); // Refresh the list
  } catch (err) {
    console.error("Error adding pickup time:", err);
    showStatus('Failed to add pickup time.', 'error');
  } finally {
    stopLoading();
  }
}

async function loadPickupTimes() {
  if (!userData || userData.role !== 'admin') return;

  const pickupTimesDiv = document.getElementById('pickup-times-list');
  pickupTimesDiv.innerHTML = '<div class="empty-state"><span class="loading"></span> Loading pickup times...</div>';

  try {
    const snapshot = await firebase.firestore().collection('pickupTimes').orderBy('createdAt', 'desc').get();
    if (snapshot.empty) {
      pickupTimesDiv.innerHTML = '<div class="empty-state"><p>No pickup times have been added.</p></div>';
      return;
    }

    pickupTimesDiv.innerHTML = '';
    snapshot.forEach(doc => {
      const time = doc.data();
      const timeDiv = document.createElement('div');
      timeDiv.className = 'admin-menu-item'; // Reuse style for consistency
      timeDiv.innerHTML = `
        <div class="menu-item-header">
          <div class="menu-item-emoji">⏰</div>
          <div class="menu-item-info">
            <h3>Date: ${time.date}</h3>
            <p>Time: ${time.time}</p>
          </div>
        </div>
        <div class="item-controls">
          <button class="btn btn-danger" onclick="deletePickupTime('${doc.id}')">🗑️ Delete</button>
        </div>
      `;
      pickupTimesDiv.appendChild(timeDiv);
    });
  } catch (err) {
    console.error("Error loading pickup times:", err);
    showStatus("Failed to load pickup times.", 'error');
    pickupTimesDiv.innerHTML = '<div class="empty-state"><p>Error loading times. Check console.</p></div>';
  }
}

async function deletePickupTime(id) {
  if (!confirm('Are you sure you want to delete this pickup time?')) {
    return;
  }

  const btn = event.target;
  const stopLoading = showLoading(btn);

  try {
    await firebase.firestore().collection('pickupTimes').doc(id).delete();
    showStatus('Pickup time deleted successfully.', 'success');
    loadPickupTimes(); // Refresh the list
  } catch (err) {
    console.error("Error deleting pickup time:", err);
    showStatus('Failed to delete pickup time.', 'error');
  } finally {
    stopLoading();
  }
}
// *** END: PICKUP TIME MANAGEMENT FUNCTIONS ***
