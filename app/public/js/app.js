// State
let selectedProperty = null;
let sessionId = null;
let chatHistory = [];

// DOM
const mapEl = document.getElementById('map');
const addressInput = document.getElementById('address-input');
const searchBtn = document.getElementById('search-btn');
const propertyInfo = document.getElementById('property-info');
const chatPanel = document.getElementById('chat-panel');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatWithBtn = document.getElementById('chat-with-property');
const backBtn = document.getElementById('back-to-map');

// Map setup — centered on Roberts Creek area
const map = L.map('map').setView([49.42, -123.65], 13);

// Base tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; OpenStreetMap contributors',
  maxZoom: 19,
}).addTo(map);

// SCRD zoning overlay from ArcGIS
try {
  L.esri.dynamicMapLayer({
    url: 'https://maps.scrd.ca/arcgis/rest/services/mySCRDpub_PlanningDevelopment/MapServer',
    layers: [14],
    opacity: 0.35,
  }).addTo(map);
} catch (e) { console.warn('Zoning layer failed:', e); }

// Parcel boundaries
try {
  L.esri.featureLayer({
    url: 'https://maps.scrd.ca/arcgis/rest/services/mySCRDpub_PropertyInformation/FeatureServer/0',
    style: () => ({ color: '#333', weight: 0.5, fillOpacity: 0 }),
    minZoom: 15,
  }).addTo(map);
} catch (e) { console.warn('Parcel layer failed:', e); }

// Selected parcel highlight
let highlightLayer = null;

function clearHighlight() {
  if (highlightLayer) {
    map.removeLayer(highlightLayer);
    highlightLayer = null;
  }
}

function highlightParcel(geometry) {
  clearHighlight();
  // ArcGIS rings -> Leaflet latlngs (swap lon/lat)
  const latlngs = geometry.rings.map(ring =>
    ring.map(p => [p[1], p[0]])
  );
  highlightLayer = L.polygon(latlngs, {
    color: '#2c5f2d',
    weight: 3,
    fillColor: '#2c5f2d',
    fillOpacity: 0.2,
  }).addTo(map);
}

// Click on map to select a parcel
map.on('click', async (e) => {
  const { lat, lng } = e.latlng;
  if (map.getZoom() < 15) {
    map.setView(e.latlng, 16);
    return;
  }
  await selectParcelAt(lng, lat);
});

async function selectParcelAt(lon, lat) {
  const qs = new URLSearchParams({
    f: 'json',
    geometry: `${lon},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    outFields: 'PID,CIVIC_ADDRESS,LOT_SIZE,JURISDICTION,FOLIO,LOT,PLAN_NUMBER,DIST_LOT',
    returnGeometry: 'true',
    outSR: '4326',
  });
  const res = await fetch(
    `https://maps.scrd.ca/arcgis/rest/services/mySCRDpub_PropertyInformation/FeatureServer/0/query?${qs}`
  );
  const data = await res.json();
  if (!data.features || !data.features.length) return;

  let feat;

  if (data.features.length === 1) {
    feat = data.features[0];
  } else {
    // Multiple features — likely strata. Dedupe by address prefix and let user pick.
    const unique = dedupeStrataFeatures(data.features);
    if (unique.length === 1) {
      feat = unique[0];
    } else {
      feat = await showParcelPicker(unique);
      if (!feat) return;
    }
  }

  // Highlight immediately with what we already have
  highlightParcel(feat.geometry);
  const bounds = highlightLayer.getBounds();
  map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });

  // Show partial info right away
  const pid = feat.attributes.PID;
  showPropertyPartial(feat.attributes);

  // Load planning context + neighbours in background
  const propRes = await fetch(`/api/property/${pid}`);
  const propData = await propRes.json();
  showPropertyFull(propData);
}

