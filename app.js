// Main application logic for Order Tracker.

const PRODUCTS = [
  "Yellow 5-Cob Bag",
  "Bicolor 5-Cob Bag",
  "Yellow 4-Dozen Bag",
  "Bicolor 4-Dozen Bag",
  "Yellow Box",
  "Bicolor Box",
  "Yellow Bin",
  "Bicolor Bin",
];

const STATUS_FLOW = {
  OPEN: "PACKED",
  PACKED: "SHIPPED",
  SHIPPED: null,
};

const UNITS_LABELS = {
  Skid: "Units per skid",
  Rack: "Units per rack",
  Bin: "Units per bin",
  Other: "Units per container",
};

function unitsLabelFor(method) {
  return UNITS_LABELS[method] || "Units per pack";
}

function unitsHintText(product, packMethod) {
  const standard = getStandardUnitsPerPack(product, packMethod);
  return standard != null ? `(standard: ${standard})` : "";
}

function unitsNounFor(product) {
  const category = productCategory(product);
  if (category === "bag") return "Bags";
  if (category === "box") return "Boxes";
  return "Cobs";
}

function packMethodLabel(method, quantity) {
  return quantity === 1 ? method : `${method}s`;
}

async function forceReloadBypassCache() {
  if (window.caches && caches.keys) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    } catch (err) {
      // Cache Storage API unavailable or blocked; fall through to URL-based bust.
    }
  }

  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("_cb", Date.now().toString());
  window.location.replace(url.toString());
}

let orders = [];
let customers = [];
let editingOrderId = null;
let editingStatusOrderId = null;
let packTodayOnly = false;

const els = {};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  cacheEls();
  bindStaticEvents();

  try {
    [customers, orders] = await Promise.all([db.getCustomers(), db.getOrders()]);
  } catch (err) {
    console.error(err);
    els.loadingState.textContent = "Failed to load orders. Check your connection and Supabase config.";
    return;
  }

  populateCustomerOptions();
  els.loadingState.hidden = true;
  renderOrders();
  subscribeToRealtime();
}

function cacheEls() {
  els.newOrderBtn = document.getElementById("new-order-btn");
  els.checkUpdatesBtn = document.getElementById("check-updates-btn");
  els.orderModal = document.getElementById("order-modal");
  els.orderForm = document.getElementById("order-form");
  els.cancelOrderBtn = document.getElementById("cancel-order-btn");
  els.formError = document.getElementById("form-error");

  els.modalTitle = document.getElementById("modal-title");
  els.saveOrderBtn = document.getElementById("save-order-btn");
  els.customerSelect = document.getElementById("customer-select");
  els.newCustomerInput = document.getElementById("new-customer-input");

  els.linesContainer = document.getElementById("order-lines-container");
  els.addLineBtn = document.getElementById("add-line-btn");
  els.lineTemplate = document.getElementById("order-line-template");

  els.shipDateInput = document.getElementById("ship-date-input");
  els.packByDateInput = document.getElementById("pack-by-date-input");
  els.destinationInput = document.getElementById("destination-input");
  els.poNumberInput = document.getElementById("po-number-input");
  els.pickupLocationSelect = document.getElementById("pickup-location-select");
  els.notesInput = document.getElementById("notes-input");
  els.createdByInput = document.getElementById("created-by-input");

  els.statusFilter = document.getElementById("status-filter");
  els.dateFieldSelect = document.getElementById("date-field-select");
  els.sortOrder = document.getElementById("sort-order");
  els.dayFilter = document.getElementById("day-filter");
  els.clearDayFilterBtn = document.getElementById("clear-day-filter-btn");
  els.flaggedOnly = document.getElementById("flagged-only");
  els.packTodayBtn = document.getElementById("pack-today-btn");
  els.clearPackTodayBtn = document.getElementById("clear-pack-today-btn");

  els.orderList = document.getElementById("order-list");
  els.emptyState = document.getElementById("empty-state");
  els.loadingState = document.getElementById("loading-state");
  els.cardTemplate = document.getElementById("order-card-template");
  els.lineDisplayTemplate = document.getElementById("order-line-display-template");
  els.statusHistoryItemTemplate = document.getElementById("status-history-item-template");

  els.statusModal = document.getElementById("status-modal");
  els.statusForm = document.getElementById("status-form");
  els.statusSelect = document.getElementById("status-select");
  els.statusChangedByInput = document.getElementById("status-changed-by-input");
  els.statusFormError = document.getElementById("status-form-error");
  els.cancelStatusBtn = document.getElementById("cancel-status-btn");
}

