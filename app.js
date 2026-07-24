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

let orders = [];
let customers = [];
let editingOrderId = null;

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

  els.dueDateInput = document.getElementById("due-date-input");
  els.destinationInput = document.getElementById("destination-input");
  els.notesInput = document.getElementById("notes-input");
  els.createdByInput = document.getElementById("created-by-input");

  els.statusFilter = document.getElementById("status-filter");
  els.sortOrder = document.getElementById("sort-order");
  els.dayFilter = document.getElementById("day-filter");
  els.clearDayFilterBtn = document.getElementById("clear-day-filter-btn");
  els.flaggedOnly = document.getElementById("flagged-only");

  els.orderList = document.getElementById("order-list");
  els.emptyState = document.getElementById("empty-state");
  els.loadingState = document.getElementById("loading-state");
  els.cardTemplate = document.getElementById("order-card-template");
  els.lineDisplayTemplate = document.getElementById("order-line-display-template");
}

function bindStaticEvents() {
  els.newOrderBtn.addEventListener("click", () => openOrderModal(null));
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

function fullDueDateLabel(date) {
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
  const unitsInput = row.querySelector(".line-units");
  const unitsHint = row.querySelector(".line-units-hint");
  const quantityInput = row.querySelector(".line-quantity");
  const removeBtn = row.querySelector(".remove-line-btn");

  packMethodSelect.addEventListener("change", () => {
    const defaultUnits = PACK_METHOD_DEFAULTS[packMethodSelect.value];
    if (defaultUnits != null) unitsInput.value = defaultUnits;
    unitsHint.textContent = defaultUnits != null ? `(standard: ${defaultUnits})` : "";
  });

  removeBtn.addEventListener("click", () => {
    row.remove();
    updateRemoveLineButtons();
  });

  if (line) {
    productSelect.value = line.product;
    packMethodSelect.value = line.pack_method;
    const defaultUnits = PACK_METHOD_DEFAULTS[line.pack_method];
    unitsHint.textContent = defaultUnits != null ? `(standard: ${defaultUnits})` : "";
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
    els.dueDateInput.value = toDatetimeLocalValue(order.due_date);
    els.destinationInput.value = order.destination || "";
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
      due_date: new Date(els.dueDateInput.value).toISOString(),
      destination: els.destinationInput.value.trim(),
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

async function advanceStatus(order) {
  const nextStatus = STATUS_FLOW[order.status];
  if (!nextStatus) return;
  try {
    const updated = await db.updateOrderStatus(order.id, nextStatus);
    const idx = orders.findIndex((o) => o.id === order.id);
    if (idx !== -1) orders[idx] = { ...orders[idx], ...updated };
    renderOrders();
  } catch (err) {
    console.error(err);
    alert("Failed to update status. Try again.");
  }
}

function isLineFlagged(line) {
  const standard = PACK_METHOD_DEFAULTS[line.pack_method];
  return standard != null && Number(line.units_per_pack) !== standard;
}

function orderHasFlaggedLine(order) {
  return (order.lines || []).some(isLineFlagged);
}

function renderOrders() {
  const statusValue = els.statusFilter.value;
  const sortDir = els.sortOrder.value;
  const flaggedOnly = els.flaggedOnly.checked;
  const dayValue = els.dayFilter.value;

  let visible = orders.filter((o) => statusValue === "ALL" || o.status === statusValue);
  if (flaggedOnly) visible = visible.filter(orderHasFlaggedLine);
  if (dayValue) visible = visible.filter((o) => localDateKey(new Date(o.due_date)) === dayValue);

  visible.sort((a, b) => {
    const diff = new Date(a.due_date) - new Date(b.due_date);
    return sortDir === "asc" ? diff : -diff;
  });

  els.orderList.innerHTML = "";
  els.emptyState.hidden = visible.length !== 0;

  let currentDayKey = null;
  for (const order of visible) {
    const dueDate = new Date(order.due_date);
    const dayKey = localDateKey(dueDate);
    if (dayKey !== currentDayKey) {
      currentDayKey = dayKey;
      const heading = document.createElement("h2");
      heading.className = "day-heading";
      heading.textContent = dayHeadingLabel(dueDate);
      els.orderList.appendChild(heading);
    }
    els.orderList.appendChild(buildOrderCard(order));
  }
}

function buildOrderCard(order) {
  const node = els.cardTemplate.content.cloneNode(true);
  const card = node.querySelector(".order-card");
  const flagged = orderHasFlaggedLine(order);

  card.classList.toggle("flagged", flagged);

  node.querySelector(".order-customer").textContent = order.customer;

  const badge = node.querySelector(".status-badge");
  badge.textContent = order.status;
  badge.classList.add(`status-${order.status.toLowerCase()}`);

  const linesList = node.querySelector(".order-lines");
  for (const line of order.lines) {
    const lineNode = els.lineDisplayTemplate.content.cloneNode(true);
    lineNode.querySelector(".line-summary").textContent =
      `${line.quantity} x ${line.pack_method} — ${line.product} (${line.units_per_pack}/pack)`;
    lineNode.querySelector(".flag-badge").hidden = !isLineFlagged(line);
    linesList.appendChild(lineNode);
  }

  const dueEl = node.querySelector(".order-due");
  const dueDate = new Date(order.due_date);
  dueEl.textContent = `Due: ${fullDueDateLabel(dueDate)}`;
  if (order.status !== "SHIPPED" && dueDate.getTime() < Date.now()) {
    dueEl.classList.add("overdue");
  }

  const destEl = node.querySelector(".order-destination");
  if (order.destination) {
    destEl.textContent = `To: ${order.destination}`;
  } else {
    destEl.remove();
  }

  const notesEl = node.querySelector(".order-notes");
  if (order.notes) {
    notesEl.textContent = order.notes;
  } else {
    notesEl.remove();
  }

  node.querySelector(".order-meta").textContent =
    `Created by ${order.created_by || "unknown"} on ${new Date(order.created_at).toLocaleDateString()}`;

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
    btn.addEventListener("click", () => advanceStatus(order));
    actions.appendChild(btn);
  }

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