function dedupeStrataFeatures(features) {
  // If all features share the same street address (e.g. "5780 TRAIL AVE"),
  // they're strata units. Group by base address.
  const byBase = {};
  for (const f of features) {
    const addr = f.attributes.CIVIC_ADDRESS || '';
    // Strip unit prefix: "101-5780 TRAIL AVE" -> "5780 TRAIL AVE"
    const base = addr.replace(/^[A-Z]?\d+-/, '').trim();
    if (!byBase[base]) byBase[base] = [];
    byBase[base].push(f);
  }

  const bases = Object.keys(byBase);
  if (bases.length === 1) {
    // All same building — just pick the first unit, use shared geometry
    // but show it as the strata address
    const units = byBase[bases[0]];
    const first = { ...units[0] };
    first.attributes = {
      ...first.attributes,
      CIVIC_ADDRESS: bases[0] + ` (${units.length}-unit strata)`,
      LOT_SIZE: first.attributes.LOT_SIZE || 'Strata',
    };
    return [first];
  }

  // Different properties overlapping — return all
  return features;
}

function showParcelPicker(features) {
  return new Promise((resolve) => {
    const list = features.map(f => f.attributes.CIVIC_ADDRESS || f.attributes.PID).join('\n');
    const choice = prompt(`Multiple properties found. Enter the number (1-${features.length}):\n\n` +
      features.map((f, i) => `${i + 1}. ${f.attributes.CIVIC_ADDRESS || f.attributes.PID}`).join('\n'));
    if (!choice) return resolve(null);
    const idx = parseInt(choice, 10) - 1;
    resolve(features[idx] || features[0]);
  });
}

function showPropertyPartial(attrs) {
  // Show what we have immediately from the ArcGIS parcel query
  selectedProperty = {
    address: attrs.CIVIC_ADDRESS,
    pid: attrs.PID,
    lot_size: attrs.LOT_SIZE,
    zoning: 'Loading...',
    zoning_code: null,
    ocp: 'Loading...',
    ocp_area: null,
    subdivision_district: 'Loading...',
    neighbours: [],
  };

  document.getElementById('prop-address').textContent = attrs.CIVIC_ADDRESS || 'No address';
  document.getElementById('prop-pid').textContent = attrs.PID;
  document.getElementById('prop-lot-size').textContent = attrs.LOT_SIZE || 'Strata (see strata plan)';
  document.getElementById('prop-zoning').textContent = 'Loading...';
  document.getElementById('prop-ocp').textContent = 'Loading...';
  document.getElementById('prop-subdiv').textContent = 'Loading...';
  chatWithBtn.disabled = true;
  chatWithBtn.textContent = 'Loading property context...';

  propertyInfo.classList.remove('hidden');
}

function showPropertyFull(data) {
  const { parcel, planning, neighbours } = data;

  selectedProperty = data.chatContext || {
    address: parcel.CIVIC_ADDRESS,
    pid: parcel.PID,
    lot_size: parcel.LOT_SIZE,
    zoning: planning.zoning ? `${planning.zoning.LANDUSE} (${planning.zoning.DESCRIP})` : 'Unknown',
    zoning_code: planning.zoning ? planning.zoning.LANDUSE : null,
    ocp: planning.ocp ? planning.ocp.LANDUSE : 'Unknown',
    ocp_area: planning.ocp ? planning.ocp.OCP_NAME : null,
    subdivision_district: planning.subdivision ? planning.subdivision.SUBDIVISIO : 'Unknown',
    neighbours: neighbours || [],
  };

  document.getElementById('prop-zoning').textContent = selectedProperty.zoning;
  document.getElementById('prop-ocp').textContent = selectedProperty.ocp;
  document.getElementById('prop-subdiv').textContent = selectedProperty.subdivision_district;
  chatWithBtn.disabled = false;
  chatWithBtn.textContent = 'Chat about this property';
}

// Address search
searchBtn.addEventListener('click', doSearch);
addressInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doSearch();
});

