export default async function handler(req, res) {
    const url = process.env.SECRET_GAS_URL;

    if (!url) {
        return res.status(500).json({ error: "URL GAS belum disetting" });
    }

    try {
        if (req.method === 'POST') {
            const formBody = new URLSearchParams(req.body).toString();
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formBody
            });
            
            const data = await response.json();
            return res.status(200).json(data);
            
        } else {
            const query = new URLSearchParams(req.query).toString();
            const fetchUrl = query ? `${url}?${query}` : url;
            
            const response = await fetch(fetchUrl);
            const data = await response.json();
            
            return res.status(200).json(data);
        }
    } catch (error) {
        console.error("API Proxy Error:", error);
        return res.status(500).json({ error: "Gagal memproses request ke server Google." });
    }
}