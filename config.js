// Supabase 連線設定。
// 到 Supabase 後台 → Project Settings → API，複製 Project URL 和 anon public key 貼在下面。
// anon key 本來就是設計給前端用的公開金鑰；資料安全靠資料庫的 Row Level Security 把關。
// 保持原樣（YOUR-PROJECT）會進入「示範模式」，資料只存在這台瀏覽器。

export const SUPABASE_URL = 'https://chtcxazxiryjvpvpyoao.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_huhWTny90H4XG0-GZJyIaw_OGWLN1Y8';