async function doSearch() {
  const q = addressInput.value.trim();
  if (!q) return;

  searchBtn.disabled = true;
  searchBtn.textContent = '...';

  try {
    const res = await fetch(`/api/property/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();

    if (!data.features || !data.features.length) {
      alert('No properties found for that address.');
      return;
    }

    const feat = data.features[0];
    const pid = feat.attributes.PID;

    // Highlight and show partial immediately
    highlightParcel(feat.geometry);
    const bounds = highlightLayer.getBounds();
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 });
    showPropertyPartial(feat.attributes);

    // Load full details in background
    const propRes = await fetch(`/api/property/${pid}`);
    const propData = await propRes.json();
    showPropertyFull(propData);
  } catch (err) {
    console.error('Search error:', err);
    alert('Search failed: ' + err.message);
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = 'Search';
  }
}

// Open chat
chatWithBtn.addEventListener('click', () => {
  if (!selectedProperty) return;
  sessionId = null;
  chatHistory = [];
  chatMessages.innerHTML = '';
  document.getElementById('chat-property-label').textContent = selectedProperty.address;
  chatPanel.classList.remove('hidden');
  document.querySelector('main').classList.add('chat-open');
  map.invalidateSize();
  chatInput.focus();

  const surroundingCount = Array.isArray(selectedProperty.neighbours)
    ? selectedProperty.neighbours.length
    : 0;
  const surroundingsSummary = surroundingCount
    ? `I also have zoning, OCP, subdivision, and directional map context for **${surroundingCount} surrounding ${surroundingCount === 1 ? 'property' : 'properties'}**. You can refer to one naturally—for example, "the property to the north."`
    : '';

  // Send initial context message
  addMessage('assistant', `Here's what I know about **${selectedProperty.address}**:\n\n` +
    `- **Zoning:** ${selectedProperty.zoning}\n` +
    `- **OCP Land Use:** ${selectedProperty.ocp}\n` +
    `- **Subdivision District:** ${selectedProperty.subdivision_district}\n` +
    `- **Lot Size:** ${selectedProperty.lot_size}\n\n` +
    surroundingsSummary +
    (surroundingsSummary ? '\n\n' : '') +
    `Ask me anything — what you can build, whether you can subdivide, run a business from home, add a suite, or anything else about your property. Plain language is fine, I'll figure out the bylaw stuff.`);
});

backBtn.addEventListener('click', () => {
  chatPanel.classList.add('hidden');
  document.querySelector('main').classList.remove('chat-open');
  // Small delay so the layout settles before Leaflet recalculates
  setTimeout(() => map.invalidateSize(), 100);
});

// Chat
// Submit on Enter, newline on Shift+Enter, auto-grow
chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatForm.requestSubmit();
  }
});
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 128) + 'px';
});

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (!msg) return;

  const sendBtn = chatForm.querySelector('button');
  chatInput.value = '';
  chatInput.disabled = true;
  sendBtn.disabled = true;
  addMessage('user', msg);

  const thinkingEl = addMessage('thinking', 'Thinking...');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg,
        sessionId,
        propertyContext: sessionId ? undefined : selectedProperty,
      }),
    });

    const data = await res.json();
    thinkingEl.remove();

    if (data.error) {
      addMessage('assistant', `Error: ${data.error}`);
    } else {
      sessionId = data.sessionId;
      addMessage('assistant', data.reply);
    }
  } catch (err) {
    thinkingEl.remove();
    addMessage('assistant', `Error: ${err.message}`);
  } finally {
    chatInput.disabled = false;
    sendBtn.disabled = false;
    chatInput.style.height = 'auto';
    chatInput.focus();
  }
});

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `message ${role}`;

  if (role === 'assistant') {
    div.innerHTML = renderMarkdown(text);
  } else {
    div.textContent = text;
  }

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Minimal markdown renderer — escapes HTML first, then applies safe transforms
function renderMarkdown(text) {
  let html = escapeHtml(text);

  // Code blocks (use escaped content)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Headers
  html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
  // Numbered lists
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
  // Unordered lists
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  // Table rows
  html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
    const cells = content.split('|').map(c => c.trim());
    if (cells.every(c => /^-+$/.test(c))) return '';
    const tag = cells.every(c => /^[A-Z]/.test(c) || c.length < 20) ? 'th' : 'td';
    return '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
  });

  // Wrap consecutive <li> in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');
  // Wrap consecutive <tr> in <table>
  html = html.replace(/((?:<tr>.*<\/tr>\n?)+)/g, '<table>$1</table>');
  // Paragraphs
  html = html.split('\n\n').map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<')) return p;
    return `<p>${p}</p>`;
  }).join('\n');

  return html;
}

console.log('SCRD app loaded — search and chat ready');
