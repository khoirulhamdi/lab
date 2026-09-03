export default async function handler(req, res) {
    const baseUrl = process.env.SUPABASE_GAS_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (!baseUrl) {
        return res.status(500).json({ error: "SUPABASE_GAS_URL belum disetting di Environment Variables Vercel" });
    }

    const headers = {};
    if (anonKey) {
        headers['apikey'] = anonKey;
        headers['Authorization'] = `Bearer ${anonKey}`;
    }

    try {
        if (req.method === 'POST') {
            const formBody = new URLSearchParams(req.body).toString();
            headers['Content-Type'] = 'application/x-www-form-urlencoded';

            const response = await fetch(baseUrl, {
                method: 'POST',
                headers,
                body: formBody
            });

            const data = await response.json();
            return res.status(200).json(data);

        } else {
            const query = new URLSearchParams(req.query).toString();
            const fetchUrl = query ? `${baseUrl}?${query}` : baseUrl;

            const response = await fetch(fetchUrl, { headers });
            const data = await response.json();

            return res.status(200).json(data);
        }
    } catch (error) {
        console.error("API Proxy Error:", error);
        return res.status(500).json({ error: "Gagal memproses request ke Supabase Edge Function." });
    }
}
