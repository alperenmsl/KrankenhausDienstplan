import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://tpgosqlvukdxfjcvseue.supabase.co";
const supabaseAnonKey = "sb_publishable_ez1yYdlWnnmyVRVz0NGqpA_ATIohHSC";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
