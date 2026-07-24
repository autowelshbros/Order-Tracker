// Supabase connection and data-access layer.
// Fill in SUPABASE_URL and SUPABASE_ANON_KEY from your Supabase project settings
// (Project Settings -> API). The anon key is safe to expose in client-side code
// as long as Row Level Security policies are set up per schema.sql.

const SUPABASE_URL = "https://qoxfplcbsvlbkkagwiyw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_A6Zw-3R9qKDEnND8rsXq6w_ompyc_9A";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const PACK_METHOD_DEFAULTS = {
  "Skid": 30,
  "Box": 40,
  "Rack": 21,
  "Bin": 21,
  "Other": null,
};

const ORDER_STATUSES = ["OPEN", "PACKED", "SHIPPED"];

const db = {
  async getOrders() {
    const { data, error } = await supabaseClient
      .from("special_orders")
      .select("*")
      .order("due_date", { ascending: true });
    if (error) throw error;
    return data;
  },

  async createOrder(order) {
    const { data, error } = await supabaseClient
      .from("special_orders")
      .insert(order)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateOrder(id, fields) {
    const { data, error } = await supabaseClient
      .from("special_orders")
      .update(fields)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateOrderStatus(id, status) {
    const { data, error } = await supabaseClient
      .from("special_orders")
      .update({ status })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
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
