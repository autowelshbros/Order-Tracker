// Supabase connection and data-access layer.
// Fill in SUPABASE_URL and SUPABASE_ANON_KEY from your Supabase project settings
// (Project Settings -> API). The anon key is safe to expose in client-side code
// as long as Row Level Security policies are set up per schema.sql.

const SUPABASE_URL = "https://qoxfplcbsvlbkkagwiyw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_A6Zw-3R9qKDEnND8rsXq6w_ompyc_9A";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Product category drives the standard units-per-container, since the same
// pack method holds a different standard count depending on what's in it
// (e.g. a Skid of bags vs. a Skid of boxes).
function productCategory(product) {
  if (/bag/i.test(product)) return "bag";
  if (/box/i.test(product)) return "box";
  return null;
}

// Returns the standard units-per-container for a given product + pack method,
// or null when there's no defined standard for that combination.
function getStandardUnitsPerPack(product, packMethod) {
  if (packMethod === "Bin") return 600;

  const category = productCategory(product);
  if (packMethod === "Skid") {
    if (category === "bag") return 30;
    if (category === "box") return 40;
    return null;
  }
  if (packMethod === "Rack") {
    if (category === "bag") return 21;
    return null;
  }
  return null;
}

const ORDER_STATUSES = ["OPEN", "PACKED", "SHIPPED"];

const db = {
  async getOrders() {
    const { data, error } = await supabaseClient
      .from("special_orders")
      .select("*, lines:special_order_lines(*), status_log:order_status_log(*)")
      .order("ship_date", { ascending: true })
      .order("id", { foreignTable: "special_order_lines", ascending: true })
      .order("changed_at", { foreignTable: "order_status_log", ascending: false });
    if (error) throw error;
    return data;
  },

  async createOrder(headerFields, lines) {
    const { data: order, error: orderError } = await supabaseClient
      .from("special_orders")
      .insert(headerFields)
      .select()
      .single();
    if (orderError) throw orderError;

    const { data: insertedLines, error: linesError } = await supabaseClient
      .from("special_order_lines")
      .insert(lines.map((line) => ({ ...line, order_id: order.id })))
      .select();
    if (linesError) throw linesError;

    return { ...order, lines: insertedLines };
  },

  async updateOrder(id, headerFields, lines) {
    const { data: order, error: orderError } = await supabaseClient
      .from("special_orders")
      .update(headerFields)
      .eq("id", id)
      .select()
      .single();
    if (orderError) throw orderError;

    const { error: deleteError } = await supabaseClient
      .from("special_order_lines")
      .delete()
      .eq("order_id", id);
    if (deleteError) throw deleteError;

    const { data: insertedLines, error: linesError } = await supabaseClient
      .from("special_order_lines")
      .insert(lines.map((line) => ({ ...line, order_id: id })))
      .select();
    if (linesError) throw linesError;

    return { ...order, lines: insertedLines };
  },

  async deleteOrder(id) {
    const { error } = await supabaseClient
      .from("special_orders")
      .delete()
      .eq("id", id);
    if (error) throw error;
  },

  async changeOrderStatus(id, oldStatus, newStatus, changedBy) {
    const { data: order, error: orderError } = await supabaseClient
      .from("special_orders")
      .update({ status: newStatus })
      .eq("id", id)
      .select()
      .single();
    if (orderError) throw orderError;

    const { data: logEntry, error: logError } = await supabaseClient
      .from("order_status_log")
      .insert({ order_id: id, old_status: oldStatus, new_status: newStatus, changed_by: changedBy })
      .select()
      .single();
    if (logError) throw logError;

    return { order, logEntry };
  },

  async getCustomers() {
    const { data, error } = await supabaseClient
      .from("customers")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;
    return data;
  },

  async createCustomer(name) {
    const { data, error } = await supabaseClient
      .from("customers")
      .insert({ name })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};