function bindStaticEvents() {
  els.newOrderBtn.addEventListener("click", () => openOrderModal(null));
  els.checkUpdatesBtn.addEventListener("click", forceReloadBypassCache);
  els.cancelOrderBtn.addEventListener("click", () => els.orderModal.close());
  els.orderForm.addEventListener("submit", handleFormSubmit);
  els.orderModal.addEventListener("close", () => {
    editingOrderId = null;
  });

  els.customerSelect.addEventListener("change", () => {
    els.newCustomerInput.hidden = els.customerSelect.value !== "__new__";
    if (!els.newCustomerInput.hidden) els.newCustomerInput.focus();
  });

  els.addLineBtn.addEventListener("click", () => addLineRow());

  els.statusFilter.addEventListener("change", renderOrders);
  els.dateFieldSelect.addEventListener("change", renderOrders);
  els.sortOrder.addEventListener("change", renderOrders);
  els.flaggedOnly.addEventListener("change", renderOrders);

  els.dayFilter.addEventListener("change", () => {
    els.clearDayFilterBtn.hidden = !els.dayFilter.value;
    renderOrders();
  });
  els.clearDayFilterBtn.addEventListener("click", () => {
    els.dayFilter.value = "";
    els.clearDayFilterBtn.hidden = true;
    renderOrders();
  });

  els.cancelStatusBtn.addEventListener("click", () => els.statusModal.close());
  els.statusForm.addEventListener("submit", handleStatusFormSubmit);
  els.statusModal.addEventListener("close", () => {
    editingStatusOrderId = null;
  });

  els.packTodayBtn.addEventListener("click", () => {
    packTodayOnly = true;
    els.dayFilter.value = "";
    els.clearDayFilterBtn.hidden = true;
    updatePackTodayUI();
    renderOrders();
  });
  els.clearPackTodayBtn.addEventListener("click", () => {
    packTodayOnly = false;
    updatePackTodayUI();
    renderOrders();
  });
}

function updatePackTodayUI() {
  els.packTodayBtn.hidden = packTodayOnly;
  els.clearPackTodayBtn.hidden = !packTodayOnly;
  els.dateFieldSelect.disabled = packTodayOnly;
  els.dayFilter.disabled = packTodayOnly;
}

