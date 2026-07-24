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
  populateProductOptions();

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
  els.productSelect = document.getElementById("product-select");
  els.packMethodSelect = document.getElementById("pack-method-select");
  els.unitsPerPackInput = document.getElementById("units-per-pack-input");
  els.unitsDefaultHint = document.getElementById("units-default-hint");
  els.quantityInput = document.getElementById("quantity-input");
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

  els.packMethodSelect.addEventListener("change", () => {
    const method = els.packMethodSelect.value;
    const defaultUnits = PACK_METHOD_DEFAULTS[method];
    if (defaultUnits != null) {
      els.unitsPerPackInput.value = defaultUnits;
    }
    updateUnitsHint(method);
  });

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

function updateUnitsHint(method) {
  const defaultUnits = PACK_METHOD_DEFAULTS[method];
  els.unitsDefaultHint.textContent = defaultUnits != null ? `(standard: ${defaultUnits})` : "";
}

function toDatetimeLocalValue(isoString) {
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function populateProductOptions() {
  for (const product of PRODUCTS) {
    const opt = document.createElement("option");
    opt.value = product;
    opt.textContent = product;
    els.productSelect.appendChild(opt);
  }
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

function openOrderModal(order) {
  els.orderForm.reset();
  els.newCustomerInput.hidden = true;
  els.unitsDefaultHint.textContent = "";
  els.formError.hidden = true;

  if (order) {
    editingOrderId = order.id;
    els.modalTitle.textContent = "Edit Order";
    els.saveOrderBtn.textContent = "Save Changes";

    els.customerSelect.value = order.customer;
    els.productSelect.value = order.product;
    els.packMethodSelect.value = order.pack_method;
    updateUnitsHint(order.pack_method);
    els.unitsPerPackInput.value = order.units_per_pack;
    els.quantityInput.value = order.quantity;
    els.dueDateInput.value = toDatetimeLocalValue(order.due_date);
    els.destinationInput.value = order.destination || "";
    els.notesInput.value = order.notes || "";
    els.createdByInput.value = order.created_by || "";
  } else {
    editingOrderId = null;
    els.modalTitle.textContent = "New Order";
    els.saveOrderBtn.textContent = "Save Order";
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

    const orderFields = {
      customer: customerName,
      product: els.productSelect.value,
      pack_method: els.packMethodSelect.value,
      units_per_pack: Number(els.unitsPerPackInput.value),
      quantity: Number(els.quantityInput.value),
      due_date: new Date(els.dueDateInput.value).toISOString(),
      destination: els.destinationInput.value.trim(),
      notes: els.notesInput.value.trim(),
      created_by: els.createdByInput.value.trim(),
    };

    if (editingOrderId) {
      const updated = await db.updateOrder(editingOrderId, orderFields);
      const idx = orders.findIndex((o) => o.id === editingOrderId);
      if (idx !== -1) orders[idx] = updated;
    } else {
      const saved = await db.createOrder({ ...orderFields, status: "OPEN" });
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
    if (idx !== -1) orders[idx] = updated;
    renderOrders();
  } catch (err) {
    console.error(err);
    alert("Failed to update status. Try again.");
  }
}

function isFlagged(order) {
  const standard = PACK_METHOD_DEFAULTS[order.pack_method];
  return standard != null && Number(order.units_per_pack) !== standard;
}

function renderOrders() {
  const statusValue = els.statusFilter.value;
  const sortDir = els.sortOrder.value;
  const flaggedOnly = els.flaggedOnly.checked;
  const dayValue = els.dayFilter.value;

  let visible = orders.filter((o) => statusValue === "ALL" || o.status === statusValue);
  if (flaggedOnly) visible = visible.filter(isFlagged);
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
  const flagged = isFlagged(order);

  card.classList.toggle("flagged", flagged);

  node.querySelector(".order-customer").textContent = order.customer;

  const badge = node.querySelector(".status-badge");
  badge.textContent = order.status;
  badge.classList.add(`status-${order.status.toLowerCase()}`);

  node.querySelector(".order-product").textContent = order.product;

  node.querySelector(".pack-summary").textContent =
    `${order.quantity} x ${order.pack_method} (${order.units_per_pack}/pack)`;
  node.querySelector(".flag-badge").hidden = !flagged;

  const dueEl = node.querySelector(".order-due");
  const dueDate = new Date(order.due_date);
  dueEl.textContent = `Due: ${dueDate.toLocaleString()}`;
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