function localDateKey(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayHeadingLabel(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function fullDateTimeLabel(date) {
  return date.toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toDatetimeLocalValue(isoString) {
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function populateCustomerOptions() {
  const addNewOpt = els.customerSelect.querySelector('option[value="__new__"]');
  els.customerSelect.querySelectorAll("option[data-customer]").forEach((o) => o.remove());

  for (const customer of customers) {
    const opt = document.createElement("option");
    opt.value = customer.name;
    opt.textContent = customer.name;
    opt.dataset.customer = "true";
    els.customerSelect.insertBefore(opt, addNewOpt);
  }
}

// --- Order line rows within the New/Edit Order form ---

function addLineRow(line) {
  const node = els.lineTemplate.content.cloneNode(true);
  const row = node.querySelector(".order-line");

  const productSelect = row.querySelector(".line-product");
  for (const product of PRODUCTS) {
    const opt = document.createElement("option");
    opt.value = product;
    opt.textContent = product;
    productSelect.appendChild(opt);
  }

  const packMethodSelect = row.querySelector(".line-pack-method");
  const unitsLabel = row.querySelector(".line-units-label");
  const unitsInput = row.querySelector(".line-units");
  const unitsHint = row.querySelector(".line-units-hint");
  const quantityInput = row.querySelector(".line-quantity");
  const removeBtn = row.querySelector(".remove-line-btn");

  function applyUnitsDefault() {
    const standard = getStandardUnitsPerPack(productSelect.value, packMethodSelect.value);
    if (standard != null) unitsInput.value = standard;
    unitsHint.textContent = unitsHintText(productSelect.value, packMethodSelect.value);
  }

  productSelect.addEventListener("change", applyUnitsDefault);
  packMethodSelect.addEventListener("change", () => {
    applyUnitsDefault();
    unitsLabel.textContent = unitsLabelFor(packMethodSelect.value);
  });

  removeBtn.addEventListener("click", () => {
    row.remove();
    updateRemoveLineButtons();
  });

  if (line) {
    productSelect.value = line.product;
    packMethodSelect.value = line.pack_method;
    unitsHint.textContent = unitsHintText(line.product, line.pack_method);
    unitsLabel.textContent = unitsLabelFor(line.pack_method);
    unitsInput.value = line.units_per_pack;
    quantityInput.value = line.quantity;
  }

  els.linesContainer.appendChild(row);
  updateRemoveLineButtons();
}

function updateRemoveLineButtons() {
  const rows = els.linesContainer.querySelectorAll(".order-line");
  rows.forEach((row) => {
    row.querySelector(".remove-line-btn").hidden = rows.length <= 1;
  });
}

function readLinesFromForm() {
  return Array.from(els.linesContainer.querySelectorAll(".order-line")).map((row) => ({
    product: row.querySelector(".line-product").value,
    pack_method: row.querySelector(".line-pack-method").value,
    units_per_pack: Number(row.querySelector(".line-units").value),
    quantity: Number(row.querySelector(".line-quantity").value),
  }));
}

// --- New/Edit Order modal ---

function openOrderModal(order) {
  els.orderForm.reset();
  els.newCustomerInput.hidden = true;
  els.formError.hidden = true;
  els.linesContainer.innerHTML = "";

  if (order) {
    editingOrderId = order.id;
    els.modalTitle.textContent = "Edit Order";
    els.saveOrderBtn.textContent = "Save Changes";

    els.customerSelect.value = order.customer;
    els.shipDateInput.value = toDatetimeLocalValue(order.ship_date);
    els.packByDateInput.value = order.pack_by_date ? toDatetimeLocalValue(order.pack_by_date) : "";
    els.destinationInput.value = order.destination || "";
    els.poNumberInput.value = order.po_number || "";
    els.pickupLocationSelect.value = order.pickup_location || "";
    els.notesInput.value = order.notes || "";
    els.createdByInput.value = order.created_by || "";

    for (const line of order.lines) {
      addLineRow(line);
    }
  } else {
    editingOrderId = null;
    els.modalTitle.textContent = "New Order";
    els.saveOrderBtn.textContent = "Save Order";
    addLineRow();
  }

  els.orderModal.showModal();
}

async function handleFormSubmit(event) {
  event.preventDefault();
  els.formError.hidden = true;

  try {
    let customerName = els.customerSelect.value;
    if (customerName === "__new__") {
      customerName = els.newCustomerInput.value.trim();
      if (!customerName) {
        throw new Error("Enter a name for the new customer.");
      }
      const existing = customers.find(
        (c) => c.name.toLowerCase() === customerName.toLowerCase()
      );
      if (!existing) {
        const created = await db.createCustomer(customerName);
        customers.push(created);
        customers.sort((a, b) => a.name.localeCompare(b.name));
        populateCustomerOptions();
      }
    }

    const lines = readLinesFromForm();
    if (lines.length === 0) {
      throw new Error("Add at least one product line.");
    }

    const headerFields = {
      customer: customerName,
      ship_date: new Date(els.shipDateInput.value).toISOString(),
      pack_by_date: new Date(els.packByDateInput.value).toISOString(),
      destination: els.destinationInput.value.trim(),
      po_number: els.poNumberInput.value.trim(),
      pickup_location: els.pickupLocationSelect.value || null,
      notes: els.notesInput.value.trim(),
      created_by: els.createdByInput.value.trim(),
    };

    if (editingOrderId) {
      const updated = await db.updateOrder(editingOrderId, headerFields, lines);
      const idx = orders.findIndex((o) => o.id === editingOrderId);
      if (idx !== -1) orders[idx] = updated;
    } else {
      const saved = await db.createOrder({ ...headerFields, status: "OPEN" }, lines);
      orders.push(saved);
    }

    renderOrders();
    els.orderModal.close();
  } catch (err) {
    console.error(err);
    els.formError.textContent = err.message || "Failed to save order.";
    els.formError.hidden = false;
  }
}

async function deleteOrder(order) {
  const confirmed = confirm(`Delete this order for ${order.customer}? This can't be undone.`);
  if (!confirmed) return;

  try {
    await db.deleteOrder(order.id);
    orders = orders.filter((o) => o.id !== order.id);
    renderOrders();
  } catch (err) {
    console.error(err);
    alert("Failed to delete order. Try again.");
  }
}

function openStatusModal(order, presetStatus) {
  editingStatusOrderId = order.id;
  els.statusFormError.hidden = true;
  els.statusSelect.value = presetStatus || order.status;
  els.statusChangedByInput.value = "";
  els.statusModal.showModal();
}

async function handleStatusFormSubmit(event) {
  event.preventDefault();
  els.statusFormError.hidden = true;

  const order = orders.find((o) => o.id === editingStatusOrderId);
  if (!order) {
    els.statusModal.close();
    return;
  }

  const newStatus = els.statusSelect.value;
  const changedBy = els.statusChangedByInput.value.trim();

  if (!changedBy) {
    els.statusFormError.textContent = "Enter your name.";
    els.statusFormError.hidden = false;
    return;
  }
  if (newStatus === order.status) {
    els.statusFormError.textContent = "Pick a different status than the current one.";
    els.statusFormError.hidden = false;
    return;
  }

  try {
    await applyStatusChange(order, newStatus, changedBy);
    els.statusModal.close();
  } catch (err) {
    console.error(err);
    els.statusFormError.textContent = err.message || "Failed to update status.";
    els.statusFormError.hidden = false;
  }
}

async function applyStatusChange(order, newStatus, changedBy) {
  const { order: updated, logEntry } = await db.changeOrderStatus(order.id, order.status, newStatus, changedBy);
  const idx = orders.findIndex((o) => o.id === order.id);
  if (idx !== -1) {
    const prevLog = orders[idx].status_log || [];
    orders[idx] = { ...orders[idx], ...updated, status_log: [logEntry, ...prevLog] };
  }
  renderOrders();
}

function isLineFlagged(line) {
  const standard = getStandardUnitsPerPack(line.product, line.pack_method);
  return standard != null && Number(line.units_per_pack) !== standard;
}

function orderHasFlaggedLine(order) {
  return (order.lines || []).some(isLineFlagged);
}

function renderOrders() {
  const statusValue = els.statusFilter.value;
  const dateField = packTodayOnly ? "pack_by_date" : els.dateFieldSelect.value;
  const sortDir = els.sortOrder.value;
  const flaggedOnly = els.flaggedOnly.checked;
  const dayValue = els.dayFilter.value;

  let visible = orders.filter((o) => {
    if (statusValue === "ALL") return true;
    if (statusValue === "ACTIVE") return o.status === "OPEN" || o.status === "PACKED";
    return o.status === statusValue;
  });
  if (flaggedOnly) visible = visible.filter(orderHasFlaggedLine);
  if (packTodayOnly) {
    const todayKey = localDateKey(new Date());
    visible = visible.filter((o) => o.pack_by_date && localDateKey(new Date(o.pack_by_date)) === todayKey);
  } else if (dayValue) {
    visible = visible.filter((o) => localDateKey(new Date(o[dateField])) === dayValue);
  }

  visible.sort((a, b) => {
    const diff = new Date(a[dateField]) - new Date(b[dateField]);
    return sortDir === "asc" ? diff : -diff;
  });

  els.orderList.innerHTML = "";
  els.emptyState.hidden = visible.length !== 0;

  let currentDayKey = null;
  for (const order of visible) {
    const groupDate = new Date(order[dateField]);
    const dayKey = localDateKey(groupDate);
    if (dayKey !== currentDayKey) {
      currentDayKey = dayKey;
      const heading = document.createElement("h2");
      heading.className = "day-heading";
      heading.textContent = dayHeadingLabel(groupDate);
      els.orderList.appendChild(heading);
    }
    els.orderList.appendChild(buildOrderCard(order));
  }
}

function buildOrderCard(order) {
  const node = els.cardTemplate.content.cloneNode(true);
  const card = node.querySelector(".order-card");

  card.classList.add(`status-${order.status.toLowerCase()}`);

  node.querySelector(".order-customer").textContent = order.customer;

  const badge = node.querySelector(".status-badge");
  badge.textContent = order.status;
  badge.classList.add(`status-${order.status.toLowerCase()}`);

  const linesList = node.querySelector(".order-lines");
  for (const line of order.lines) {
    const lineNode = els.lineDisplayTemplate.content.cloneNode(true);
    lineNode.querySelector(".line-summary").textContent =
      `${line.quantity} ${packMethodLabel(line.pack_method, line.quantity)} of ${line.units_per_pack} ${unitsNounFor(line.product)} — ${line.product}`;
    lineNode.querySelector(".flag-badge").hidden = !isLineFlagged(line);
    linesList.appendChild(lineNode);
  }

  const shipEl = node.querySelector(".order-ship-date");
  const shipDate = new Date(order.ship_date);
  shipEl.textContent = `Ship: ${fullDateTimeLabel(shipDate)}`;
  if (order.status !== "SHIPPED" && shipDate.getTime() < Date.now()) {
    shipEl.classList.add("overdue");
  }

  const packByEl = node.querySelector(".order-pack-by-date");
  if (order.pack_by_date) {
    const packByDate = new Date(order.pack_by_date);
    packByEl.textContent = `Pack by: ${fullDateTimeLabel(packByDate)}`;
    if (order.status === "OPEN" && packByDate.getTime() < Date.now()) {
      packByEl.classList.add("overdue");
    }
  } else {
    packByEl.textContent = "Pack by: not set";
  }

  const destEl = node.querySelector(".order-destination");
  if (order.destination) {
    destEl.textContent = `To: ${order.destination}`;
  } else {
    destEl.remove();
  }

  const poEl = node.querySelector(".order-po-number");
  if (order.po_number) {
    poEl.textContent = `PO: ${order.po_number}`;
  } else {
    poEl.remove();
  }

  const pickupEl = node.querySelector(".order-pickup-location");
  if (order.pickup_location) {
    pickupEl.textContent = `Pickup: ${order.pickup_location}`;
  } else {
    pickupEl.remove();
  }

  const notesEl = node.querySelector(".order-notes");
  if (order.notes) {
    notesEl.textContent = order.notes;
  } else {
    notesEl.remove();
  }

  node.querySelector(".order-meta").textContent =
    `Created by ${order.created_by || "unknown"} on ${new Date(order.created_at).toLocaleDateString()}`;

  const statusHistory = node.querySelector(".status-history");
  const statusLog = order.status_log || [];
  if (statusLog.length > 0) {
    const historyList = statusHistory.querySelector(".status-history-list");
    for (const entry of statusLog) {
      const itemNode = els.statusHistoryItemTemplate.content.cloneNode(true);
      itemNode.querySelector(".status-history-change").textContent =
        `${entry.old_status || "—"} → ${entry.new_status}`;
      itemNode.querySelector(".status-history-meta").textContent =
        `${entry.changed_by} · ${fullDateTimeLabel(new Date(entry.changed_at))}`;
      historyList.appendChild(itemNode);
    }
  } else {
    statusHistory.remove();
  }

  const actions = node.querySelector(".order-actions");

  const editBtn = document.createElement("button");
  editBtn.className = "btn-status btn-edit";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => openOrderModal(order));
  actions.appendChild(editBtn);

  const nextStatus = STATUS_FLOW[order.status];
  if (nextStatus) {
    const btn = document.createElement("button");
    btn.className = "btn-status";
    btn.textContent = `Mark ${nextStatus}`;
    btn.addEventListener("click", () => openStatusModal(order, nextStatus));
    actions.appendChild(btn);
  }

  const editStatusBtn = document.createElement("button");
  editStatusBtn.className = "btn-status btn-edit";
  editStatusBtn.textContent = "Edit Status";
  editStatusBtn.addEventListener("click", () => openStatusModal(order));
  actions.appendChild(editStatusBtn);

  const deleteBtn = document.createElement("button");
  deleteBtn.className = "btn-status btn-delete";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => deleteOrder(order));
  actions.appendChild(deleteBtn);

  return node;
}

function subscribeToRealtime() {
  supabaseClient
    .channel("special_orders_changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "special_orders" }, async () => {
      try {
        orders = await db.getOrders();
        renderOrders();
      } catch (err) {
        console.error(err);
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "special_order_lines" }, async () => {
      try {
        orders = await db.getOrders();
        renderOrders();
      } catch (err) {
        console.error(err);
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "order_status_log" }, async () => {
      try {
        orders = await db.getOrders();
        renderOrders();
      } catch (err) {
        console.error(err);
      }
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "customers" }, async () => {
      try {
        customers = await db.getCustomers();
        populateCustomerOptions();
      } catch (err) {
        console.error(err);
      }
    })
    .subscribe();
}
